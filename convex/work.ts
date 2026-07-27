import { v } from "convex/values";
import {
  activePositionLevel,
  currentUserOrThrow,
  getWorkAssignerMode,
  isOperationalManagerRole,
  operationalManagerPermissionOrThrow,
  resolveUserMenuAccess,
  WORK_ASSIGNER_MODE_ADMIN_MOD,
  WORK_ASSIGNER_MODE_SUPERVISOR,
} from "./lib";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = new Set(["pdf", "docx", "xlsx", "xls", "png", "jpg", "jpeg"]);

function todayInVietnam() {
  const date = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function extensionOf(fileName: string) {
  return fileName.trim().toLowerCase().split(".").pop() || "";
}

function assertDate(value: string) {
  const date = value.trim();
  if (!DATE_RE.test(date)) throw new Error("INVALID_WORK_DEADLINE");
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error("INVALID_WORK_DEADLINE");
  return date;
}

function assertContent(value: string) {
  const content = value.trim();
  if (!content || content.length > 2000) throw new Error("INVALID_WORK_CONTENT");
  return content;
}

function assignmentTypeOf(item: any): "department" | "individual" {
  return item?.assignmentType === "individual" ? "individual" : "department";
}

async function requireWorkAccess(ctx: any) {
  const user = await currentUserOrThrow(ctx);
  if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
  if (user.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  const menuAccess = await resolveUserMenuAccess(ctx, user);
  if (!isOperationalManagerRole(user.role) && menuAccess.work === "hidden") {
    throw new Error("FORBIDDEN: work menu hidden");
  }
  const positions = await ctx.db.query("positions").collect();
  return {
    user,
    access: isOperationalManagerRole(user.role) ? "edit" : menuAccess.work,
    isAdmin: isOperationalManagerRole(user.role),
    level: isOperationalManagerRole(user.role) ? 5 : activePositionLevel(user, positions),
    positions,
  };
}

function completionStatus(tasks: any[], today = todayInVietnam()) {
  if (!tasks.length) return "unassigned";
  const allCompleted = tasks.every((task) =>
    task.assigneeUserIds.every((id: string) =>
      task.completedUserIds.some((completedId: string) => String(completedId) === String(id)),
    ),
  );
  if (allCompleted) return "completed";
  if (tasks.some((task) => task.deadline < today)) return "not_completed";
  return "in_progress";
}

function memberCompletionStatus(
  members: { _id: string }[],
  completedUserIds: string[],
  deadline: string,
  today = todayInVietnam(),
) {
  if (!members.length) return "completed";
  const allCompleted = members.every((member) =>
    completedUserIds.some((id) => String(id) === String(member._id)),
  );
  if (allCompleted) return "completed";
  if (deadline < today) return "not_completed";
  return "in_progress";
}

function taskStatus(task: any, userId: string, today = todayInVietnam()) {
  const completed = task.completedUserIds.some((id: string) => String(id) === String(userId));
  if (completed) {
    const late = (task.completedLateUserIds || []).some((id: string) => String(id) === String(userId));
    return late ? "completed_late" : "completed";
  }
  if (task.deadline < today) return "overdue";
  return "pending";
}

function taskOverallStatus(task: any, today = todayInVietnam()) {
  const completed = task.assigneeUserIds.every((id: string) =>
    task.completedUserIds.some((completedId: string) => String(completedId) === String(id)),
  );
  if (completed) {
    const anyLate = task.assigneeUserIds.some((id: string) =>
      (task.completedLateUserIds || []).some((lateId: string) => String(lateId) === String(id)),
    );
    return anyLate ? "completed_late" : "completed";
  }
  if (task.deadline < today) return "overdue";
  return "pending";
}

function documentAssignments(document: any) {
  if (Array.isArray(document.assignments) && document.assignments.length) {
    return document.assignments;
  }
  return [{
    type: "department",
    departmentId: document.departmentId,
    content: document.content,
    deadline: document.deadline,
  }];
}

function overallCompletionStatus(statuses: string[]) {
  if (!statuses.length || statuses.every((status) => status === "unassigned")) return "unassigned";
  if (statuses.every((status) => status === "completed" || status === "completed_late")) {
    return statuses.some((status) => status === "completed_late") ? "completed_late" : "completed";
  }
  if (statuses.some((status) => status === "not_completed" || status === "overdue")) return "not_completed";
  return "in_progress";
}

async function catalog(ctx: any) {
  const [users, departments, positions] = await Promise.all([
    ctx.db.query("users").collect(),
    ctx.db.query("departments").collect(),
    ctx.db.query("positions").collect(),
  ]);
  const activeUsers = users.filter((user: any) => user.status === "active");
  const departmentMap = new Map(
    departments.map((department: any) => [String(department._id), department]),
  );
  const positionMap = new Map(
    positions.map((position: any) => [String(position._id), position]),
  );
  return { users, activeUsers, departments, positions, departmentMap, positionMap };
}

function individualAssigneeIdsForDocument(workItems: any[], documentId: string) {
  const ids = new Set<string>();
  for (const item of workItems) {
    if (String(item.documentId) !== String(documentId)) continue;
    if (assignmentTypeOf(item) !== "individual") continue;
    for (const userId of item.assigneeUserIds || []) ids.add(String(userId));
  }
  return ids;
}

/** Live department roster for collective tasks (admin_mod mode). */
function departmentRosterMembers(
  item: any,
  document: any,
  catalogData: any,
  excludedIndividualIds: Set<string>,
) {
  return catalogData.activeUsers.filter((user: any) => {
    if (String(user.departmentId || "") !== String(item.departmentId || "")) return false;
    if (isOperationalManagerRole(user.role)) return false;
    if ((document.approverUserIds || []).some((id: string) => String(id) === String(user._id))) {
      return false;
    }
    if (excludedIndividualIds.has(String(user._id))) return false;
    return true;
  });
}

function personView(user: any, catalogData: any, status?: string) {
  return {
    _id: user._id,
    name: user.name || user.email || "Chưa đặt tên",
    email: user.email || "",
    level: activePositionLevel(user, catalogData.positions),
    positionName:
      catalogData.positions.find((position: any) => String(position._id) === String(user.positionId))
        ?.name || "",
    ...(status ? { status } : {}),
  };
}

async function documentView(ctx: any, document: any, catalogData: any) {
  const rejectedByUserIds = document.rejectedByUserIds || [];
  const assignments = documentAssignments(document).map((assignment: any) => {
    const type = assignment.type === "individual" ? "individual" : "department";
    return {
      type,
      departmentId: assignment.departmentId || "",
      departmentName: assignment.departmentId
        ? catalogData.departmentMap.get(String(assignment.departmentId))?.name || "Chưa gán phòng ban"
        : "Cá nhân",
      userIds: assignment.userIds || [],
      content: assignment.content,
      deadline: assignment.deadline,
    };
  });
  const approvers = document.approverUserIds
    .map((id: string) => catalogData.activeUsers.find((user: any) => String(user._id) === String(id)))
    .filter(Boolean)
    .map((user: any) => ({
      _id: user._id,
      name: user.name || user.email || "Chưa đặt tên",
      email: user.email || "",
      level: activePositionLevel(user, catalogData.positions),
      approved: document.approvedByUserIds.some((id: string) => String(id) === String(user._id)),
      rejected: rejectedByUserIds.some((id: string) => String(id) === String(user._id)),
    }));
  return {
    _id: document._id,
    fileName: document.fileName,
    fileType: document.fileType,
    fileSize: document.fileSize,
    fileUrl: await ctx.storage.getUrl(document.fileId),
    content: document.content,
    deadline: document.deadline,
    status: document.status,
    departmentId: document.departmentId,
    departmentName: assignments.find((item: any) => item.type === "department")?.departmentName
      || assignments[0]?.departmentName
      || "Chưa gán phòng ban",
    assignments,
    assignmentCount: assignments.length,
    approvers,
    approvalCount: document.approvedByUserIds.length,
    approvalTotal: document.approverUserIds.length,
    createdAt: document.createdAt,
  };
}

function adminModItemStatus(item: any, members: any[], today = todayInVietnam()) {
  const completedUserIds = item.completedUserIds || [];
  if (assignmentTypeOf(item) === "individual") {
    const assignees = item.assigneeUserIds || [];
    if (!assignees.length) return "unassigned";
    const allDone = assignees.every((id: string) =>
      completedUserIds.some((completedId: string) => String(completedId) === String(id)),
    );
    if (allDone) {
      const anyLate = assignees.some((id: string) =>
        (item.completedLateUserIds || []).some((lateId: string) => String(lateId) === String(id)),
      );
      return anyLate ? "completed_late" : "completed";
    }
    if (item.deadline < today) return "not_completed";
    return "in_progress";
  }
  return memberCompletionStatus(members, completedUserIds, item.deadline, today);
}

function userItemStatus(item: any, userId: string, today = todayInVietnam()) {
  const completed = (item.completedUserIds || []).some((id: string) => String(id) === String(userId));
  if (completed) {
    const late = (item.completedLateUserIds || []).some((id: string) => String(id) === String(userId));
    return late ? "completed_late" : "completed";
  }
  if (item.deadline < today) return "overdue";
  return "pending_task";
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await operationalManagerPermissionOrThrow(ctx, "work:write");
    return await ctx.storage.generateUploadUrl();
  },
});

