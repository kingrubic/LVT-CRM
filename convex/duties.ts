import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  assignmentCreatorOrThrow,
  activePositionLevel,
  currentUserOrThrow,
  DUTY_ATTENDANCE_CONFIRMATION_DEFAULT,
  DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY,
  getBooleanSystemSetting,
  isOperationalManagerRole,
  isSameDepartmentSubordinate,
  resolveUserMenuAccess,
  type MenuAccess,
} from "./lib";
import { canCreateAssignments, cleanDutyLocationText, dutyLocationLabel } from "./assignmentPolicy";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** School CRM wall-clock is Vietnam time (UTC+7, no DST). Docker/Convex often runs UTC. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Parse YYYY-MM-DD + HH:mm as Asia/Ho_Chi_Minh local time → epoch ms.
 * Do not use `new Date(y, m, d, h, min)` — that uses the server process timezone (UTC in Docker).
 */
function parseLocalMs(date: string, time: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  // Components are Vietnam local; convert to UTC epoch.
  return Date.UTC(y, m - 1, d, hh, mm, 0, 0) - VN_OFFSET_MS;
}

function cleanDutyInput(args: {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  content: string;
  locationText: string;
  departmentIds: string[];
  participantUserIds: string[];
}) {
  const startDate = args.startDate.trim();
  const endDate = args.endDate.trim();
  const startTime = args.startTime.trim();
  const endTime = args.endTime.trim();
  const content = args.content.trim();
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) throw new Error("INVALID_DATE");
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) throw new Error("INVALID_TIME");
  if (!content || content.length > 200) throw new Error("INVALID_CONTENT");
  const startMs = parseLocalMs(startDate, startTime);
  const endMs = parseLocalMs(endDate, endTime);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) throw new Error("INVALID_DATE");
  if (endMs < startMs) throw new Error("END_BEFORE_START");

  const uniq = (ids: string[]) => [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  return {
    startDate,
    endDate,
    startTime,
    endTime,
    allDay: Boolean(args.allDay),
    content,
    locationText: cleanDutyLocationText(args.locationText),
    locationIds: [] as string[],
    departmentIds: uniq(args.departmentIds || []),
    participantUserIds: uniq(args.participantUserIds || []),
  };
}

async function assertRefs(
  ctx: { db: any },
  input: {
    departmentIds: string[];
    participantUserIds: string[];
  },
  actor: { user: any; isOps: boolean; positions: any[] },
) {
  if (!actor.isOps && input.departmentIds.length) {
    throw new Error("DUTY_DEPARTMENT_FORBIDDEN");
  }
  if (input.departmentIds.length) {
    const departments = await ctx.db.query("departments").collect();
    for (const id of input.departmentIds) {
      const row = departments.find((d: any) => d._id === id);
      if (!row?.active) throw new Error("INVALID_DEPARTMENT");
    }
  }
  if (input.participantUserIds.length) {
    for (const id of input.participantUserIds) {
      const user = await ctx.db.get(id);
      if (!user || user.status !== "active") throw new Error("INVALID_PARTICIPANT");
      if (!actor.isOps && !isSameDepartmentSubordinate(actor.user, user, actor.positions)) {
        throw new Error("NOT_A_SUBORDINATE");
      }
    }
  }
  if (!input.departmentIds.length && !input.participantUserIds.length) {
    throw new Error("DUTY_PARTICIPANTS_REQUIRED");
  }
}

async function requireDutyWrite(ctx: any) {
  const actor = await assignmentCreatorOrThrow(ctx);
  if (actor.isOps) return actor;
  const menuAccess = await resolveUserMenuAccess(ctx, actor.user);
  if ((menuAccess.duties || "hidden") === "hidden") {
    throw new Error("FORBIDDEN: duties menu hidden");
  }
  return actor;
}

function canMutateDuty(actor: { user: any; isOps: boolean }, duty: { createdBy?: string }) {
  if (actor.isOps) return true;
  return String(duty.createdBy || "") === String(actor.user._id);
}

