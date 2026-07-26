import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  adminPermissionOrThrow,
  defaultMenuAccess,
  hasActiveNameConflict,
  normalizeMenuAccess,
  SYSTEM_MENU_DEFS,
  type MenuAccess,
} from "./lib";

const accessValidator = v.union(
  v.literal("hidden"),
  v.literal("view"),
  v.literal("view_all"),
  v.literal("edit"),
);

function cleanGroup(args: {
  name: string;
  description?: string;
  menuAccess?: { menu: string; access: MenuAccess }[];
}) {
  const name = args.name.trim();
  if (!name || name.length > 120) throw new Error("INVALID_NAME");
  const description = args.description?.trim() || undefined;
  if (description && description.length > 500) throw new Error("INVALID_DESCRIPTION");
  const menuAccess = normalizeMenuAccess(args.menuAccess || defaultMenuAccess());
  const known = new Set(SYSTEM_MENU_DEFS.map((m) => m.id));
  for (const entry of menuAccess) {
    if (!known.has(entry.menu as (typeof SYSTEM_MENU_DEFS)[number]["id"])) {
      throw new Error("INVALID_MENU");
    }
  }
  return { name, description, menuAccess };
}

async function assertGroupNameAvailable(ctx: { db: any }, name: string, excludeId?: string) {
  const groups = await ctx.db.query("permissionGroups").collect();
  if (hasActiveNameConflict(groups, name, excludeId)) {
    throw new Error("PERMISSION_GROUP_NAME_TAKEN");
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await adminPermissionOrThrow(ctx, "permissionGroups:write");
    const [groups, users] = await Promise.all([
      ctx.db.query("permissionGroups").collect(),
      ctx.db.query("users").collect(),
    ]);
    return {
      groups: groups.sort((a, b) => a.name.localeCompare(b.name, "vi")),
      menus: SYSTEM_MENU_DEFS.map((m) => ({ id: m.id, label: m.label })),
      users: users.map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        status: u.status,
        permissionGroupId: u.permissionGroupId,
        role: u.role,
      })),
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    menuAccess: v.optional(
      v.array(v.object({ menu: v.string(), access: accessValidator })),
    ),
  },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "permissionGroups:write");
    const input = cleanGroup(args);
    await assertGroupNameAvailable(ctx, input.name);
    const now = Date.now();
    const id = await ctx.db.insert("permissionGroups", {
      ...input,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "permissionGroup.create",
      details: JSON.stringify({ id, name: input.name }),
      at: now,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("permissionGroups"),
    name: v.string(),
    description: v.optional(v.string()),
    menuAccess: v.optional(
      v.array(v.object({ menu: v.string(), access: accessValidator })),
    ),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "permissionGroups:write");
    const current = await ctx.db.get(args.id);
    if (!current) throw new Error("PERMISSION_GROUP_NOT_FOUND");
    const input = cleanGroup({
      name: args.name,
      description: args.description,
      menuAccess: args.menuAccess || current.menuAccess,
    });
    await assertGroupNameAvailable(ctx, input.name, args.id);
    const now = Date.now();
    await ctx.db.patch(args.id, {
      ...input,
      active: args.active ?? current.active,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "permissionGroup.update",
      details: JSON.stringify({ id: args.id, name: input.name }),
      at: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("permissionGroups") },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "permissionGroups:write");
    const current = await ctx.db.get(args.id);
    if (!current) throw new Error("PERMISSION_GROUP_NOT_FOUND");
    const now = Date.now();
    await ctx.db.patch(args.id, { active: false, updatedAt: now });
    const users = await ctx.db
      .query("users")
      .withIndex("by_permission_group", (q) => q.eq("permissionGroupId", args.id))
      .collect();
    for (const user of users) {
      await ctx.db.patch(user._id, {
        permissionGroupId: undefined,
        updatedAt: now,
        updatedBy: actor.user._id,
      });
    }
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "permissionGroup.remove",
      details: JSON.stringify({ id: args.id, clearedUsers: users.length }),
      at: now,
    });
  },
});

export const assignUser = mutation({
  args: { permissionGroupId: v.id("permissionGroups"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "permissionGroups:write");
    const group = await ctx.db.get(args.permissionGroupId);
    if (!group?.active) throw new Error("INVALID_PERMISSION_GROUP");
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    const now = Date.now();
    await ctx.db.patch(args.userId, {
      permissionGroupId: args.permissionGroupId,
      updatedAt: now,
      updatedBy: actor.user._id,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "permissionGroup.assign_user",
      targetUserId: args.userId,
      targetEmail: user.email,
      details: JSON.stringify({ permissionGroupId: args.permissionGroupId }),
      at: now,
    });
  },
});

export const unassignUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "permissionGroups:write");
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    const now = Date.now();
    await ctx.db.patch(args.userId, {
      permissionGroupId: undefined,
      updatedAt: now,
      updatedBy: actor.user._id,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "permissionGroup.unassign_user",
      targetUserId: args.userId,
      targetEmail: user.email,
      at: now,
    });
  },
});
