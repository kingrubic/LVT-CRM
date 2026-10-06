import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  assertSchoolYearEditable,
  findOverlappingActiveYear,
  SCHOOL_YEAR_NAME_TAKEN,
  SCHOOL_YEAR_OVERLAP,
  validateSchoolYearInput,
} from "./homeroomCatalog";
import { homeroomActorOrThrow, homeroomCatalogWriterOrThrow, writeAudit } from "./homeroomContext";
import { normalizeDisplayName } from "./lib";
import { CALENDAR_KINDS } from "./homeroomAlerts";
import { assertYmd } from "./homeroomTime";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await homeroomActorOrThrow(ctx);
    const years = await ctx.db.query("schoolYears").collect();
    return years.sort((a, b) => b.startDate.localeCompare(a.startDate));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    attendanceUploadDueTime: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await homeroomCatalogWriterOrThrow(ctx);
    const input = validateSchoolYearInput(args);
    const years = await ctx.db.query("schoolYears").collect();
    if (years.some((year) => normalizeDisplayName(year.name) === normalizeDisplayName(input.name))) {
      throw new Error(SCHOOL_YEAR_NAME_TAKEN);
    }
    const active = args.active !== false;
    if (findOverlappingActiveYear(years, { ...input, active })) throw new Error(SCHOOL_YEAR_OVERLAP);
    const now = Date.now();
    const id = await ctx.db.insert("schoolYears", {
      ...input,
      active,
      createdBy: String(user._id),
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "schoolYear.create",
      details: JSON.stringify({ id, name: input.name }),
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.string(),
    name: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    attendanceUploadDueTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await homeroomCatalogWriterOrThrow(ctx);
    const current = await ctx.db.get(args.id as Id<"schoolYears">);
    if (!current) throw new Error("SCHOOL_YEAR_NOT_FOUND");
    assertSchoolYearEditable(current);
    const input = validateSchoolYearInput(args);
    const years = await ctx.db.query("schoolYears").collect();
    if (
      years.some(
        (year) =>
          String(year._id) !== args.id &&
          normalizeDisplayName(year.name) === normalizeDisplayName(input.name),
      )
    ) {
      throw new Error(SCHOOL_YEAR_NAME_TAKEN);
    }
    if (findOverlappingActiveYear(years, { ...input, active: current.active }, args.id)) {
      throw new Error(SCHOOL_YEAR_OVERLAP);
    }
    const now = Date.now();
    await ctx.db.patch(current._id, { ...input, updatedBy: String(user._id), updatedAt: now });
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "schoolYear.update",
      details: JSON.stringify({ id: args.id }),
    });
  },
});

export const setActive = mutation({
  args: { id: v.string(), active: v.boolean() },
  handler: async (ctx, args) => {
    const { user } = await homeroomCatalogWriterOrThrow(ctx);
    const current = await ctx.db.get(args.id as Id<"schoolYears">);
    if (!current) throw new Error("SCHOOL_YEAR_NOT_FOUND");
    assertSchoolYearEditable(current);
    const years = await ctx.db.query("schoolYears").collect();
    if (args.active && findOverlappingActiveYear(years, { ...current, active: true }, args.id)) {
      throw new Error(SCHOOL_YEAR_OVERLAP);
    }
    await ctx.db.patch(current._id, {
      active: args.active,
      updatedBy: String(user._id),
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "schoolYear.setActive",
      details: JSON.stringify({ id: args.id, active: args.active }),
    });
  },
});

export const lock = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const { user } = await homeroomCatalogWriterOrThrow(ctx);
    const current = await ctx.db.get(args.id as Id<"schoolYears">);
    if (!current) throw new Error("SCHOOL_YEAR_NOT_FOUND");
    const now = Date.now();
    await ctx.db.patch(current._id, {
      lockedAt: current.lockedAt || now,
      updatedBy: String(user._id),
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "schoolYear.lock",
      details: JSON.stringify({ id: args.id }),
    });
  },
});