function userIsParticipant(
  user: { _id: string; departmentId?: string },
  duty: { departmentIds: string[]; participantUserIds: string[] },
): boolean {
  const userId = String(user._id);
  if (duty.participantUserIds.some((id) => String(id) === userId)) return true;
  if (user.departmentId && duty.departmentIds.some((id) => String(id) === String(user.departmentId))) {
    return true;
  }
  return false;
}

function resolveParticipantUsers(
  users: any[],
  duty: { departmentIds: string[]; participantUserIds: string[] },
) {
  return users
    .filter((u) => u.status === "active" && userIsParticipant(u, duty))
    .sort((a, b) => String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""), "vi"));
}

function deadlineMs(duty: { endDate: string; endTime: string }) {
  return parseLocalMs(duty.endDate, duty.endTime);
}

function startMs(duty: { startDate: string; startTime: string }) {
  return parseLocalMs(duty.startDate, duty.startTime);
}

function dutyTiming(duty: { startDate: string; startTime: string; endDate: string; endTime: string }, now = Date.now()) {
  const start = startMs(duty);
  const end = deadlineMs(duty);
  const isOngoing = now >= start && now <= end;
  const isOverdue = now > end;
  const isUpcoming = now < start;
  const msToEnd = end - now;
  // Near deadline only when upcoming (within 24h of end), never while ongoing or overdue.
  const nearDeadline =
    isUpcoming && msToEnd >= 0 && msToEnd <= 24 * 60 * 60 * 1000;
  return { start, end, isOngoing, isOverdue, isUpcoming, nearDeadline, msToEnd };
}

function mapNames(ids: string[], rows: { _id: string; name: string }[]) {
  const map = new Map(rows.map((r) => [String(r._id), r.name]));
  return ids.map((id) => map.get(String(id))).filter((name): name is string => Boolean(name));
}

async function requireDutiesAccess(ctx: any, min: "view" | "edit" = "view") {
  const user = await currentUserOrThrow(ctx);
  if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
  if (user.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  const menuAccess = await resolveUserMenuAccess(ctx, user);
  const access = (menuAccess.duties || "hidden") as MenuAccess;
  if (isOperationalManagerRole(user.role)) {
    return { user, access: "edit" as MenuAccess, isAdmin: true };
  }
  if (access === "hidden") throw new Error("FORBIDDEN: duties menu hidden");
  if (min === "edit" && access !== "edit") throw new Error("FORBIDDEN: duties edit required");
  return { user, access, isAdmin: false };
}

export const formOptions = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireDutyWrite(ctx);
    const [departments, users] = await Promise.all([
      ctx.db.query("departments").collect(),
      ctx.db.query("users").collect(),
    ]);
    const assignableUsers = users
      .filter((u) => {
        if (u.status !== "active") return false;
        if (actor.isOps) return true;
        return isSameDepartmentSubordinate(actor.user, u, actor.positions);
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi"))
      .map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        departmentId: u.departmentId,
      }));
    return {
      canCreate: true,
      isOps: actor.isOps,
      locations: [],
      departments: actor.isOps
        ? departments
            .filter((d) => d.active)
            .sort((a, b) => a.name.localeCompare(b.name, "vi"))
            .map((d) => ({ _id: d._id, name: d.name, code: d.code }))
        : [],
      users: assignableUsers,
    };
  },
});

