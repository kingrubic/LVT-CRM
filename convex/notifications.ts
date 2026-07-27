import { query } from "./_generated/server";
import {
  currentUserOrThrow,
  DUTY_ATTENDANCE_CONFIRMATION_DEFAULT,
  DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY,
  getBooleanSystemSetting,
  isOperationalManagerRole,
  isSameDepartmentSubordinate,
  resolveUserMenuAccess,
} from "./lib";

function participantOf(user: { _id: string; departmentId?: string }, duty: { departmentIds: string[]; participantUserIds: string[] }) {
  return duty.participantUserIds.some((id) => String(id) === String(user._id)) ||
    Boolean(user.departmentId && duty.departmentIds.some((id) => String(id) === String(user.departmentId)));
}

export const dutyAttendance = query({
  args: {},
  handler: async (ctx) => {
    const actor = await currentUserOrThrow(ctx);
    if (actor.status !== "active") throw new Error("USER_NOT_ACTIVE");
    if (actor.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
    const menuAccess = await resolveUserMenuAccess(ctx, actor);
    if (!isOperationalManagerRole(actor.role) && menuAccess.notifications === "hidden") {
      throw new Error("FORBIDDEN: notifications menu hidden");
    }

    const attendanceConfirmationEnabled = await getBooleanSystemSetting(
      ctx,
      DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY,
      DUTY_ATTENDANCE_CONFIRMATION_DEFAULT,
    );
    if (!attendanceConfirmationEnabled) {
      return { attendanceConfirmationEnabled: false, items: [] };
    }

    const [duties, users, departments, positions, attendances] = await Promise.all([
      ctx.db.query("duties").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("departments").collect(),
      ctx.db.query("positions").collect(),
      ctx.db.query("dutyAttendances").collect(),
    ]);
    const activeUsers = users.filter((user) => user.status === "active");
    const canViewAll = isOperationalManagerRole(actor.role) || menuAccess.notifications === "view_all";
    const subordinateUsers = activeUsers.filter((user) => isSameDepartmentSubordinate(actor, user, positions));
    const visibleUsers = canViewAll ? activeUsers : [actor, ...subordinateUsers];
    const visibleIds = new Set(visibleUsers.map((user) => String(user._id)));
    const departmentMap = new Map(departments.map((department) => [String(department._id), department.name]));
    const positionMap = new Map(positions.map((position) => [String(position._id), position.name]));
    const attendanceMap = new Map(
      attendances.map((attendance) => [`${String(attendance.dutyId)}:${String(attendance.userId)}`, attendance.status]),
    );

    const items = duties
      .filter((duty) => duty.active)
      .flatMap((duty) => {
        const participants = activeUsers.filter((user) => participantOf(user, duty) && visibleIds.has(String(user._id)));
        return participants.map((user) => ({
          _id: `${String(duty._id)}:${String(user._id)}`,
          dutyId: duty._id,
          dutyContent: duty.content,
          startDate: duty.startDate,
          endDate: duty.endDate,
          userId: user._id,
          userName: user.name || user.email || "Chưa đặt tên",
          departmentName: user.departmentId ? departmentMap.get(String(user.departmentId)) || "Chưa gán phòng ban" : "Chưa gán phòng ban",
          positionName: user.positionId ? positionMap.get(String(user.positionId)) || "" : "",
          status: attendanceMap.get(`${String(duty._id)}:${String(user._id)}`) || "pending",
        }));
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.userName.localeCompare(b.userName, "vi"));

    return { attendanceConfirmationEnabled: true, items };
  },
});
