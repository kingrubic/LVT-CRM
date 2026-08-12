import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertEntityCode } from "./entityCodes";
import {
  adminPermissionOrThrow,
  assertPositionLevel,
  canApproveLevel,
  currentUserOrThrow,
  hasActiveNameConflict,
} from "./lib";

function cleanPosition(args: { name: string; code: string; level: number }) {
  const name = args.name.trim();
  const code = assertEntityCode(args.code);
  if (!name || name.length > 120) throw new Error("INVALID_NAME");
  assertPositionLevel(args.level);
  return { name, code, level: args.level };
}

async function assertPositionNameAvailable(ctx: { db: any }, name: string, excludeId?: string) {
  const positions = await ctx.db.query("positions").collect();
  if (hasActiveNameConflict(positions, name, excludeId)) {
    throw new Error("POSITION_NAME_TAKEN");
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await adminPermissionOrThrow(ctx, "positions:write");
    const [positions, users] = await Promise.all([
      ctx.db.query("positions").collect(),
      ctx.db.query("users").collect(),
    ]);
    return {
      positions: positions.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, "vi")),
      users: users.map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        status: u.status,
        positionId: u.positionId,
        role: u.role,
      })),
    };
  },
});

export const create = mutation({
  args: { name: v.string(), code: v.string(), level: v.number() },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "positions:write");
    const input = cleanPosition(args);
    const existing = await ctx.db
      .query("positions")
      .withIndex("by_code", (q) => q.eq("code", input.code))
      .unique();
    await assertPositionNameAvailable(ctx, input.name, existing && !existing.active ? existing._id : undefined);
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
        action: "position.reactivate",
        details: JSON.stringify({ id: existing._id, ...input }),
        at: now,
      });
      return existing._id;
    }

    const id = await ctx.db.insert("positions", {
      ...input,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "position.create",
      details: JSON.stringify({ id, ...input }),
      at: now,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("positions"),
    name: v.string(),
    code: v.string(),
    level: v.number(),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "positions:write");
    const current = await ctx.db.get(args.id);
    if (!current) throw new Error("POSITION_NOT_FOUND");
    const input = cleanPosition(args);
    const duplicate = await ctx.db
      .query("positions")
      .withIndex("by_code", (q) => q.eq("code", input.code))
      .unique();
    if (duplicate && duplicate._id !== args.id) throw new Error("CODE_TAKEN");
    await assertPositionNameAvailable(ctx, input.name, args.id);
    const now = Date.now();
    await ctx.db.patch(args.id, {
      ...input,
      active: args.active ?? current.active,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "position.update",
      details: JSON.stringify({ id: args.id, ...input }),
      at: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("positions") },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "positions:write");
    const current = await ctx.db.get(args.id);
    if (!current) throw new Error("POSITION_NOT_FOUND");
    const users = await ctx.db
      .query("users")
      .withIndex("by_position", (q) => q.eq("positionId", args.id))
      .collect();
    if (users.length > 0) {
      throw new Error("HAS_ASSIGNED_USERS");
    }
    const now = Date.now();
    await ctx.db.patch(args.id, { active: false, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "position.remove",
      details: JSON.stringify({ id: args.id, code: current.code }),
      at: now,
    });
  },
});

export const assignUser = mutation({
  args: { positionId: v.id("positions"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "positions:write");
    const position = await ctx.db.get(args.positionId);
    if (!position?.active) throw new Error("INVALID_POSITION");
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
    const now = Date.now();
    await ctx.db.patch(args.userId, {
      positionId: args.positionId,
      updatedAt: now,
      updatedBy: actor.user._id,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "position.assign_user",
      targetUserId: args.userId,
      targetEmail: user.email,
      details: JSON.stringify({ positionId: args.positionId, level: position.level }),
      at: now,
    });
  },
});

export const unassignUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "positions:write");
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    const now = Date.now();
    await ctx.db.patch(args.userId, {
      positionId: undefined,
      updatedAt: now,
      updatedBy: actor.user._id,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "position.unassign_user",
      targetUserId: args.userId,
      targetEmail: user.email,
      at: now,
    });
  },
});

/**
 * Check whether the current user may approve a target level (future task workflows).
 * Higher star rank can approve lower ranks; same/higher can act on multi-step chains.
 */
export const canApprove = query({
  args: { targetLevel: v.number() },
  handler: async (ctx, args) => {
    const user = await currentUserOrThrow(ctx);
    if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
    if (!user.positionId) return { allowed: false, actorLevel: 0, reason: "NO_POSITION" };
    const position = (await ctx.db.query("positions").collect()).find((p) => p._id === user.positionId);
    if (!position?.active) return { allowed: false, actorLevel: 0, reason: "INVALID_POSITION" };
    const allowed = canApproveLevel(position.level, args.targetLevel);
    return {
      allowed,
      actorLevel: position.level,
      targetLevel: args.targetLevel,
      canActOnBehalf: allowed || position.level === args.targetLevel,
    };
  },
});