export const listAdmin = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireDutyWrite(ctx);
    if (!actor.isOps) throw new Error("FORBIDDEN: operational manager role required");
    const [duties, locations, departments, users, attendances, attendanceConfirmationEnabled] = await Promise.all([
      ctx.db.query("duties").collect(),
      ctx.db.query("locations").collect(),
      ctx.db.query("departments").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("dutyAttendances").collect(),
      getBooleanSystemSetting(
        ctx,
        DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY,
        DUTY_ATTENDANCE_CONFIRMATION_DEFAULT,
      ),
    ]);

    const activeDuties = duties.filter((d) => d.active);
    const now = Date.now();
    const attByDuty = new Map<string, any[]>();
    for (const a of attendances) {
      const list = attByDuty.get(a.dutyId) || [];
      list.push(a);
      attByDuty.set(a.dutyId, list);
    }

    return {
      attendanceConfirmationEnabled,
      duties: activeDuties
        .map((duty) => {
        const timing = dutyTiming(duty, now);
        const participants = resolveParticipantUsers(users, duty);
        const attMap = new Map((attByDuty.get(duty._id) || []).map((a) => [a.userId, a.status]));
        return {
          ...duty,
          locationNames: [dutyLocationLabel(duty, mapNames(duty.locationIds, locations))].filter(Boolean),
          departmentNames: mapNames(duty.departmentIds, departments),
          participantNames: participants.map((u) => u.name || u.email || u._id),
          timing: {
            isOngoing: timing.isOngoing,
            isOverdue: timing.isOverdue,
            nearDeadline: timing.nearDeadline,
            isUpcoming: timing.isUpcoming,
            deadlineMs: timing.end,
          },
          participants: participants.map((u) => ({
            _id: u._id,
            name: u.name,
            email: u.email,
            departmentId: u.departmentId,
            status: (attMap.get(u._id) as string) || (attendanceConfirmationEnabled ? "pending" : "attended"),
          })),
        };
      })
      .sort((a, b) => a.timing.deadlineMs - b.timing.deadlineMs),
    };
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const { user, access, isAdmin } = await requireDutiesAccess(ctx, "view");
    const [duties, locations, departments, users, positions, attendances, attendanceConfirmationEnabled] = await Promise.all([
      ctx.db.query("duties").collect(),
      ctx.db.query("locations").collect(),
      ctx.db.query("departments").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("positions").collect(),
      ctx.db.query("dutyAttendances").collect(),
      getBooleanSystemSetting(
        ctx,
        DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY,
        DUTY_ATTENDANCE_CONFIRMATION_DEFAULT,
      ),
    ]);

    const attMap = new Map(attendances.map((a) => [`${String(a.dutyId)}:${String(a.userId)}`, a.status]));
    const canEdit = isAdmin || access === "edit";
    const canViewAll = !isAdmin && access === "view_all";
    const actorLevel = activePositionLevel(user, positions);
    const subordinateUsers = users.filter(
      (target) => target.status === "active" && isSameDepartmentSubordinate(user, target, positions),
    );
    const subordinateIds = new Set(subordinateUsers.map((target) => String(target._id)));
    const now = Date.now();
    const userNameMap = new Map(users.map((u) => [String(u._id), String(u.name || u.email || u._id)]));
    const positionNameMap = new Map(positions.map((position) => [String(position._id), String(position.name || "")]));
    const departmentNameMap = new Map(
      departments.map((department) => [String(department._id), String(department.name || "")]),
    );

    const mine = duties.filter((d) => {
      if (!d.active) return false;
      if (isAdmin || canViewAll) return true;
      if (String(d.createdBy || "") === String(user._id)) return true;
      return [user, ...subordinateUsers].some((visibleUser) => userIsParticipant(visibleUser, d));
    });
    return {
      canEdit,
      canCreate: canCreateAssignments(user.role, actorLevel),
      isAdmin,
      access,
      canViewAll,
      attendanceConfirmationEnabled,
      canManageSubordinates: attendanceConfirmationEnabled && !isAdmin && canEdit && actorLevel > 0,
      departmentId: user.departmentId || null,
      positionLevel: actorLevel,
      duties: mine
        .map((duty) => {
          const timing = dutyTiming(duty, now);
          const participants = resolveParticipantUsers(users, duty);
          const isMine = userIsParticipant(user, duty);
          const subordinateParticipants = participants
            .filter((participant) => subordinateIds.has(String(participant._id)))
            .map((participant) => ({
              _id: participant._id,
              name: participant.name,
              email: participant.email,
              departmentId: participant.departmentId,
              positionId: participant.positionId,
              positionLevel: activePositionLevel(participant, positions),
              positionName: positionNameMap.get(String(participant.positionId)) || "",
              status:
                (attMap.get(`${String(duty._id)}:${String(participant._id)}`) as string) ||
                (attendanceConfirmationEnabled ? "pending" : "attended"),
            }));
          const visibleParticipants = canViewAll
            ? participants.map((participant) => ({
                _id: participant._id,
                name: participant.name,
                email: participant.email,
                departmentName:
                  departmentNameMap.get(String(participant.departmentId)) || "Chưa gán phòng ban",
                positionName: positionNameMap.get(String(participant.positionId)) || "",
                status:
                  (attMap.get(`${String(duty._id)}:${String(participant._id)}`) as string) ||
                  (attendanceConfirmationEnabled ? "pending" : "attended"),
              }))
            : [];
          return {
            _id: duty._id,
            startDate: duty.startDate,
            endDate: duty.endDate,
            startTime: duty.startTime,
            endTime: duty.endTime,
            allDay: duty.allDay,
            createdAt: duty.createdAt,
            createdBy: duty.createdBy,
            content: duty.content,
            locationText: duty.locationText || dutyLocationLabel(duty, mapNames(duty.locationIds, locations)),
            locationNames: [dutyLocationLabel(duty, mapNames(duty.locationIds, locations))].filter(Boolean),
            departmentIds: duty.departmentIds,
            participantUserIds: duty.participantUserIds,
            canManage: isAdmin || String(duty.createdBy || "") === String(user._id),
            departmentNames: mapNames(duty.departmentIds, departments),
            departmentParticipants: duty.departmentIds.map((departmentId) => ({
              departmentName:
                departmentNameMap.get(String(departmentId)) || "Chưa gán phòng ban",
              participantNames: users
                .filter(
                  (candidate) =>
                    candidate.status === "active" &&
                    String(candidate.departmentId || "") === String(departmentId),
                )
                .map((candidate) => String(candidate.name || candidate.email || ""))
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b, "vi")),
            })),
            participantNames: duty.participantUserIds
              .map((id) => userNameMap.get(String(id)))
              .filter((name): name is string => Boolean(name)),
            // For user view: show individual assignees as selected; department members implied by dept list
            myStatus:
              (attMap.get(`${String(duty._id)}:${String(user._id)}`) as string) ||
              (attendanceConfirmationEnabled ? "pending" : "attended"),
            isMine,
            subordinateParticipants,
            visibleParticipants,
            timing: {
              isOngoing: timing.isOngoing,
              isOverdue: timing.isOverdue,
              nearDeadline: timing.nearDeadline,
              isUpcoming: timing.isUpcoming,
              deadlineMs: timing.end,
              canMarkAttendance: attendanceConfirmationEnabled && timing.isOngoing,
            },
            participantCount: participants.length,
          };
        })
        .sort((a, b) => b.createdAt - a.createdAt),
    };
  },
});

