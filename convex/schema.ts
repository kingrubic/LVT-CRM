import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const timestamps = { createdAt: v.number(), updatedAt: v.number() };

export default defineSchema({
  users: defineTable({
    clerkUserId: v.optional(v.string()),
    username: v.string(),
    email: v.optional(v.string()),
    name: v.string(),
    role: v.string(),
    departmentId: v.optional(v.string()),
    status: v.string(), // pending | active | disabled
    mustChangePassword: v.boolean(),
    lastPasswordResetAt: v.optional(v.number()),
    createdBy: v.optional(v.string()),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_email", ["email"])
    .index("by_username", ["username"])
    .index("by_status", ["status"]),
  departments: defineTable({
    name: v.string(), code: v.string(), active: v.boolean(), ...timestamps,
  }).index("by_code", ["code"]),
  roles: defineTable({
    name: v.string(), key: v.string(), permissions: v.array(v.string()), active: v.boolean(), ...timestamps,
  }).index("by_key", ["key"]),
  auditLogs: defineTable({
    actorClerkUserId: v.string(), action: v.string(), targetClerkUserId: v.optional(v.string()), targetEmail: v.optional(v.string()), details: v.optional(v.string()), at: v.number(),
  }).index("by_at", ["at"]).index("by_target", ["targetClerkUserId"]),
});
