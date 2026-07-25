import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const timestamps = { createdAt: v.number(), updatedAt: v.number() };

const menuAccessLevel = v.union(
  v.literal("hidden"),
  v.literal("view"),
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
    /** System role: only "admin" | "user". Admin has full power; user uses permission group. */
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
  /**
   * Permission groups (Nhóm quyền) control which system menus a regular user can see/edit.
   * Admin users ignore this and always see management + all menus.
   */
  permissionGroups: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    /** One entry per system menu: hidden | view | edit */
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
  /**
   * Legacy roles table kept optional for migration of older deployments.
   * New auth uses users.role (admin|user) + permissionGroups.
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
});
