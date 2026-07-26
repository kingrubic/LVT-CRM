import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  activePositionLevel,
  currentUserOrThrow,
  isSameDepartmentSubordinate,
  resolveUserMenuAccess,
} from "./lib";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function mapNames(ids: string[], rows: { _id: string; name: string }[]) {
  const names = new Map(rows.map((row) => [String(row._id), row.name]));
  return ids
    .map((id) => names.get(String(id)))
    .filter((name): name is string => Boolean(name));
}

function userIsParticipant(
  user: { _id: string; departmentId?: string },
  duty: { departmentIds: string[]; participantUserIds: string[] },
) {
  if (duty.participantUserIds.some((id) => String(id) === String(user._id))) {
    return true;
  }
  return Boolean(
    user.departmentId &&
      duty.departmentIds.some((id) => String(id) === String(user.departmentId)),
  );
}

export const dutyCalendar = query({
  args: {
    userId: v.optional(v.id("users")),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const startDate = args.startDate.trim();
    const endDate = args.endDate.trim();
    if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate) || endDate < startDate) {
      throw new Error("INVALID_DATE_RANGE");
    }

    const actor = await currentUserOrThrow(ctx);
    if (actor.status !== "active") throw new Error("USER_NOT_ACTIVE");
    if (actor.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
    const menuAccess = await resolveUserMenuAccess(ctx, actor);
    if (actor.role !== "admin" && menuAccess.reports === "hidden") {
      throw new Error("FORBIDDEN: reports menu hidden");
    }

    const [users, positions, departments, locations, duties] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("positions").collect(),
      ctx.db.query("departments").collect(),
      ctx.db.query("locations").collect(),
      ctx.db.query("duties").collect(),
    ]);

    const activeUsers = users.filter((user) => user.status === "active");
    const canViewAll = actor.role === "admin" || menuAccess.reports === "view_all";
    const visibleUsers =
      canViewAll
        ? activeUsers
        : activeUsers.filter(
            (user) =>
              String(user._id) === String(actor._id) ||
              isSameDepartmentSubordinate(actor, user, positions),
          );
    const selectedUserId = String(args.userId || actor._id);
    const selectedUser = visibleUsers.find(
      (user) => String(user._id) === selectedUserId,
    );
    if (!selectedUser) throw new Error("REPORT_USER_FORBIDDEN");

    const attendances = await ctx.db
      .query("dutyAttendances")
      .withIndex("by_user", (q) => q.eq("userId", selectedUser._id))
      .collect();
    const attendanceMap = new Map(
      attendances.map((attendance) => [
        String(attendance.dutyId),
        attendance.status,
      ]),
    );
    const departmentMap = new Map(
      departments.map((department) => [String(department._id), department]),
    );
    const positionMap = new Map(
      positions.map((position) => [String(position._id), position]),
    );

    const people = visibleUsers
      .map((user) => {
        const department = user.departmentId
          ? departmentMap.get(String(user.departmentId))
          : undefined;
        const position = user.positionId
          ? positionMap.get(String(user.positionId))
          : undefined;
        return {
          _id: user._id,
          name: user.name || user.email || "Chưa đặt tên",
          email: user.email || "",
          isSelf: String(user._id) === String(actor._id),
          departmentName: department?.name || "",
          positionName: position?.name || "",
          positionLevel: activePositionLevel(user, positions),
        };
      })
      .sort(
        (a, b) =>
          Number(b.isSelf) - Number(a.isSelf) ||
          b.positionLevel - a.positionLevel ||
          a.name.localeCompare(b.name, "vi"),
      );

    const events = duties
      .filter(
        (duty) =>
          duty.active &&
          duty.startDate <= endDate &&
          duty.endDate >= startDate &&
          userIsParticipant(selectedUser, duty),
      )
      .map((duty) => ({
        _id: duty._id,
        content: duty.content,
        startDate: duty.startDate,
        endDate: duty.endDate,
        startTime: duty.startTime,
        endTime: duty.endTime,
        allDay: duty.allDay,
        locationNames: mapNames(duty.locationIds, locations),
        departmentNames: mapNames(duty.departmentIds, departments),
        assignmentType: duty.participantUserIds.some(
          (id) => String(id) === selectedUserId,
        )
          ? "individual"
          : "department",
        attendanceStatus:
          (attendanceMap.get(String(duty._id)) as string) || "pending",
      }))
      .sort(
        (a, b) =>
          a.startDate.localeCompare(b.startDate) ||
          a.startTime.localeCompare(b.startTime),
      );

    return {
      people,
      visibilityScope: canViewAll ? "all" : "team",
      selectedUserId: selectedUser._id,
      selectedUserName:
        selectedUser.name || selectedUser.email || "Chưa đặt tên",
      events,
    };
  },
});