export const formOptions = query({
  args: {},
  handler: async (ctx) => {
    await operationalManagerPermissionOrThrow(ctx, "work:write");
    const assignerMode = await getWorkAssignerMode(ctx);
    const { activeUsers, departments, positions } = await catalog(ctx);
    return {
      assignerMode,
      departments: departments
        .filter((department: any) => department.active)
        .sort((a: any, b: any) => a.name.localeCompare(b.name, "vi"))
        .map((department: any) => ({
          _id: department._id,
          name: department.name,
          code: department.code,
        })),
      users: activeUsers
        .map((user: any) => ({
          _id: user._id,
          name: user.name || user.email || "Chưa đặt tên",
          email: user.email || "",
          role: user.role,
          departmentId: user.departmentId,
          departmentName:
            departments.find((department: any) => String(department._id) === String(user.departmentId))
              ?.name || "",
          positionName:
            positions.find((position: any) => String(position._id) === String(user.positionId))?.name
            || "",
          level: activePositionLevel(user, positions),
        }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name, "vi")),
      approvers: activeUsers
        .map((user: any) => ({
          _id: user._id,
          name: user.name || user.email || "Chưa đặt tên",
          email: user.email || "",
          departmentId: user.departmentId,
          departmentName:
            departments.find((department: any) => String(department._id) === String(user.departmentId))
              ?.name || "",
          positionName:
            positions.find((position: any) => String(position._id) === String(user.positionId))?.name
            || "",
          level: activePositionLevel(user, positions),
        }))
        .filter((user: any) => user.level >= 4)
        .sort((a: any, b: any) => b.level - a.level || a.name.localeCompare(b.name, "vi")),
    };
  },
});

