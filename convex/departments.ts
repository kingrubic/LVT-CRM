import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertEntityCode } from "./entityCodes";
import { adminPermissionOrThrow, hasActiveNameConflict } from "./lib";

function cleanDepartment(args: { name: string; code: string }) {
  const name = args.name.trim();
  const code = assertEntityCode(args.code);
  if (!name || name.length > 120) throw new Error("INVALID_NAME");
  return { name, code };
}

async function assertDepartmentNameAvailable(ctx: { db: any }, name: string, excludeId?: string) {
  const departments = await ctx.db.query("departments").collect();
  if (hasActiveNameConflict(departments, name, excludeId)) {
    throw new Error("DEPARTMENT_NAME_TAKEN");
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await adminPermissionOrThrow(ctx, "departments:write");
    const [departments, users] = await Promise.all([
      ctx.db.query("departments").collect(),
      ctx.db.query("users").collect(),
    ]);
    return {
      departments: departments.sort((a, b) => a.name.localeCompare(b.name, "vi")),
      users: users.map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        status: u.status,
        departmentId: u.departmentId,
        role: u.role,
      })),
    };
  },
});

export const create = mutation({
  args: { name: v.string(), code: v.string() },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "departments:write");
    const input = cleanDepartment(args);
    const existing = await ctx.db
      .query("departments")
      .withIndex("by_code", (q) => q.eq("code", input.code))
      .unique();
    await assertDepartmentNameAvailable(ctx, input.name, existing && !existing.active ? existing._id : undefined);
    const now = Date.now();

    if (existing) {
      if (existing.active) throw new Error("CODE_TAKEN");
      // Soft-deleted code match → reactivate.
      await ctx.db.patch(existing._id, {
        ...input,
        active: true,
        updatedAt: now,
      });
      await ctx.db.insert("auditLogs", {
        actorUserId: actor.user._id,
        action: "department.reactivate",
        details: JSON.stringify({ id: existing._id, ...input }),
        at: now,
      });
      return existing._id;
    }

    const id = await ctx.db.insert("departments", {
      ...input,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "department.create",
      details: JSON.stringify({ id, ...input }),
      at: now,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("departments"),
    name: v.string(),
    code: v.string(),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "departments:write");
    const current = await ctx.db.get(args.id);
    if (!current) throw new Error("DEPARTMENT_NOT_FOUND");
    const input = cleanDepartment(args);
    const duplicate = await ctx.db
      .query("departments")
      .withIndex("by_code", (q) => q.eq("code", input.code))
      .unique();
    if (duplicate && duplicate._id !== args.id) throw new Error("CODE_TAKEN");
    await assertDepartmentNameAvailable(ctx, input.name, args.id);
    const now = Date.now();
    await ctx.db.patch(args.id, {
      ...input,
      active: args.active ?? current.active,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "department.update",
      details: JSON.stringify({ id: args.id, ...input, active: args.active ?? current.active }),
      at: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("departments") },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "departments:write");
    const current = await ctx.db.get(args.id);
    if (!current) throw new Error("DEPARTMENT_NOT_FOUND");
    const users = await ctx.db
      .query("users")
      .withIndex("by_department", (q) => q.eq("departmentId", args.id))
      .collect();
    if (users.length > 0) {
      throw new Error("HAS_ASSIGNED_USERS");
    }
    const now = Date.now();
    await ctx.db.patch(args.id, { active: false, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "department.remove",
      details: JSON.stringify({ id: args.id, code: current.code }),
      at: now,
    });
  },
});

export const assignUser = mutation({
  args: { departmentId: v.id("departments"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "departments:write");
    const department = await ctx.db.get(args.departmentId);
    if (!department?.active) throw new Error("INVALID_DEPARTMENT");
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    const now = Date.now();
    await ctx.db.patch(args.userId, {
      departmentId: args.departmentId,
      updatedAt: now,
      updatedBy: actor.user._id,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "department.assign_user",
      targetUserId: args.userId,
      targetEmail: user.email,
      details: JSON.stringify({ departmentId: args.departmentId }),
      at: now,
    });
  },
});

export const unassignUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "departments:write");
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    const now = Date.now();
    await ctx.db.patch(args.userId, {
      departmentId: undefined,
      updatedAt: now,
      updatedBy: actor.user._id,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "department.unassign_user",
      targetUserId: args.userId,
      targetEmail: user.email,
      at: now,
    });
  },
});