/** Ngoại lệ lịch học của năm: ngày nghỉ (holiday) và ngày học bù (extra_teaching). Mặc định T2–T6 là ngày học. */
export const listCalendarDays = query({
  args: { schoolYearId: v.string(), from: v.optional(v.string()), to: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await homeroomActorOrThrow(ctx);
    const yearId = ctx.db.normalizeId("schoolYears", args.schoolYearId);
    const year = yearId ? await ctx.db.get(yearId) : null;
    if (!year) throw new Error("SCHOOL_YEAR_NOT_FOUND");
    const from = args.from ? assertYmd(args.from) : undefined;
    const to = args.to ? assertYmd(args.to) : undefined;
    const days = await ctx.db
      .query("schoolCalendarDays")
      .withIndex("by_year_date", (q) => {
        const base = q.eq("schoolYearId", args.schoolYearId);
        return from && to ? base.gte("date", from).lte("date", to) : base;
      })
      .collect();
    return {
      schoolYear: {
        _id: String(year._id),
        name: year.name,
        startDate: year.startDate,
        endDate: year.endDate,
        attendanceUploadDueTime: year.attendanceUploadDueTime,
      },
      days: days
        .map((row) => ({ _id: String(row._id), date: row.date, kind: row.kind, note: row.note || "" }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  },
});

export const upsertCalendarDay = mutation({
  args: {
    schoolYearId: v.string(),
    date: v.string(),
    kind: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await homeroomCatalogWriterOrThrow(ctx);
    const year = await ctx.db.get(args.schoolYearId as Id<"schoolYears">);
    if (!year) throw new Error("SCHOOL_YEAR_NOT_FOUND");
    assertSchoolYearEditable(year);
    if (!(CALENDAR_KINDS as readonly string[]).includes(args.kind)) throw new Error("INVALID_CALENDAR_DAY");
    const date = assertYmd(args.date);
    if (date < year.startDate || date > year.endDate) throw new Error("CALENDAR_DATE_OUTSIDE_YEAR");
    const note = args.note?.trim() || undefined;
    if (note && note.length > 120) throw new Error("INVALID_CALENDAR_NOTE");
    const existing = await ctx.db
      .query("schoolCalendarDays")
      .withIndex("by_year_date", (q) => q.eq("schoolYearId", args.schoolYearId).eq("date", date))
      .unique();
    const now = Date.now();
    let id;
    if (existing) {
      await ctx.db.patch(existing._id, {
        kind: args.kind,
        note,
        updatedBy: String(user._id),
        updatedAt: now,
      });
      id = existing._id;
    } else {
      id = await ctx.db.insert("schoolCalendarDays", {
        schoolYearId: args.schoolYearId,
        date,
        kind: args.kind,
        note,
        createdBy: String(user._id),
        createdAt: now,
        updatedAt: now,
      });
    }
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "schoolCalendar.upsert",
      details: JSON.stringify({ schoolYearId: args.schoolYearId, date, kind: args.kind }),
    });
    return id;
  },
});

export const removeCalendarDay = mutation({
  args: { schoolYearId: v.string(), date: v.string() },
  handler: async (ctx, args) => {
    const { user } = await homeroomCatalogWriterOrThrow(ctx);
    const year = await ctx.db.get(args.schoolYearId as Id<"schoolYears">);
    if (!year) throw new Error("SCHOOL_YEAR_NOT_FOUND");
    assertSchoolYearEditable(year);
    const date = assertYmd(args.date);
    const existing = await ctx.db
      .query("schoolCalendarDays")
      .withIndex("by_year_date", (q) => q.eq("schoolYearId", args.schoolYearId).eq("date", date))
      .unique();
    if (!existing) return;
    await ctx.db.delete(existing._id);
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "schoolCalendar.remove",
      details: JSON.stringify({ schoolYearId: args.schoolYearId, date }),
    });
  },
});
