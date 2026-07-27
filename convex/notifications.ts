import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  activePositionLevel,
  currentUserOrThrow,
  getBooleanSystemSetting,
  getNumberArraySystemSetting,
  getWorkAssignerMode,
  isOperationalManagerRole,
  NOTIFICATION_DUTIES_ENABLED_SETTING_KEY,
  NOTIFICATION_MILESTONES_DEFAULT,
  NOTIFICATION_MILESTONES_SETTING_KEY,
  NOTIFICATION_SOURCE_DEFAULT,
  NOTIFICATION_WORK_ENABLED_SETTING_KEY,
  resolveUserMenuAccess,
  WORK_ASSIGNER_MODE_ADMIN_MOD,
} from "./lib";

const HOUR_MS = 60 * 60 * 1000;
const VN_OFFSET_MS = 7 * HOUR_MS;
const OVERDUE_VISIBILITY_MS = 24 * HOUR_MS;

type NotificationSource = {
  kind: "duty" | "work";
  sourceType: "duty" | "approval" | "department_work" | "personal_task" | "completion_rejected";
  sourceId: string;
  title: string;
  description: string;
  dueAt: number;
  priority?: "high" | "normal";
};

function dutyDueAt(duty: { endDate: string; endTime: string }) {
  const [year, month, day] = duty.endDate.split("-").map(Number);
  const [hour, minute] = duty.endTime.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hour, minute) - VN_OFFSET_MS;
}

function workDueAt(deadline: string) {
  const [year, month, day] = deadline.split("-").map(Number);
  return Date.UTC(year, month - 1, day, 23, 59) - VN_OFFSET_MS;
}

function isDutyParticipant(
  user: { _id: string; departmentId?: string },
  duty: { departmentIds: string[]; participantUserIds: string[] },
) {
  return duty.participantUserIds.some((id) => String(id) === String(user._id)) ||
    Boolean(
      user.departmentId &&
      duty.departmentIds.some((id) => String(id) === String(user.departmentId)),
    );
}

function taskCompletedForAll(task: any) {
  return task.assigneeUserIds.every((id: string) =>
    task.completedUserIds.some((completedId: string) => String(completedId) === String(id)),
  );
}

function workItemCompleted(tasks: any[]) {
  return tasks.length > 0 && tasks.every(taskCompletedForAll);
}

function createMilestones(
  sources: NotificationSource[],
  milestonesHours: number[],
  now: number,
) {
  const prioritySources = sources.filter((source) => source.priority === "high");
  const regularSources = sources.filter((source) => source.priority !== "high");
  const priorityItems = prioritySources.map((source) => ({
    key: `${source.kind}:${source.sourceType}:${source.sourceId}:reject`,
    ...source,
    milestoneHours: -1,
    milestoneLabel: "Bị từ chối",
    availableAt: source.dueAt,
  }));
  const regularItems = regularSources
    .flatMap((source) =>
      milestonesHours
        .filter((hours) => now >= source.dueAt - hours * HOUR_MS)
        .map((hours) => ({
          key: `${source.kind}:${source.sourceType}:${source.sourceId}:${hours}`,
          ...source,
          milestoneHours: hours,
          milestoneLabel: hours === 0 ? "Đến hạn" : `Còn ${hours} giờ`,
          availableAt: source.dueAt - hours * HOUR_MS,
        })),
    )
    .filter((item) => item.dueAt >= now - OVERDUE_VISIBILITY_MS)
    .sort((a, b) => b.availableAt - a.availableAt || a.title.localeCompare(b.title, "vi"));
  return [...priorityItems, ...regularItems];
}

