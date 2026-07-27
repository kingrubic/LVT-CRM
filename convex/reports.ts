import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  activePositionLevel,
  currentUserOrThrow,
  DUTY_ATTENDANCE_CONFIRMATION_DEFAULT,
  DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY,
  getBooleanSystemSetting,
  isOperationalManagerRole,
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

function todayInVietnam() {
  const date = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function workItemStatus(tasks: any[], today = todayInVietnam()) {
  if (!tasks.length) return "unassigned";
  const completed = tasks.every((task) =>
    task.assigneeUserIds.every((userId: string) =>
      task.completedUserIds.some(
        (completedUserId: string) => String(completedUserId) === String(userId),
      ),
    ),
  );
  if (completed) return "completed";
  if (tasks.some((task) => task.deadline < today)) return "overdue";
  return "pending";
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
    if (!isOperationalManagerRole(actor.role) && menuAccess.reports === "hidden") {
      throw new Error("FORBIDDEN: reports menu hidden");
    }

    const [users, positions, departments, locations, duties, attendanceConfirmationEnabled] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("positions").collect(),
      ctx.db.query("departments").collect(),
      ctx.db.query("locations").collect(),
      ctx.db.query("duties").collect(),
      getBooleanSystemSetting(
        ctx,
        DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY,
        DUTY_ATTENDANCE_CONFIRMATION_DEFAULT,
      ),
    ]);

    const activeUsers = users.filter((user) => user.status === "active");
    const canViewAll =
      isOperationalManagerRole(actor.role) || menuAccess.reports === "view_all";
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
          (attendanceMap.get(String(duty._id)) as string) ||
          (attendanceConfirmationEnabled ? "pending" : "attended"),
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
      attendanceConfirmationEnabled,
      events,
    };
  },
});

/** Calendar data for the Work report. Visibility follows the user's report permission and rank. */
export const workCalendar = query({
  args: {
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
    if (!isOperationalManagerRole(actor.role) && menuAccess.reports === "hidden") {
      throw new Error("FORBIDDEN: reports menu hidden");
    }

    const [documents, workItems, personalTasks, departments, positions] = await Promise.all([
      ctx.db.query("officeDocuments").collect(),
      ctx.db.query("workItems").collect(),
      ctx.db.query("personalTasks").collect(),
      ctx.db.query("departments").collect(),
      ctx.db.query("positions").collect(),
    ]);
    const activeDocuments = documents.filter((document) => document.active);
    const activeWorkItems = workItems.filter((item) => item.active);
    const activeTasks = personalTasks.filter((task) => task.active);
    const documentsById = new Map(activeDocuments.map((document) => [String(document._id), document]));
    const departmentsById = new Map(departments.map((department) => [String(department._id), department]));
    const tasksByWorkItem = new Map<string, typeof activeTasks>();
    for (const task of activeTasks) {
      const tasks = tasksByWorkItem.get(String(task.workItemId)) || [];
      tasks.push(task);
      tasksByWorkItem.set(String(task.workItemId), tasks);
    }

    const canViewAll =
      isOperationalManagerRole(actor.role) || menuAccess.reports === "view_all";
    const level = isOperationalManagerRole(actor.role)
      ? 5
      : activePositionLevel(actor, positions);
    const inRange = (deadline: string) => deadline >= startDate && deadline <= endDate;
    const events: Array<{
      _id: string;
      content: string;
      startDate: string;
      endDate: string;
      deadline: string;
      status: string;
      kind: string;
      kindLabel: string;
      departmentName: string;
      documentName: string;
    }> = [];

    if (canViewAll) {
      for (const document of activeDocuments) {
        if (!inRange(document.deadline) || !["approved", "pending"].includes(document.status)) continue;
        events.push({
          _id: String(document._id),
          content: document.fileName || document.content || "Công văn chưa đặt tên",
          startDate: document.deadline,
          endDate: document.deadline,
          deadline: document.deadline,
          status: document.status,
          kind: "document",
          kindLabel: "Công văn",
          departmentName: "Toàn trường",
          documentName: document.fileName || "Công văn",
        });
      }
    } else if (level === 2 || level === 3) {
      for (const item of activeWorkItems) {
        const document = documentsById.get(String(item.documentId));
        if (
          document?.status !== "approved" ||
          String(item.departmentId) !== String(actor.departmentId || "") ||
          !inRange(item.deadline)
        ) continue;
        events.push({
          _id: String(item._id),
          content: item.content,
          startDate: item.deadline,
          endDate: item.deadline,
          deadline: item.deadline,
          status: workItemStatus(tasksByWorkItem.get(String(item._id)) || []),
          kind: "department_work",
          kindLabel: "Việc phòng ban",
          departmentName:
            departmentsById.get(String(item.departmentId))?.name || "Chưa gán phòng ban",
          documentName: document.fileName || "Công văn",
        });
      }
    } else if (level === 1) {
      for (const task of activeTasks) {
        const item = activeWorkItems.find((workItem) => String(workItem._id) === String(task.workItemId));
        const document = item ? documentsById.get(String(item.documentId)) : undefined;
        if (
          !item ||
          document?.status !== "approved" ||
          !task.assigneeUserIds.some((userId) => String(userId) === String(actor._id)) ||
          !inRange(task.deadline)
        ) continue;
        const completed = task.completedUserIds.some(
          (userId) => String(userId) === String(actor._id),
        );
        events.push({
          _id: String(task._id),
          content: task.title,
          startDate: task.deadline,
          endDate: task.deadline,
          deadline: task.deadline,
          status: completed ? "completed" : task.deadline < todayInVietnam() ? "overdue" : "pending",
          kind: "personal_task",
          kindLabel: "Công việc cá nhân",
          departmentName:
            departmentsById.get(String(item.departmentId))?.name || "Chưa gán phòng ban",
          documentName: document.fileName || "Công văn",
        });
      }
    }

    events.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.content.localeCompare(b.content, "vi"));
    return {
      visibilityScope: canViewAll ? "all" : level === 2 || level === 3 ? "department" : "personal",
      events,
    };
  },
});
