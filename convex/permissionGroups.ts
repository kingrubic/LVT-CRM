import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertEntityCode, generateCodeFromName, normalizeEntityCode } from "./entityCodes";
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
  code: string;
  description?: string;
  menuAccess?: { menu: string; access: MenuAccess }[];
}) {
  const name = args.name.trim();
  const code = assertEntityCode(args.code);
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
  return { name, code, description, menuAccess };
}

async function assertGroupNameAvailable(ctx: { db: any }, name: string, excludeId?: string) {
  const groups = await ctx.db.query("permissionGroups").collect();
  if (hasActiveNameConflict(groups, name, excludeId)) {
    throw new Error("PERMISSION_GROUP_NAME_TAKEN");
  }
}

async function findGroupByCode(ctx: { db: any }, code: string) {
  const normalized = normalizeEntityCode(code);
  const groups = await ctx.db.query("permissionGroups").collect();
  return (
    groups.find((g: { code?: string }) => normalizeEntityCode(g.code || "") === normalized) || null
  );
}

async function releaseInactiveCodeIfNeeded(
  ctx: { db: any },
  code: string,
  keepId: string,
) {
  const duplicate = await findGroupByCode(ctx, code);
  if (!duplicate) return;
  if (String(duplicate._id) === String(keepId)) return;
  if (duplicate.active) throw new Error("CODE_TAKEN");
  // Soft-deleted group still holds the code — free it so an active group can reuse.
  await ctx.db.patch(duplicate._id, { code: undefined, updatedAt: Date.now() });
}

/** Backfill missing codes for legacy permission groups. Safe to call repeatedly. */
export const ensureCodes = mutation({
  args: {},
  handler: async (ctx) => {
    await adminPermissionOrThrow(ctx, "permissionGroups:write");
    const groups = await ctx.db.query("permissionGroups").collect();
    const used = new Set(
      groups.map((g) => normalizeEntityCode(g.code || "")).filter(Boolean),
    );
    const now = Date.now();
    let patched = 0;
    for (const group of groups) {
      // Only backfill missing codes. Invalid existing codes must be fixed by admin.
      if (group.code) continue;
      const code = generateCodeFromName(group.name, used);
      used.add(code);
      await ctx.db.patch(group._id, { code, updatedAt: now });
      patched += 1;
    }
    return { patched };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await adminPermissionOrThrow(ctx, "permissionGroups:write");
    const [groups, users] = await Promise.all([
      ctx.db.query("permissionGroups").collect(),
      ctx.db.query("users").collect(),
    ]);
    return {
      groups: groups
        .map((group) => ({ ...group, menuAccess: normalizeMenuAccess(group.menuAccess) }))
        .sort((a, b) => a.name.localeCompare(b.name, "vi")),
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
    code: v.string(),
    description: v.optional(v.string()),
    menuAccess: v.optional(
      v.array(v.object({ menu: v.string(), access: accessValidator })),
    ),
  },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "permissionGroups:write");
    const input = cleanGroup(args);
    const existing = await findGroupByCode(ctx, input.code);
    await assertGroupNameAvailable(ctx, input.name, existing && !existing.active ? existing._id : undefined);
    const now = Date.now();

    if (existing) {
      if (existing.active) throw new Error("CODE_TAKEN");
      await ctx.db.patch(existing._id, {
        ...input,
        active: true,
        updatedAt: now,
      });
      await ctx.db.insert("auditLogs", {
        actorUserId: actor.user._id,
        action: "permissionGroup.reactivate",
        details: JSON.stringify({ id: existing._id, name: input.name, code: input.code }),
        at: now,
      });
      return existing._id;
    }

    const id = await ctx.db.insert("permissionGroups", {
      ...input,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "permissionGroup.create",
      details: JSON.stringify({ id, name: input.name, code: input.code }),
      at: now,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("permissionGroups"),
    name: v.string(),
    code: v.string(),
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
      code: args.code,
      description: args.description,
      menuAccess: args.menuAccess || current.menuAccess,
    });
    await releaseInactiveCodeIfNeeded(ctx, input.code, args.id);
    const duplicate = await findGroupByCode(ctx, input.code);
    if (duplicate && String(duplicate._id) !== String(args.id)) throw new Error("CODE_TAKEN");
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
      details: JSON.stringify({ id: args.id, name: input.name, code: input.code }),
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
    const users = await ctx.db
      .query("users")
      .withIndex("by_permission_group", (q) => q.eq("permissionGroupId", args.id))
      .collect();
    if (users.length > 0) {
      throw new Error("HAS_ASSIGNED_USERS");
    }
    const now = Date.now();
    await ctx.db.patch(args.id, { active: false, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "permissionGroup.remove",
      details: JSON.stringify({ id: args.id, code: current.code }),
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
    if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
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
