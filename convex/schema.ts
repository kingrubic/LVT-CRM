import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const timestamps = { createdAt: v.number(), updatedAt: v.number() };

const menuAccessLevel = v.union(
  v.literal("hidden"),
  v.literal("view"),
  v.literal("view_all"),
  v.literal("edit"),
);

export default defineSchema({
  ...authTables,
  // Extend Convex Auth users with CRM profile/authorization fields.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // Legacy field retained as optional during migration; email is the only login identity.
    username: v.optional(v.string()),
    /** System role: admin | moderator | user. Only regular users use permission groups. */
    role: v.string(),
    departmentId: v.optional(v.string()),
    permissionGroupId: v.optional(v.string()),
    positionId: v.optional(v.string()),
    status: v.string(), // pending | active | disabled
    mustChangePassword: v.boolean(),
    lastPasswordResetAt: v.optional(v.number()),
    createdBy: v.optional(v.string()),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_status", ["status"])
    .index("by_department", ["departmentId"])
    .index("by_permission_group", ["permissionGroupId"])
    .index("by_position", ["positionId"]),
  departments: defineTable({
    name: v.string(),
    code: v.string(),
    active: v.boolean(),
    ...timestamps,
  }).index("by_code", ["code"]),
  /** Physical / organizational locations used by school workflows. */
  locations: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    active: v.boolean(),
    ...timestamps,
  }).index("by_name", ["name"]),
  /**
   * Permission groups (Nhóm quyền) control which system menus a regular user can see/edit.
   * Administrator and Moderator ignore this and always see all primary features.
   */
  permissionGroups: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    /** One entry per system menu: hidden | view | view_all | edit */
    menuAccess: v.array(
      v.object({
        menu: v.string(),
        access: menuAccessLevel,
      }),
    ),
    active: v.boolean(),
    ...timestamps,
  }).index("by_name", ["name"]),
  /**
   * Job positions (Chức vụ) with approval rank 1–5 (gold stars).
   * Higher rank may approve for lower ranks; full workflow uses this later.
   */
  positions: defineTable({
    name: v.string(),
    code: v.string(),
    level: v.number(), // 1 (lowest) … 5 (highest)
    active: v.boolean(),
    ...timestamps,
  }).index("by_code", ["code"]),
  /** Boarding-school participation periods, configured once per semester/school year. */
  boardingPeriods: defineTable({
    semester: v.number(), // 1 | 2
    schoolYear: v.string(), // YYYY-YYYY
    participantUserIds: v.array(v.string()),
    active: v.boolean(),
    createdBy: v.string(),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  }).index("by_school_year_semester", ["schoolYear", "semester"]),
  /**
   * Legacy roles table kept optional for migration of older deployments.
   * New auth uses users.role (admin|moderator|user) + permissionGroups.
   */
  roles: defineTable({
    name: v.string(),
    key: v.string(),
    permissions: v.array(v.string()),
    active: v.boolean(),
    ...timestamps,
  }).index("by_key", ["key"]),
  auditLogs: defineTable({
    actorUserId: v.string(),
    action: v.string(),
    targetUserId: v.optional(v.string()),
    targetEmail: v.optional(v.string()),
    details: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_at", ["at"])
    .index("by_target", ["targetUserId"]),
  /**
   * Approval action log for future workflows.
   * Higher-rank approvers may act on behalf of lower ranks; every action is recorded.
   */
  approvalLogs: defineTable({
    actorUserId: v.string(),
    actorPositionId: v.optional(v.string()),
    actorLevel: v.number(),
    targetUserId: v.optional(v.string()),
    targetLevel: v.optional(v.number()),
    taskId: v.optional(v.string()),
    action: v.string(), // approve | approve_on_behalf | reject
    onBehalfOfUserId: v.optional(v.string()),
    onBehalfOfLevel: v.optional(v.number()),
    details: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_at", ["at"])
    .index("by_task", ["taskId"])
    .index("by_actor", ["actorUserId"]),
  /**
   * School duties / work events (Công tác).
   * Participants = users in selected departments ∪ explicit participantUserIds.
   */
  duties: defineTable({
    startDate: v.string(), // YYYY-MM-DD
    endDate: v.string(),
    startTime: v.string(), // HH:mm
    endTime: v.string(),
    allDay: v.boolean(),
    content: v.string(),
    locationIds: v.array(v.string()),
    departmentIds: v.array(v.string()),
    participantUserIds: v.array(v.string()),
    active: v.boolean(),
    createdBy: v.string(),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_active_end", ["active", "endDate"])
    .index("by_start", ["startDate"]),
  dutyAttendances: defineTable({
    dutyId: v.string(),
    userId: v.string(),
    /** attended | absent | pending (no record treated as pending) */
    status: v.string(),
    updatedAt: v.number(),
    updatedBy: v.string(),
  })
    .index("by_duty", ["dutyId"])
    .index("by_user", ["userId"])
    .index("by_duty_user", ["dutyId", "userId"]),
  /** Admin-configurable display and workflow switches. */
  systemSettings: defineTable({
    key: v.string(),
    value: v.optional(v.boolean()),
    numberValues: v.optional(v.array(v.number())),
    stringValue: v.optional(v.string()),
    updatedBy: v.string(),
    ...timestamps,
  }).index("by_key", ["key"]),
  /** Per-user read receipts for deterministic in-app notification milestones. */
  notificationReads: defineTable({
    userId: v.string(),
    notificationKey: v.string(),
    readAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_key", ["userId", "notificationKey"]),
  /** Per-user hides for notification cards dismissed by users with edit access. */
  notificationDismissals: defineTable({
    userId: v.string(),
    notificationKey: v.string(),
    dismissedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_key", ["userId", "notificationKey"]),
  /**
   * Official documents assigned to a department. A document is visible to
   * its selected approvers first, then to the assigned department after all
   * approvals are complete.
   */
  officeDocuments: defineTable({
    fileId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    /** Legacy first assignment fields retained for existing rows. */
    departmentId: v.string(),
    content: v.string(),
    deadline: v.string(), // YYYY-MM-DD
    assignments: v.optional(
      v.array(
        v.object({
          /** department (default) | individual */
          type: v.optional(v.string()),
          departmentId: v.optional(v.string()),
          userIds: v.optional(v.array(v.string())),
          content: v.string(),
          deadline: v.string(),
        }),
      ),
    ),
    approverUserIds: v.array(v.string()),
    approvedByUserIds: v.array(v.string()),
    rejectedByUserIds: v.optional(v.array(v.string())),
    status: v.string(), // pending | approved | rejected
    active: v.boolean(),
    createdBy: v.string(),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_active_deadline", ["active", "deadline"])
    .index("by_department", ["departmentId"]),
  /**
   * Work generated from an official document.
   * assignmentType=department (default): collective task for live department roster.
   * assignmentType=individual: named assignees only.
   * In supervisor mode, personalTasks remain children of department rows.
   */
  workItems: defineTable({
    documentId: v.string(),
    departmentId: v.string(),
    assignmentType: v.optional(v.string()),
    assigneeUserIds: v.optional(v.array(v.string())),
    completedUserIds: v.optional(v.array(v.string())),
    completedLateUserIds: v.optional(v.array(v.string())),
    content: v.string(),
    deadline: v.string(), // YYYY-MM-DD
    active: v.boolean(),
    createdBy: v.string(),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_document", ["documentId"])
    .index("by_department", ["departmentId"])
    .index("by_active_deadline", ["active", "deadline"]),
  /**
   * Personal work items assigned by a level 2/3 department lead (supervisor mode)
   * to one or more lower-level colleagues in the same department.
   */
  personalTasks: defineTable({
    workItemId: v.string(),
    title: v.string(),
    assigneeUserIds: v.array(v.string()),
    completedUserIds: v.array(v.string()),
    completedLateUserIds: v.optional(v.array(v.string())),
    deadline: v.string(), // YYYY-MM-DD
    active: v.boolean(),
    createdBy: v.string(),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_work_item", ["workItemId"])
    .index("by_deadline", ["active", "deadline"]),
});
