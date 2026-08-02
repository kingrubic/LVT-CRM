import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { currentUserOrThrow } from "./lib";

export const registerToken = mutation({
  args: {
    token: v.string(),
    appId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await currentUserOrThrow(ctx);
    if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
    const token = args.token.trim();
    if (!token || token.length > 4096) throw new Error("INVALID_PUSH_TOKEN");
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        userId: String(user._id),
        appId: args.appId.trim().slice(0, 120) || "android",
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("pushTokens", {
      userId: String(user._id),
      token,
      appId: args.appId.trim().slice(0, 120) || "android",
      updatedAt: now,
    });
  },
});

export const unregisterToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await currentUserOrThrow(ctx);
    const token = args.token.trim();
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (existing && existing.userId === String(user._id)) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const tokensForUsers = internalQuery({
  args: { userIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const wanted = new Set(args.userIds.map(String));
    if (!wanted.size) return [];
    const rows = await ctx.db.query("pushTokens").collect();
    return rows
      .filter((row) => wanted.has(String(row.userId)))
      .map((row) => ({ id: row._id, userId: row.userId, token: row.token }));
  },
});

export const removeTokens = internalMutation({
  args: { ids: v.array(v.id("pushTokens")) },
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      if (await ctx.db.get(id)) await ctx.db.delete(id);
    }
  },
});