export const create = mutation({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    allDay: v.boolean(),
    content: v.string(),
    locationText: v.string(),
    departmentIds: v.array(v.string()),
    participantUserIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireDutyWrite(ctx);
    const input = cleanDutyInput(args);
    await assertRefs(ctx, input, actor);
    const now = Date.now();
    const id = await ctx.db.insert("duties", {
      ...input,
      active: true,
      createdBy: actor.user._id,
      updatedBy: actor.user._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "duty.create",
      details: JSON.stringify({ id, content: input.content }),
      at: now,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("duties"),
    startDate: v.string(),
    endDate: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    allDay: v.boolean(),
    content: v.string(),
    locationText: v.string(),
    departmentIds: v.array(v.string()),
    participantUserIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireDutyWrite(ctx);
    const current = await ctx.db.get(args.id);
    if (!current || !current.active) throw new Error("DUTY_NOT_FOUND");
    if (!canMutateDuty(actor, current)) throw new Error("DUTY_UPDATE_FORBIDDEN");
    const input = cleanDutyInput(args);
    await assertRefs(ctx, input, actor);
    const now = Date.now();
    await ctx.db.patch(args.id, {
      ...input,
      updatedBy: actor.user._id,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "duty.update",
      details: JSON.stringify({ id: args.id, content: input.content }),
      at: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("duties") },
  handler: async (ctx, args) => {
    const actor = await requireDutyWrite(ctx);
    const current = await ctx.db.get(args.id);
    if (!current) throw new Error("DUTY_NOT_FOUND");
    if (!canMutateDuty(actor, current)) throw new Error("DUTY_UPDATE_FORBIDDEN");
    const now = Date.now();
    await ctx.db.patch(args.id, { active: false, updatedAt: now, updatedBy: actor.user._id });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "duty.remove",
      details: JSON.stringify({ id: args.id }),
      at: now,
    });
  },
});

export const setAttendance = mutation({
  args: {
    dutyId: v.id("duties"),
    status: v.union(v.literal("attended"), v.literal("absent")),
  },
  handler: async (ctx, args) => {
    const attendanceConfirmationEnabled = await getBooleanSystemSetting(
      ctx,
      DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY,
      DUTY_ATTENDANCE_CONFIRMATION_DEFAULT,
    );
    if (!attendanceConfirmationEnabled) throw new Error("ATTENDANCE_CONFIRMATION_DISABLED");
    const { user, access } = await requireDutiesAccess(ctx, "edit");
    if (access !== "edit") throw new Error("FORBIDDEN: duties edit required");

    const duty = await ctx.db.get(args.dutyId);
    if (!duty?.active) throw new Error("DUTY_NOT_FOUND");
    if (!userIsParticipant(user, duty)) throw new Error("NOT_A_PARTICIPANT");

    const timing = dutyTiming(duty);
    if (!timing.isOngoing) throw new Error("ATTENDANCE_OUTSIDE_WINDOW");

    const existing = await ctx.db
      .query("dutyAttendances")
      .withIndex("by_duty_user", (q) => q.eq("dutyId", args.dutyId).eq("userId", user._id))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        updatedAt: now,
        updatedBy: user._id,
      });
    } else {
      await ctx.db.insert("dutyAttendances", {
        dutyId: args.dutyId,
        userId: user._id,
        status: args.status,
        updatedAt: now,
        updatedBy: user._id,
      });
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: user._id,
      action: "duty.attendance",
      targetUserId: user._id,
      details: JSON.stringify({ dutyId: args.dutyId, status: args.status }),
      at: now,
    });
  },
});