export const createDocument = mutation({
  args: {
    fileId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    assignments: v.array(
      v.object({
        type: v.optional(v.union(v.literal("department"), v.literal("individual"))),
        departmentId: v.optional(v.string()),
        userIds: v.optional(v.array(v.string())),
        content: v.string(),
        deadline: v.string(),
      }),
    ),
    approverUserIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await operationalManagerPermissionOrThrow(ctx, "work:write");
    const fileName = args.fileName.trim();
    const extension = extensionOf(fileName);
    if (!fileName || fileName.length > 255 || !ACCEPTED_EXTENSIONS.has(extension)) {
      throw new Error("INVALID_WORK_FILE");
    }
    if (!Number.isFinite(args.fileSize) || args.fileSize <= 0 || args.fileSize > MAX_FILE_SIZE) {
      throw new Error("WORK_FILE_TOO_LARGE");
    }
    if (!args.assignments.length) throw new Error("WORK_ASSIGNMENTS_REQUIRED");

    const departments = await ctx.db.query("departments").collect();
    const users = await ctx.db.query("users").collect();
    const positions = await ctx.db.query("positions").collect();
    const activeUsers = users.filter((user: any) => user.status === "active");

    const assignments = args.assignments.map((assignment) => {
      const type = assignment.type === "individual" ? "individual" : "department";
      const content = assertContent(assignment.content);
      const deadline = assertDate(assignment.deadline);
      if (type === "department") {
        const departmentId = String(assignment.departmentId || "").trim();
        if (!departmentId) throw new Error("INVALID_DEPARTMENT");
        const department = departments.find((item: any) => String(item._id) === departmentId);
        if (!department?.active) throw new Error("INVALID_DEPARTMENT");
        return { type, departmentId, userIds: [] as string[], content, deadline };
      }
      const userIds = [...new Set((assignment.userIds || []).map((id) => String(id).trim()).filter(Boolean))];
      if (!userIds.length) throw new Error("WORK_ASSIGNEES_REQUIRED");
      for (const userId of userIds) {
        const target = activeUsers.find((user: any) => String(user._id) === userId);
        if (!target) throw new Error("INVALID_WORK_ASSIGNEE");
      }
      const firstUser = activeUsers.find((user: any) => String(user._id) === userIds[0]);
      return {
        type,
        departmentId: String(firstUser?.departmentId || ""),
        userIds,
        content,
        deadline,
      };
    });

    const departmentIds = assignments
      .filter((assignment) => assignment.type === "department")
      .map((assignment) => assignment.departmentId);
    if (new Set(departmentIds).size !== departmentIds.length) {
      throw new Error("WORK_DEPARTMENT_DUPLICATE");
    }

    const approverUserIds = [...new Set(args.approverUserIds.map((id) => id.trim()).filter(Boolean))];
    if (!approverUserIds.length) throw new Error("WORK_APPROVERS_REQUIRED");
    for (const userId of approverUserIds) {
      const approver = activeUsers.find((user: any) => String(user._id) === String(userId));
      if (!approver || activePositionLevel(approver, positions) < 4) {
        throw new Error("INVALID_WORK_APPROVER");
      }
    }

    const now = Date.now();
    const firstAssignment = assignments[0];
    const documentId = await ctx.db.insert("officeDocuments", {
      fileId: args.fileId,
      fileName,
      fileType: args.fileType.trim() || "application/octet-stream",
      fileSize: args.fileSize,
      departmentId: firstAssignment.departmentId || "",
      content: firstAssignment.content,
      deadline: firstAssignment.deadline,
      assignments: assignments.map((assignment) => ({
        type: assignment.type,
        departmentId: assignment.departmentId || undefined,
        userIds: assignment.type === "individual" ? assignment.userIds : undefined,
        content: assignment.content,
        deadline: assignment.deadline,
      })),
      approverUserIds,
      approvedByUserIds: [],
      rejectedByUserIds: [],
      status: "pending",
      active: true,
      createdBy: actor.user._id,
      updatedBy: actor.user._id,
      createdAt: now,
      updatedAt: now,
    });

    for (const assignment of assignments) {
      await ctx.db.insert("workItems", {
        documentId,
        departmentId: assignment.departmentId || "",
        assignmentType: assignment.type,
        assigneeUserIds: assignment.type === "individual" ? assignment.userIds : [],
        completedUserIds: [],
        completedLateUserIds: [],
        content: assignment.content,
        deadline: assignment.deadline,
        active: true,
        createdBy: actor.user._id,
        updatedBy: actor.user._id,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "work.document.create",
      details: JSON.stringify({
        documentId,
        assignmentCount: assignments.length,
        departmentCount: assignments.filter((item) => item.type === "department").length,
        individualCount: assignments.filter((item) => item.type === "individual").length,
        approverCount: approverUserIds.length,
      }),
      at: now,
    });
    return documentId;
  },
});

export const listAdmin = query({
  args: {},
  handler: async (ctx) => {
    await operationalManagerPermissionOrThrow(ctx, "work:write");
    const assignerMode = await getWorkAssignerMode(ctx);
    const [documents, workItems, personalTasks, catalogData] = await Promise.all([
      ctx.db.query("officeDocuments").collect(),
      ctx.db.query("workItems").collect(),
      ctx.db.query("personalTasks").collect(),
      catalog(ctx),
    ]);
    const activeDocuments = documents.filter((document: any) => document.active);
    const activeWorkItems = workItems.filter((item: any) => item.active);
    const views = await Promise.all(
      activeDocuments.map(async (document: any) => {
        const items = activeWorkItems.filter(
          (workItem: any) => String(workItem.documentId) === String(document._id),
        );
        const excludedIndividuals = individualAssigneeIdsForDocument(items, document._id);
        const assignmentViews = items.map((item: any) => {
          const type = assignmentTypeOf(item);
          if (assignerMode === WORK_ASSIGNER_MODE_ADMIN_MOD || type === "individual") {
            const members = type === "individual"
              ? (item.assigneeUserIds || [])
                  .map((id: string) =>
                    catalogData.activeUsers.find((user: any) => String(user._id) === String(id)),
                  )
                  .filter(Boolean)
              : departmentRosterMembers(item, document, catalogData, excludedIndividuals);
            const completedUserIds = item.completedUserIds || [];
            return {
              _id: item._id,
              type,
              departmentId: item.departmentId,
              departmentName:
                type === "individual"
                  ? "Cá nhân"
                  : String((catalogData.departmentMap.get(String(item.departmentId)) as any)?.name || "")
                    || "Chưa gán phòng ban",
              content: item.content,
              deadline: item.deadline,
              status: adminModItemStatus(item, members),
              taskCount: members.length,
              taskCompletedCount: members.filter((member: any) =>
                completedUserIds.some((id: string) => String(id) === String(member._id)),
              ).length,
              members: members.map((member: any) =>
                personView(member, catalogData, userItemStatus(item, String(member._id))),
              ),
            };
          }
          const tasks = personalTasks.filter(
            (task: any) => String(task.workItemId) === String(item._id) && task.active,
          );
          return {
            _id: item._id,
            type,
            departmentId: item.departmentId,
            departmentName:
              String((catalogData.departmentMap.get(String(item.departmentId)) as any)?.name || "")
              || "Chưa gán phòng ban",
            content: item.content,
            deadline: item.deadline,
            status: completionStatus(tasks),
            taskCount: tasks.length,
            taskCompletedCount: tasks.filter((task: any) =>
              task.assigneeUserIds.every((id: string) =>
                task.completedUserIds.some(
                  (completedId: string) => String(completedId) === String(id),
                ),
              ),
            ).length,
            members: [],
          };
        });
        return {
          ...(await documentView(ctx, document, catalogData)),
          assignments: assignmentViews,
          workStatus: overallCompletionStatus(
            assignmentViews.map((assignment: any) => assignment.status),
          ),
          taskCount: assignmentViews.reduce(
            (total: number, assignment: any) => total + assignment.taskCount,
            0,
          ),
        };
      }),
    );
    return views.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const approveDocument = mutation({
  args: { documentId: v.id("officeDocuments") },
  handler: async (ctx, args) => {
    const access = await requireWorkAccess(ctx);
    if (access.isAdmin) throw new Error("ADMIN_USE_MANAGEMENT");
    if (access.level < 4) throw new Error("WORK_APPROVER_REQUIRED");
    const document = await ctx.db.get(args.documentId);
    if (!document?.active) throw new Error("WORK_DOCUMENT_NOT_FOUND");
    if (!document.approverUserIds.some((id: string) => String(id) === String(access.user._id))) {
      throw new Error("WORK_APPROVER_FORBIDDEN");
    }
    if (document.approvedByUserIds.some((id: string) => String(id) === String(access.user._id))) return;
    if (document.status !== "pending" || (document.rejectedByUserIds || []).length) {
      throw new Error("WORK_DOCUMENT_ALREADY_DECIDED");
    }
    const approvedByUserIds = [...document.approvedByUserIds, access.user._id];
    const status = document.approverUserIds.every((id: string) =>
      approvedByUserIds.some((approvedId: string) => String(approvedId) === String(id)),
    ) ? "approved" : "pending";
    await ctx.db.patch(args.documentId, {
      approvedByUserIds,
      status,
      updatedBy: access.user._id,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: access.user._id,
      targetEmail: access.user.email,
      action: "work.document.approve",
      details: JSON.stringify({ documentId: args.documentId, status }),
      at: Date.now(),
    });
  },
});

export const rejectDocument = mutation({
  args: { documentId: v.id("officeDocuments") },
  handler: async (ctx, args) => {
    const access = await requireWorkAccess(ctx);
    if (access.isAdmin) throw new Error("ADMIN_USE_MANAGEMENT");
    if (access.level < 4) throw new Error("WORK_APPROVER_REQUIRED");
    const document = await ctx.db.get(args.documentId);
    if (!document?.active) throw new Error("WORK_DOCUMENT_NOT_FOUND");
    if (!document.approverUserIds.some((id: string) => String(id) === String(access.user._id))) {
      throw new Error("WORK_APPROVER_FORBIDDEN");
    }
    const rejectedByUserIds = document.rejectedByUserIds || [];
    if (rejectedByUserIds.some((id: string) => String(id) === String(access.user._id))) return;
    if (
      document.status !== "pending" ||
      document.approvedByUserIds.some((id: string) => String(id) === String(access.user._id))
    ) {
      throw new Error("WORK_DOCUMENT_ALREADY_DECIDED");
    }
    await ctx.db.patch(args.documentId, {
      rejectedByUserIds: [...rejectedByUserIds, access.user._id],
      status: "rejected",
      updatedBy: access.user._id,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: access.user._id,
      targetEmail: access.user.email,
      action: "work.document.reject",
      details: JSON.stringify({ documentId: args.documentId, status: "rejected" }),
      at: Date.now(),
    });
  },
});

export const createPersonalTask = mutation({
  args: {
    workItemId: v.id("workItems"),
    title: v.string(),
    assigneeUserIds: v.array(v.id("users")),
    deadline: v.string(),
  },
  handler: async (ctx, args) => {
    const assignerMode = await getWorkAssignerMode(ctx);
    if (assignerMode !== WORK_ASSIGNER_MODE_SUPERVISOR) {
      throw new Error("WORK_SUPERVISOR_MODE_REQUIRED");
    }
    const access = await requireWorkAccess(ctx);
    if (access.isAdmin || (access.level !== 2 && access.level !== 3)) {
      throw new Error("WORK_ASSIGNER_REQUIRED");
    }
    const item = await ctx.db.get(args.workItemId);
    if (!item?.active) throw new Error("WORK_ITEM_NOT_FOUND");
    if (assignmentTypeOf(item) === "individual") throw new Error("WORK_ITEM_NOT_ASSIGNABLE");
    if (String(item.departmentId) !== String(access.user.departmentId)) {
      throw new Error("WORK_DEPARTMENT_FORBIDDEN");
    }
    const document = await ctx.db.get(item.documentId as Id<"officeDocuments">);
    if (!document?.active || document.status !== "approved") throw new Error("WORK_NOT_APPROVED");
    const title = args.title.trim();
    if (!title || title.length > 200) throw new Error("INVALID_PERSONAL_WORK_TITLE");
    const deadline = assertDate(args.deadline);
    const selectedIds = [...new Set(args.assigneeUserIds.map((id) => String(id)))];
    if (!selectedIds.length) throw new Error("WORK_ASSIGNEES_REQUIRED");
    const users = await ctx.db.query("users").collect();
    const positions = await ctx.db.query("positions").collect();
    for (const userId of selectedIds) {
      const target = users.find((user: any) => String(user._id) === userId && user.status === "active");
      if (
        !target ||
        String(target.departmentId || "") !== String(access.user.departmentId || "") ||
        activePositionLevel(target, positions) >= access.level
      ) {
        throw new Error("INVALID_WORK_ASSIGNEE");
      }
    }
    const now = Date.now();
    return await ctx.db.insert("personalTasks", {
      workItemId: args.workItemId,
      title,
      assigneeUserIds: selectedIds,
      completedUserIds: [],
      completedLateUserIds: [],
      deadline,
      active: true,
      createdBy: access.user._id,
      updatedBy: access.user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const completePersonalTask = mutation({
  args: { taskId: v.id("personalTasks") },
  handler: async (ctx, args) => {
    const access = await requireWorkAccess(ctx);
    if (access.isAdmin) throw new Error("WORK_EXECUTOR_REQUIRED");
    const task = await ctx.db.get(args.taskId);
    if (!task?.active) throw new Error("PERSONAL_WORK_NOT_FOUND");
    if (!task.assigneeUserIds.some((id: string) => String(id) === String(access.user._id))) {
      throw new Error("PERSONAL_WORK_FORBIDDEN");
    }
    if (task.completedUserIds.some((id: string) => String(id) === String(access.user._id))) return;
    const late = task.deadline < todayInVietnam();
    await ctx.db.patch(args.taskId, {
      completedUserIds: [...task.completedUserIds, access.user._id],
      completedLateUserIds: late
        ? [...(task.completedLateUserIds || []), access.user._id]
        : (task.completedLateUserIds || []),
      updatedBy: access.user._id,
      updatedAt: Date.now(),
    });
  },
});

export const completeWorkItem = mutation({
  args: { workItemId: v.id("workItems") },
  handler: async (ctx, args) => {
    const assignerMode = await getWorkAssignerMode(ctx);
    if (assignerMode !== WORK_ASSIGNER_MODE_ADMIN_MOD) {
      throw new Error("WORK_ADMIN_MOD_MODE_REQUIRED");
    }
    const access = await requireWorkAccess(ctx);
    const item = await ctx.db.get(args.workItemId);
    if (!item?.active) throw new Error("WORK_ITEM_NOT_FOUND");
    const document = await ctx.db.get(item.documentId as Id<"officeDocuments">);
    if (!document?.active || document.status !== "approved") throw new Error("WORK_NOT_APPROVED");

    const catalogData = await catalog(ctx);
    const siblingItems = (await ctx.db.query("workItems").collect()).filter(
      (row: any) => row.active && String(row.documentId) === String(item.documentId),
    );
    const excludedIndividuals = individualAssigneeIdsForDocument(siblingItems, item.documentId);
    const type = assignmentTypeOf(item);
    let allowed = false;
    if (type === "individual") {
      allowed = (item.assigneeUserIds || []).some((id: string) => String(id) === String(access.user._id));
    } else {
      const members = departmentRosterMembers(item, document, catalogData, excludedIndividuals);
      allowed = members.some((member: any) => String(member._id) === String(access.user._id));
    }
    if (!allowed) throw new Error("WORK_ITEM_FORBIDDEN");

    const completedUserIds = item.completedUserIds || [];
    if (completedUserIds.some((id: string) => String(id) === String(access.user._id))) return;
    const late = item.deadline < todayInVietnam();
    await ctx.db.patch(args.workItemId, {
      completedUserIds: [...completedUserIds, access.user._id],
      completedLateUserIds: late
        ? [...(item.completedLateUserIds || []), access.user._id]
        : (item.completedLateUserIds || []),
      updatedBy: access.user._id,
      updatedAt: Date.now(),
    });
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireWorkAccess(ctx);
    const assignerMode = await getWorkAssignerMode(ctx);
    const [documents, workItems, personalTasks, catalogData] = await Promise.all([
      ctx.db.query("officeDocuments").collect(),
      ctx.db.query("workItems").collect(),
      ctx.db.query("personalTasks").collect(),
      catalog(ctx),
    ]);
    const activeDocuments = documents.filter((document: any) => document.active);
    const activeWorkItems = workItems.filter((item: any) => item.active);
    const docsById = new Map(activeDocuments.map((document: any) => [String(document._id), document]));
    const tasksByItem = new Map<string, any[]>();
    for (const task of personalTasks.filter((item: any) => item.active)) {
      const list = tasksByItem.get(String(task.workItemId)) || [];
      list.push(task);
      tasksByItem.set(String(task.workItemId), list);
    }

    const visibleApprovalDocs = access.level >= 4
      ? activeDocuments.filter((document: any) =>
          document.approverUserIds.some((id: string) => String(id) === String(access.user._id)),
        )
      : [];

    const approvalViews = await Promise.all(
      visibleApprovalDocs.map(async (document: any) => {
        const items = activeWorkItems.filter(
          (workItem: any) => String(workItem.documentId) === String(document._id),
        );
        const excludedIndividuals = individualAssigneeIdsForDocument(items, document._id);
        const assignments = items.map((item: any) => {
          if (assignerMode === WORK_ASSIGNER_MODE_ADMIN_MOD) {
            const type = assignmentTypeOf(item);
            const members = type === "individual"
              ? (item.assigneeUserIds || [])
                  .map((id: string) =>
                    catalogData.activeUsers.find((user: any) => String(user._id) === String(id)),
                  )
                  .filter(Boolean)
              : departmentRosterMembers(item, document, catalogData, excludedIndividuals);
            return {
              _id: item._id,
              type,
              departmentId: item.departmentId,
              departmentName:
                type === "individual"
                  ? "Cá nhân"
                  : String((catalogData.departmentMap.get(String(item.departmentId)) as any)?.name || "")
                    || "Chưa gán phòng ban",
              content: item.content,
              deadline: item.deadline,
              status: adminModItemStatus(item, members),
              taskCount: members.length,
            };
          }
          const tasks = tasksByItem.get(String(item._id)) || [];
          return {
            _id: item._id,
            type: assignmentTypeOf(item),
            departmentId: item.departmentId,
            departmentName:
              String((catalogData.departmentMap.get(String(item.departmentId)) as any)?.name || "")
              || "Chưa gán phòng ban",
            content: item.content,
            deadline: item.deadline,
            status: completionStatus(tasks),
            taskCount: tasks.length,
          };
        });
        return {
          ...(await documentView(ctx, document, catalogData)),
          assignments,
          workStatus: overallCompletionStatus(
            assignments.map((assignment: any) => assignment.status),
          ),
          taskCount: assignments.reduce(
            (total: number, assignment: any) => total + assignment.taskCount,
            0,
          ),
        };
      }),
    );

    if (assignerMode === WORK_ASSIGNER_MODE_ADMIN_MOD) {
      const myWorkItems = [];
      for (const item of activeWorkItems) {
        const document = docsById.get(String(item.documentId));
        if (!document || document.status !== "approved") continue;
        const siblings = activeWorkItems.filter(
          (row: any) => String(row.documentId) === String(item.documentId),
        );
        const excludedIndividuals = individualAssigneeIdsForDocument(siblings, item.documentId);
        const type = assignmentTypeOf(item);
        let members: any[] = [];
        let isMine = false;
        if (type === "individual") {
          members = (item.assigneeUserIds || [])
            .map((id: string) =>
              catalogData.activeUsers.find((user: any) => String(user._id) === String(id)),
            )
            .filter(Boolean);
          isMine = (item.assigneeUserIds || []).some(
            (id: string) => String(id) === String(access.user._id),
          );
        } else {
          members = departmentRosterMembers(item, document, catalogData, excludedIndividuals);
          isMine = members.some((member: any) => String(member._id) === String(access.user._id));
        }
        if (!isMine) continue;
        myWorkItems.push({
          _id: item._id,
          type,
          content: item.content,
          deadline: item.deadline,
          departmentId: item.departmentId,
          departmentName:
            type === "individual"
              ? "Cá nhân"
              : String((catalogData.departmentMap.get(String(item.departmentId)) as any)?.name || "")
                || "Chưa gán phòng ban",
          status: userItemStatus(item, String(access.user._id)),
          collectiveStatus: adminModItemStatus(item, members),
          documentContent: document.content,
          fileName: document.fileName,
          fileUrl: await ctx.storage.getUrl(document.fileId),
          members: type === "department"
            ? members.map((member: any) =>
                personView(member, catalogData, userItemStatus(item, String(member._id))),
              )
            : [],
          pendingMembers: type === "department"
            ? members
                .filter((member: any) => {
                  const status = userItemStatus(item, String(member._id));
                  return status === "pending_task" || status === "overdue";
                })
                .map((member: any) => personView(member, catalogData, userItemStatus(item, String(member._id))))
            : [],
        });
      }

      return {
        userId: access.user._id,
        level: access.level,
        isAdmin: access.isAdmin,
        assignerMode,
        assignableUsers: [],
        approvals: approvalViews.sort((a, b) => a.deadline.localeCompare(b.deadline)),
        departmentWorks: [],
        personalTasks: [],
        myTasks: myWorkItems.sort((a, b) => a.deadline.localeCompare(b.deadline)),
      };
    }

    // Supervisor mode (legacy)
    const visibleItems = access.level >= 2 && access.level <= 3
      ? activeWorkItems.filter((item: any) => {
          const document = docsById.get(String(item.documentId));
          return (
            document?.status === "approved" &&
            assignmentTypeOf(item) === "department" &&
            String(item.departmentId) === String(access.user.departmentId || "")
          );
        })
      : [];

    const departmentWorkViews = await Promise.all(
      visibleItems.map(async (item: any) => {
        const document = docsById.get(String(item.documentId));
        if (!document) return null;
        return {
          ...(await workItemViewWithContext(
            ctx,
            document,
            item,
            tasksByItem.get(String(item._id)) || [],
            catalogData,
          )),
          canAssign: access.level === 2 || access.level === 3,
        };
      }),
    );

    const personalTaskViews = await Promise.all(
      personalTasks
        .filter((task: any) =>
          task.active &&
          task.assigneeUserIds.some((id: string) => String(id) === String(access.user._id)),
        )
        .map(async (task: any) => {
          const item = activeWorkItems.find(
            (workItem: any) => String(workItem._id) === String(task.workItemId),
          );
          const document = item ? docsById.get(String(item.documentId)) : null;
          if (document && document.status !== "approved") return null;
          return {
            _id: task._id,
            title: task.title,
            deadline: task.deadline,
            status: taskStatus(task, String(access.user._id)),
            documentContent: document?.content || "",
            departmentName: item
              ? String((catalogData.departmentMap.get(String(item.departmentId)) as any)?.name || "")
              : "",
          };
        }),
    );

    return {
      userId: access.user._id,
      level: access.level,
      isAdmin: access.isAdmin,
      assignerMode,
      assignableUsers:
        access.level === 2 || access.level === 3
          ? catalogData.activeUsers
              .filter(
                (user: any) =>
                  String(user.departmentId || "") === String(access.user.departmentId || "") &&
                  activePositionLevel(user, catalogData.positions) < access.level,
              )
              .map((user: any) => ({
                _id: user._id,
                name: user.name || user.email || "Chưa đặt tên",
                positionName:
                  catalogData.positions.find(
                    (position: any) => String(position._id) === String(user.positionId),
                  )?.name || "Chưa gán chức vụ",
                email: user.email || "",
                level: activePositionLevel(user, catalogData.positions),
              }))
              .sort((a: any, b: any) => b.level - a.level || a.name.localeCompare(b.name, "vi"))
          : [],
      approvals: approvalViews.sort((a, b) => a.deadline.localeCompare(b.deadline)),
      departmentWorks: departmentWorkViews.filter(Boolean),
      personalTasks: personalTaskViews.filter(Boolean).sort((a: any, b: any) =>
        a.deadline.localeCompare(b.deadline),
      ),
      myTasks: [],
    };
  },
});

async function workItemViewWithContext(
  ctx: any,
  document: any,
  item: any,
  tasks: any[],
  catalogData: any,
) {
  const department = catalogData.departmentMap.get(String(item.departmentId));
  return {
    _id: item._id,
    documentId: item.documentId,
    content: item.content,
    deadline: item.deadline,
    departmentId: item.departmentId,
    departmentName: department?.name || "Chưa gán phòng ban",
    status: completionStatus(tasks),
    tasks: tasks.map((task: any) => ({
      _id: task._id,
      title: task.title,
      deadline: task.deadline,
      assigneeUserIds: task.assigneeUserIds,
      assignees: task.assigneeUserIds
        .map((id: string) => catalogData.activeUsers.find((user: any) => String(user._id) === String(id)))
        .filter(Boolean)
        .map((user: any) => ({
          _id: user._id,
          name: user.name || user.email || "Chưa đặt tên",
          email: user.email || "",
          level: activePositionLevel(user, catalogData.positions),
          status: taskStatus(task, String(user._id)),
        })),
      status: taskOverallStatus(task),
    })),
    document: await documentView(ctx, document, catalogData),
  };
}

export const badge = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireWorkAccess(ctx);
    const assignerMode = await getWorkAssignerMode(ctx);
    const [documents, workItems, personalTasks] = await Promise.all([
      ctx.db.query("officeDocuments").collect(),
      ctx.db.query("workItems").collect(),
      ctx.db.query("personalTasks").collect(),
    ]);
    const catalogData = await catalog(ctx);
    const activeDocuments = documents.filter((document: any) => document.active);
    const activeWorkItems = workItems.filter((item: any) => item.active);
    const docsById = new Map(activeDocuments.map((document: any) => [String(document._id), document]));
    const tasksByItem = new Map<string, any[]>();
    for (const task of personalTasks.filter((item: any) => item.active)) {
      const list = tasksByItem.get(String(task.workItemId)) || [];
      list.push(task);
      tasksByItem.set(String(task.workItemId), list);
    }

    let count = 0;
    if (access.level >= 4) {
      count += activeDocuments.filter((document: any) =>
        document.approverUserIds.some((id: string) => String(id) === String(access.user._id)) &&
        document.status === "pending" &&
        !document.approvedByUserIds.some((id: string) => String(id) === String(access.user._id)) &&
        !(document.rejectedByUserIds || []).some((id: string) => String(id) === String(access.user._id)),
      ).length;
    }

    if (assignerMode === WORK_ASSIGNER_MODE_ADMIN_MOD) {
      for (const item of activeWorkItems) {
        const document = docsById.get(String(item.documentId));
        if (!document || document.status !== "approved") continue;
        const siblings = activeWorkItems.filter(
          (row: any) => String(row.documentId) === String(item.documentId),
        );
        const excludedIndividuals = individualAssigneeIdsForDocument(siblings, item.documentId);
        const type = assignmentTypeOf(item);
        let isMine = false;
        if (type === "individual") {
          isMine = (item.assigneeUserIds || []).some(
            (id: string) => String(id) === String(access.user._id),
          );
        } else {
          const members = departmentRosterMembers(item, document, catalogData, excludedIndividuals);
          isMine = members.some((member: any) => String(member._id) === String(access.user._id));
        }
        if (isMine && userItemStatus(item, String(access.user._id)) !== "completed"
          && userItemStatus(item, String(access.user._id)) !== "completed_late") {
          count += 1;
        }
      }
      return { count, level: access.level, assignerMode };
    }

    if (access.level === 2 || access.level === 3) {
      count += activeWorkItems.filter((item: any) => {
        const document = docsById.get(String(item.documentId));
        return (
          document?.status === "approved" &&
          assignmentTypeOf(item) === "department" &&
          String(item.departmentId) === String(access.user.departmentId || "") &&
          completionStatus(tasksByItem.get(String(item._id)) || []) !== "completed"
        );
      }).length;
    } else {
      count += personalTasks.filter((task: any) =>
        task.active &&
        task.assigneeUserIds.some((id: string) => String(id) === String(access.user._id)) &&
        taskStatus(task, String(access.user._id)) !== "completed" &&
        taskStatus(task, String(access.user._id)) !== "completed_late",
      ).length;
    }
    return { count, level: access.level, assignerMode };
  },
});
