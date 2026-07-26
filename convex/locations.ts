import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { adminPermissionOrThrow, hasActiveNameConflict } from "./lib";

function cleanLocation(args: { name: string; description?: string }) {
  const name = args.name.trim();
  const description = args.description?.trim() || undefined;
  if (!name || name.length > 120) throw new Error("INVALID_NAME");
  if (description && description.length > 1000) throw new Error("INVALID_DESCRIPTION");
  return { name, description };
}

async function assertLocationNameAvailable(ctx: { db: any }, name: string, excludeId?: string) {
  const locations = await ctx.db.query("locations").collect();
  if (hasActiveNameConflict(locations, name, excludeId)) {
    throw new Error("LOCATION_NAME_TAKEN");
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await adminPermissionOrThrow(ctx, "locations:write");
    const locations = await ctx.db.query("locations").collect();
    return {
      locations: locations.sort((a, b) => a.name.localeCompare(b.name, "vi")),
    };
  },
});

export const create = mutation({
  args: { name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "locations:write");
    const input = cleanLocation(args);
    await assertLocationNameAvailable(ctx, input.name);
    const now = Date.now();
    const id = await ctx.db.insert("locations", {
      ...input,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "location.create",
      details: JSON.stringify({ id, name: input.name }),
      at: now,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("locations"),
    name: v.string(),
    description: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "locations:write");
    const current = await ctx.db.get(args.id);
    if (!current) throw new Error("LOCATION_NOT_FOUND");
    const input = cleanLocation(args);
    await assertLocationNameAvailable(ctx, input.name, args.id);
    const now = Date.now();
    await ctx.db.patch(args.id, {
      name: input.name,
      description: input.description,
      active: args.active ?? current.active,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "location.update",
      details: JSON.stringify({ id: args.id, name: input.name }),
      at: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("locations") },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "locations:write");
    const current = await ctx.db.get(args.id);
    if (!current) throw new Error("LOCATION_NOT_FOUND");
    const now = Date.now();
    await ctx.db.patch(args.id, { active: false, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "location.remove",
      details: JSON.stringify({ id: args.id, name: current.name }),
      at: now,
    });
  },
});