export const setAttendanceForUser = mutation({
  args: {
    dutyId: v.id("duties"),
    userId: v.id("users"),
    status: v.union(v.literal("attended"), v.literal("absent")),
  },
  handler: async (ctx, args) => {
    const attendanceConfirmationEnabled = await getBooleanSystemSetting(
      ctx,
      DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY,
      DUTY_ATTENDANCE_CONFIRMATION_DEFAULT,
    );
    if (!attendanceConfirmationEnabled) throw new Error("ATTENDANCE_CONFIRMATION_DISABLED");
    const { user, access, isAdmin } = await requireDutiesAccess(ctx, "edit");
    if (!isAdmin && access !== "edit") throw new Error("FORBIDDEN: duties edit required");

    const duty = await ctx.db.get(args.dutyId);
    if (!duty?.active) throw new Error("DUTY_NOT_FOUND");
    const target = await ctx.db.get(args.userId);
    if (!target || target.status !== "active") throw new Error("USER_NOT_FOUND");
    const positions = await ctx.db.query("positions").collect();
    if (!isAdmin && !isSameDepartmentSubordinate(user, target, positions)) {
      throw new Error("NOT_A_SUBORDINATE");
    }
    if (!userIsParticipant(target, duty)) throw new Error("NOT_A_PARTICIPANT");

    const timing = dutyTiming(duty);
    if (!timing.isOngoing) throw new Error("ATTENDANCE_OUTSIDE_WINDOW");

    const existing = await ctx.db
      .query("dutyAttendances")
      .withIndex("by_duty_user", (q) => q.eq("dutyId", args.dutyId).eq("userId", args.userId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        updatedAt: now,
        updatedBy: user._id,
      });
    } else {
      await ctx.db.insert("dutyAttendances", {
        dutyId: args.dutyId,
        userId: args.userId,
        status: args.status,
        updatedAt: now,
        updatedBy: user._id,
      });
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: user._id,
      action: "duty.attendance_for_subordinate",
      targetUserId: target._id,
      targetEmail: target.email,
      details: JSON.stringify({ dutyId: args.dutyId, status: args.status }),
      at: now,
    });
  },
});
