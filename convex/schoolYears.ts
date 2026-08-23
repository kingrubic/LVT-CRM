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
    if (!["working", "holiday", "extra_teaching"].includes(args.kind)) throw new Error("INVALID_CALENDAR_DAY");
    const existing = await ctx.db
      .query("schoolCalendarDays")
      .withIndex("by_year_date", (q) => q.eq("schoolYearId", args.schoolYearId).eq("date", args.date))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        kind: args.kind,
        note: args.note,
        updatedBy: String(user._id),
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("schoolCalendarDays", {
      schoolYearId: args.schoolYearId,
      date: args.date,
      kind: args.kind,
      note: args.note,
      createdBy: String(user._id),
      createdAt: now,
      updatedAt: now,
    });
  },
});