async function notificationContext(ctx: any) {
  const user = await currentUserOrThrow(ctx);
  if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
  if (user.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  const menuAccess = await resolveUserMenuAccess(ctx, user);
  if (!isOperationalManagerRole(user.role) && menuAccess.notifications === "hidden") {
    throw new Error("FORBIDDEN: notifications menu hidden");
  }
  return { user, menuAccess };
}

async function notificationItems(ctx: any, requestedNow?: number) {
  const { user, menuAccess } = await notificationContext(ctx);
  const [dutiesEnabled, workEnabled, milestonesHours] = await Promise.all([
    getBooleanSystemSetting(
      ctx,
      NOTIFICATION_DUTIES_ENABLED_SETTING_KEY,
      NOTIFICATION_SOURCE_DEFAULT,
    ),
    getBooleanSystemSetting(
      ctx,
      NOTIFICATION_WORK_ENABLED_SETTING_KEY,
      NOTIFICATION_SOURCE_DEFAULT,
    ),
    getNumberArraySystemSetting(
      ctx,
      NOTIFICATION_MILESTONES_SETTING_KEY,
      NOTIFICATION_MILESTONES_DEFAULT,
    ),
  ]);
  const canUseDuties =
    dutiesEnabled &&
    (isOperationalManagerRole(user.role) || menuAccess.duties !== "hidden");
  const canUseWork =
    workEnabled &&
    (isOperationalManagerRole(user.role) || menuAccess.work !== "hidden");

  const [duties, documents, workItems, personalTasks, positions, departments] = await Promise.all([
    canUseDuties ? ctx.db.query("duties").collect() : Promise.resolve([]),
    canUseWork ? ctx.db.query("officeDocuments").collect() : Promise.resolve([]),
    canUseWork ? ctx.db.query("workItems").collect() : Promise.resolve([]),
    canUseWork ? ctx.db.query("personalTasks").collect() : Promise.resolve([]),
    ctx.db.query("positions").collect(),
    ctx.db.query("departments").collect(),
  ]);
  const departmentMap = new Map(
    departments.map((department: any) => [String(department._id), department.name]),
  );
  const level = isOperationalManagerRole(user.role)
    ? 5
    : activePositionLevel(user, positions);
  const activeDocuments = documents.filter((document: any) => document.active);
  const activeWorkItems = workItems.filter((item: any) => item.active);
  const activeTasks = personalTasks.filter((task: any) => task.active);
  const documentsById = new Map(
    activeDocuments.map((document: any) => [String(document._id), document]),
  );
  const tasksByWorkItem = new Map<string, any[]>();
  for (const task of activeTasks) {
    const list = tasksByWorkItem.get(String(task.workItemId)) || [];
    list.push(task);
    tasksByWorkItem.set(String(task.workItemId), list);
  }

  const dutySources: NotificationSource[] = canUseDuties
    ? duties
        .filter(
          (duty: any) =>
            duty.active &&
            isDutyParticipant(user, duty),
        )
        .map((duty: any) => ({
          kind: "duty" as const,
          sourceType: "duty" as const,
          sourceId: String(duty._id),
          title: duty.content,
          description: `${duty.startDate} · ${duty.startTime}–${duty.endTime}`,
          dueAt: dutyDueAt(duty),
        }))
    : [];

  const assignerMode = await getWorkAssignerMode(ctx);
  const workSources: NotificationSource[] = [];
  if (canUseWork && level >= 4) {
    for (const document of activeDocuments) {
      const isApprover = document.approverUserIds.some(
        (id: string) => String(id) === String(user._id),
      );
      const hasActed =
        document.approvedByUserIds.some((id: string) => String(id) === String(user._id)) ||
        (document.rejectedByUserIds || []).some((id: string) => String(id) === String(user._id));
      if (document.status === "pending" && isApprover && !hasActed) {
        workSources.push({
          kind: "work",
          sourceType: "approval",
          sourceId: String(document._id),
          title: `Công văn cần duyệt: ${document.fileName}`,
          description: "Bạn được chỉ định duyệt công văn này.",
          dueAt: workDueAt(document.deadline),
        });
      }
    }
  }

  if (canUseWork && assignerMode === WORK_ASSIGNER_MODE_ADMIN_MOD) {
    const activeUsers = (await ctx.db.query("users").collect()).filter(
      (row: any) => row.status === "active",
    );
    for (const item of activeWorkItems) {
      const document = documentsById.get(String(item.documentId)) as any;
      if (document?.status !== "approved") continue;
      const completed = (item.completedUserIds || []).some(
        (id: string) => String(id) === String(user._id),
      );
      if (completed) continue;
      const pendingOrRejected = (item.completions || []).find(
        (completion: any) =>
          String(completion.userId) === String(user._id) &&
          (completion.status === "pending_approval" || completion.status === "rejected"),
      );
      // Rejected has its own high-priority card; pending approval shouldn't re-ping due milestones.
      if (pendingOrRejected?.status === "pending_approval") continue;
      if (pendingOrRejected?.status === "rejected") {
        // still show due? No — rejection card covers it; skip duplicate due items.
        continue;
      }
      const type = item.assignmentType === "individual" ? "individual" : "department";
      let isAssignee = false;
      if (type === "individual") {
        isAssignee = (item.assigneeUserIds || []).some(
          (id: string) => String(id) === String(user._id),
        );
      } else {
        const excluded = new Set<string>();
        for (const sibling of activeWorkItems) {
          if (String(sibling.documentId) !== String(item.documentId)) continue;
          if (sibling.assignmentType !== "individual") continue;
          for (const id of sibling.assigneeUserIds || []) excluded.add(String(id));
        }
        if (isOperationalManagerRole(user.role)) continue;
        if ((document.approverUserIds || []).some((id: string) => String(id) === String(user._id))) {
          continue;
        }
        if (excluded.has(String(user._id))) continue;
        isAssignee =
          String(user.departmentId || "") === String(item.departmentId || "") &&
          activeUsers.some((row: any) => String(row._id) === String(user._id));
      }
      if (!isAssignee) continue;
      workSources.push({
        kind: "work",
        sourceType: type === "individual" ? "personal_task" : "department_work",
        sourceId: String(item._id),
        title: item.content,
        description:
          type === "individual"
            ? "Công việc cá nhân cần hoàn thành."
            : `${departmentMap.get(String(item.departmentId)) || "Phòng ban"} · Công việc phòng ban`,
        dueAt: workDueAt(item.deadline),
      });
    }
  } else if (canUseWork && level >= 4) {
    for (const item of activeWorkItems) {
      const document = documentsById.get(String(item.documentId)) as any;
      const isApprover = document?.approverUserIds.some(
        (id: string) => String(id) === String(user._id),
      );
      if (
        document?.status === "approved" &&
        isApprover &&
        !workItemCompleted(tasksByWorkItem.get(String(item._id)) || [])
      ) {
        workSources.push({
          kind: "work",
          sourceType: "department_work",
          sourceId: String(item._id),
          title: item.content,
          description: `${departmentMap.get(String(item.departmentId)) || "Phòng ban"} · Công việc phòng ban`,
          dueAt: workDueAt(item.deadline),
        });
      }
    }
  } else if (canUseWork && (level === 2 || level === 3)) {
    for (const item of activeWorkItems) {
      const document = documentsById.get(String(item.documentId)) as any;
      if (
        document?.status === "approved" &&
        String(item.departmentId) === String(user.departmentId || "") &&
        !workItemCompleted(tasksByWorkItem.get(String(item._id)) || [])
      ) {
        workSources.push({
          kind: "work",
          sourceType: "department_work",
          sourceId: String(item._id),
          title: item.content,
          description: "Công việc của phòng ban cần hoàn thành.",
          dueAt: workDueAt(item.deadline),
        });
      }
    }
  } else if (canUseWork && level === 1) {
    for (const task of activeTasks) {
      const isAssigned = task.assigneeUserIds.some(
        (id: string) => String(id) === String(user._id),
      );
      const isCompleted = task.completedUserIds.some(
        (id: string) => String(id) === String(user._id),
      );
      const pendingRow = (task.completions || []).find(
        (completion: any) =>
          String(completion.userId) === String(user._id) &&
          (completion.status === "pending_approval" || completion.status === "rejected"),
      );
      if (isAssigned && !isCompleted && !pendingRow) {
        workSources.push({
          kind: "work",
          sourceType: "personal_task",
          sourceId: String(task._id),
          title: task.title,
          description: "Công việc cá nhân cần hoàn thành.",
          dueAt: workDueAt(task.deadline),
        });
      }
    }
  }

  if (canUseWork) {
    for (const item of activeWorkItems) {
      const row = (item.completions || []).find(
        (completion: any) =>
          String(completion.userId) === String(user._id) &&
          completion.status === "rejected",
      );
      if (!row) continue;
      workSources.push({
        kind: "work",
        sourceType: "completion_rejected",
        sourceId: String(item._id),
        title: `Bị từ chối: ${item.content}`,
        description: row.rejectionReason || "Task bị trả về — hãy hoàn thành lại sớm.",
        dueAt: row.reviewedAt || workDueAt(item.deadline),
        priority: "high",
      });
    }
    for (const task of activeTasks) {
      const row = (task.completions || []).find(
        (completion: any) =>
          String(completion.userId) === String(user._id) &&
          completion.status === "rejected",
      );
      if (!row) continue;
      workSources.push({
        kind: "work",
        sourceType: "completion_rejected",
        sourceId: String(task._id),
        title: `Bị từ chối: ${task.title}`,
        description: row.rejectionReason || "Task bị trả về — hãy hoàn thành lại sớm.",
        dueAt: row.reviewedAt || workDueAt(task.deadline),
        priority: "high",
      });
    }
  }

  const milestones = createMilestones(
    [...dutySources, ...workSources],
    milestonesHours,
    requestedNow && Math.abs(requestedNow - Date.now()) <= 5 * 60 * 1000
      ? requestedNow
      : Date.now(),
  );
  const [reads, dismissals] = await Promise.all([
    ctx.db
      .query("notificationReads")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect(),
    ctx.db
      .query("notificationDismissals")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect(),
  ]);
  const readMap = new Map(
    reads.map((read: any) => [read.notificationKey, read.readAt]),
  );
  const dismissedKeys = new Set(dismissals.map((item: any) => item.notificationKey));
  const items = milestones.filter((item) => !dismissedKeys.has(item.key)).map((item) => ({
    ...item,
    read: readMap.has(item.key),
    readAt: readMap.get(item.key) || null,
  }));
  return {
    items,
    unreadCount: items.filter((item) => !item.read).length,
    canDelete: menuAccess.notifications === "edit",
    settings: {
      dutiesEnabled,
      workEnabled,
      milestonesHours,
    },
  };
}

export const feed = query({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => notificationItems(ctx, args.now),
});

export const markRead = mutation({
  args: { notificationKey: v.string() },
  handler: async (ctx, args) => {
    const { user } = await notificationContext(ctx);
    const notificationKey = args.notificationKey.trim();
    if (!notificationKey || notificationKey.length > 300) {
      throw new Error("INVALID_NOTIFICATION_KEY");
    }
    const existing = await ctx.db
      .query("notificationReads")
      .withIndex("by_user_key", (q) =>
        q.eq("userId", user._id).eq("notificationKey", notificationKey),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("notificationReads", {
        userId: user._id,
        notificationKey,
        readAt: Date.now(),
      });
    }
  },
});

export const markAllRead = mutation({
  args: { notificationKeys: v.array(v.string()) },
  handler: async (ctx, args) => {
    const { user } = await notificationContext(ctx);
    const keys = [...new Set(args.notificationKeys.map((key) => key.trim()).filter(Boolean))];
    if (keys.length > 500 || keys.some((key) => key.length > 300)) {
      throw new Error("INVALID_NOTIFICATION_KEYS");
    }
    const existing = await ctx.db
      .query("notificationReads")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const existingKeys = new Set(existing.map((read) => read.notificationKey));
    const now = Date.now();
    for (const notificationKey of keys) {
      if (!existingKeys.has(notificationKey)) {
        await ctx.db.insert("notificationReads", {
          userId: user._id,
          notificationKey,
          readAt: now,
        });
      }
    }
  },
});

export const dismiss = mutation({
  args: { notificationKey: v.string() },
  handler: async (ctx, args) => {
    const { user, menuAccess } = await notificationContext(ctx);
    if (menuAccess.notifications !== "edit") {
      throw new Error("FORBIDDEN: notifications edit required");
    }
    const notificationKey = args.notificationKey.trim();
    if (!notificationKey || notificationKey.length > 300) {
      throw new Error("INVALID_NOTIFICATION_KEY");
    }
    const existing = await ctx.db
      .query("notificationDismissals")
      .withIndex("by_user_key", (q) =>
        q.eq("userId", user._id).eq("notificationKey", notificationKey),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("notificationDismissals", {
        userId: user._id,
        notificationKey,
        dismissedAt: Date.now(),
      });
    }
  },
});
