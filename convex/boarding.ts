import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  currentUserOrThrow,
  isOperationalManagerRole,
  operationalManagerPermissionOrThrow,
  resolveUserMenuAccess,
} from "./lib";

const SCHOOL_YEAR_RE = /^(\d{4})-(\d{4})$/;

function cleanInput(args: {
  semester: number;
  schoolYear: string;
  participantUserIds: string[];
}) {
  if (args.semester !== 1 && args.semester !== 2) {
    throw new Error("INVALID_SEMESTER");
  }
  const schoolYear = args.schoolYear.trim();
  const match = schoolYear.match(SCHOOL_YEAR_RE);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw new Error("INVALID_SCHOOL_YEAR");
  }
  const participantUserIds = [
    ...new Set(
      (args.participantUserIds || [])
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
  if (!participantUserIds.length) throw new Error("BOARDING_TEACHERS_REQUIRED");
  return { semester: args.semester, schoolYear, participantUserIds };
}

async function assertParticipants(ctx: { db: any }, userIds: string[]) {
  for (const userId of userIds) {
    const user = await ctx.db.get(userId);
    if (!user || user.status !== "active") {
      throw new Error("INVALID_BOARDING_TEACHER");
    }
  }
}

async function assertUniquePeriod(
  ctx: { db: any },
  schoolYear: string,
  semester: number,
  excludeId?: string,
) {
  const matches = await ctx.db
    .query("boardingPeriods")
    .withIndex("by_school_year_semester", (q: any) =>
      q.eq("schoolYear", schoolYear).eq("semester", semester),
    )
    .collect();
  if (
    matches.some(
      (period: any) =>
        period.active && String(period._id) !== String(excludeId || ""),
    )
  ) {
    throw new Error("BOARDING_PERIOD_EXISTS");
  }
}

export const listAdmin = query({
  args: {},
  handler: async (ctx) => {
    await operationalManagerPermissionOrThrow(ctx, "boarding:write");
    const [periods, users, departments, positions] = await Promise.all([
      ctx.db.query("boardingPeriods").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("departments").collect(),
      ctx.db.query("positions").collect(),
    ]);
    const departmentMap = new Map(
      departments.map((department) => [String(department._id), department.name]),
    );
    const positionMap = new Map(
      positions.map((position) => [String(position._id), position.name]),
    );
    const activeUsers = users
      .filter((user) => user.status === "active")
      .map((user) => ({
        _id: user._id,
        name: user.name || user.email || "Chưa đặt tên",
        email: user.email || "",
        departmentName: user.departmentId
          ? departmentMap.get(String(user.departmentId)) || ""
          : "",
        positionName: user.positionId
          ? positionMap.get(String(user.positionId)) || ""
          : "",
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
    const userMap = new Map(
      activeUsers.map((user) => [String(user._id), user]),
    );

    return {
      users: activeUsers,
      periods: periods
        .filter((period) => period.active)
        .map((period) => ({
          ...period,
          participants: period.participantUserIds
            .map((userId) => userMap.get(String(userId)))
            .filter(Boolean),
        }))
        .sort(
          (a, b) =>
            b.schoolYear.localeCompare(a.schoolYear) ||
            b.semester - a.semester,
        ),
    };
  },
});

export const create = mutation({
  args: {
    semester: v.number(),
    schoolYear: v.string(),
    participantUserIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await operationalManagerPermissionOrThrow(ctx, "boarding:write");
    const input = cleanInput(args);
    await assertParticipants(ctx, input.participantUserIds);
    await assertUniquePeriod(ctx, input.schoolYear, input.semester);
    const now = Date.now();
    const id = await ctx.db.insert("boardingPeriods", {
      ...input,
      active: true,
      createdBy: actor.user._id,
      updatedBy: actor.user._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "boarding_period.create",
      details: JSON.stringify({
        id,
        semester: input.semester,
        schoolYear: input.schoolYear,
        participantCount: input.participantUserIds.length,
      }),
      at: now,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("boardingPeriods"),
    semester: v.number(),
    schoolYear: v.string(),
    participantUserIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await operationalManagerPermissionOrThrow(ctx, "boarding:write");
    const current = await ctx.db.get(args.id);
    if (!current?.active) throw new Error("BOARDING_PERIOD_NOT_FOUND");
    const input = cleanInput(args);
    await assertParticipants(ctx, input.participantUserIds);
    await assertUniquePeriod(
      ctx,
      input.schoolYear,
      input.semester,
      args.id,
    );
    const now = Date.now();
    await ctx.db.patch(args.id, {
      ...input,
      updatedBy: actor.user._id,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "boarding_period.update",
      details: JSON.stringify({
        id: args.id,
        semester: input.semester,
        schoolYear: input.schoolYear,
        participantCount: input.participantUserIds.length,
      }),
      at: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("boardingPeriods") },
  handler: async (ctx, args) => {
    const actor = await operationalManagerPermissionOrThrow(ctx, "boarding:write");
    const current = await ctx.db.get(args.id);
    if (!current?.active) throw new Error("BOARDING_PERIOD_NOT_FOUND");
    const now = Date.now();
    await ctx.db.patch(args.id, {
      active: false,
      updatedBy: actor.user._id,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "boarding_period.remove",
      details: JSON.stringify({ id: args.id }),
      at: now,
    });
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUserOrThrow(ctx);
    if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
    if (user.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
    const menuAccess = await resolveUserMenuAccess(ctx, user);
    if (!isOperationalManagerRole(user.role) && menuAccess.reports === "hidden") {
      throw new Error("FORBIDDEN: reports menu hidden");
    }
    const periods = await ctx.db.query("boardingPeriods").collect();
    return periods
      .filter(
        (period) =>
          period.active &&
          period.participantUserIds.some(
            (userId) => String(userId) === String(user._id),
          ),
      )
      .map((period) => ({
        _id: period._id,
        semester: period.semester,
        schoolYear: period.schoolYear,
        participantCount: period.participantUserIds.length,
      }))
      .sort(
        (a, b) =>
          b.schoolYear.localeCompare(a.schoolYear) ||
          b.semester - a.semester,
      );
  },
});

export const report = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const actor = await currentUserOrThrow(ctx);
    if (actor.status !== "active") throw new Error("USER_NOT_ACTIVE");
    if (actor.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
    const menuAccess = await resolveUserMenuAccess(ctx, actor);
    if (!isOperationalManagerRole(actor.role) && menuAccess.reports === "hidden") {
      throw new Error("FORBIDDEN: reports menu hidden");
    }

    const [periods, users, departments, positions] = await Promise.all([
      ctx.db.query("boardingPeriods").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("departments").collect(),
      ctx.db.query("positions").collect(),
    ]);
    const canViewAll =
      isOperationalManagerRole(actor.role) || menuAccess.reports === "view_all";
    const visibleUsers = canViewAll
      ? users.filter((user) => user.status === "active")
      : [actor];
    const selectedUserId = String(args.userId || actor._id);
    const selectedUser = visibleUsers.find(
      (user) => String(user._id) === selectedUserId,
    );
    if (!selectedUser) throw new Error("REPORT_USER_FORBIDDEN");

    const departmentMap = new Map(
      departments.map((department) => [String(department._id), department.name]),
    );
    const positionMap = new Map(
      positions.map((position) => [String(position._id), position.name]),
    );
    const people = visibleUsers
      .map((user) => ({
        _id: user._id,
        name: user.name || user.email || "Chưa đặt tên",
        email: user.email || "",
        isSelf: String(user._id) === String(actor._id),
        departmentName: user.departmentId
          ? departmentMap.get(String(user.departmentId)) || ""
          : "",
        positionName: user.positionId
          ? positionMap.get(String(user.positionId)) || ""
          : "",
      }))
      .sort(
        (a, b) =>
          Number(b.isSelf) - Number(a.isSelf) ||
          a.name.localeCompare(b.name, "vi"),
      );

    return {
      visibilityScope: canViewAll ? "all" : "self",
      people,
      selectedUserId: selectedUser._id,
      selectedUserName:
        selectedUser.name || selectedUser.email || "Chưa đặt tên",
      periods: periods
        .filter(
          (period) =>
            period.active &&
            period.participantUserIds.some(
              (userId) => String(userId) === String(selectedUser._id),
            ),
        )
        .map((period) => ({
          _id: period._id,
          semester: period.semester,
          schoolYear: period.schoolYear,
          participantCount: period.participantUserIds.length,
        }))
        .sort(
          (a, b) =>
            b.schoolYear.localeCompare(a.schoolYear) ||
            b.semester - a.semester,
        ),
    };
  },
});
