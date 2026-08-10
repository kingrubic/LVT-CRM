import { v } from "convex/values";
import { invalidateSessions } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import {
  adminPermissionOrThrow,
  getNumberSystemSetting,
  LOGIN_ATTEMPT_WINDOW_MINUTES_DEFAULT,
  LOGIN_ATTEMPT_WINDOW_MINUTES_SETTING_KEY,
  LOGIN_MAX_FAILED_ATTEMPTS_DEFAULT,
  LOGIN_MAX_FAILED_ATTEMPTS_SETTING_KEY,
  normalizeEmail,
} from "./lib";

async function readLockoutConfig(ctx: any) {
  const [maxFailedAttempts, windowMinutes] = await Promise.all([
    getNumberSystemSetting(
      ctx,
      LOGIN_MAX_FAILED_ATTEMPTS_SETTING_KEY,
      LOGIN_MAX_FAILED_ATTEMPTS_DEFAULT,
    ),
    getNumberSystemSetting(
      ctx,
      LOGIN_ATTEMPT_WINDOW_MINUTES_SETTING_KEY,
      LOGIN_ATTEMPT_WINDOW_MINUTES_DEFAULT,
    ),
  ]);
  return {
    maxFailedAttempts: Math.min(50, Math.max(1, Math.floor(maxFailedAttempts))),
    windowMinutes: Math.min(24 * 60, Math.max(1, Math.floor(windowMinutes))),
  };
}

export const lockoutSettings = query({
  args: {},
  handler: async (ctx) => {
    await adminPermissionOrThrow(ctx, "settings:read");
    return await readLockoutConfig(ctx);
  },
});

export const updateLockoutSettings = mutation({
  args: {
    maxFailedAttempts: v.number(),
    windowMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    const { user } = await adminPermissionOrThrow(ctx, "settings:write");
    const maxFailedAttempts = Math.floor(args.maxFailedAttempts);
    const windowMinutes = Math.floor(args.windowMinutes);
    if (!Number.isInteger(maxFailedAttempts) || maxFailedAttempts < 1 || maxFailedAttempts > 50) {
      throw new Error("INVALID_LOGIN_MAX_FAILED_ATTEMPTS");
    }
    if (!Number.isInteger(windowMinutes) || windowMinutes < 1 || windowMinutes > 24 * 60) {
      throw new Error("INVALID_LOGIN_ATTEMPT_WINDOW");
    }
    const now = Date.now();
    const userId = String(user._id);
    for (const [key, numberValues] of [
      [LOGIN_MAX_FAILED_ATTEMPTS_SETTING_KEY, [maxFailedAttempts]],
      [LOGIN_ATTEMPT_WINDOW_MINUTES_SETTING_KEY, [windowMinutes]],
    ] as const) {
      const current = await ctx.db
        .query("systemSettings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (current) {
        await ctx.db.patch(current._id, {
          numberValues: [...numberValues],
          updatedBy: userId,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("systemSettings", {
          key,
          numberValues: [...numberValues],
          updatedBy: userId,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    return { maxFailedAttempts, windowMinutes };
  },
});

export const lockStatusByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (!user) return { locked: false as const, userId: null };
    return {
      locked: Boolean(user.loginLockedAt) || user.status !== "active",
      loginLocked: Boolean(user.loginLockedAt),
      status: user.status,
      userId: user._id,
      name: user.name,
      email: user.email,
    };
  },
});

export const clearFailures = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (!user) return;
    if (!user.failedLoginCount && !user.failedLoginWindowStart) return;
    await ctx.db.patch(user._id, {
      failedLoginCount: undefined,
      failedLoginWindowStart: undefined,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Count a failed password attempt. Locks the account when the configured
 * threshold is reached within the attempt window. Lock persists until admin unlock.
 */
export const recordFailure = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (!user || user.status !== "active") {
      return { locked: false, newlyLocked: false, userId: null as null };
    }
    if (user.loginLockedAt) {
      return {
        locked: true,
        newlyLocked: false,
        userId: user._id,
        name: user.name,
        email: user.email,
      };
    }

    const { maxFailedAttempts, windowMinutes } = await readLockoutConfig(ctx);
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;
    const windowStart = user.failedLoginWindowStart ?? now;
    const inWindow = now - windowStart < windowMs;
    const nextCount = inWindow ? (user.failedLoginCount ?? 0) + 1 : 1;
    const nextWindowStart = inWindow ? windowStart : now;

    if (nextCount >= maxFailedAttempts) {
      await ctx.db.patch(user._id, {
        loginLockedAt: now,
        failedLoginCount: nextCount,
        failedLoginWindowStart: nextWindowStart,
        updatedAt: now,
        updatedBy: "system:loginLockout",
      });
      await ctx.db.insert("auditLogs", {
        actorUserId: "system:loginLockout",
        action: "user.login_locked",
        targetUserId: String(user._id),
        targetEmail: user.email,
        details: JSON.stringify({ maxFailedAttempts, windowMinutes, attempts: nextCount }),
        at: now,
      });
      await ctx.scheduler.runAfter(0, internal.loginSecurity.runLockoutSideEffects, {
        userId: user._id,
        email: user.email ?? email,
        name: user.name,
      });
      return {
        locked: true,
        newlyLocked: true,
        userId: user._id,
        name: user.name,
        email: user.email,
      };
    }

    await ctx.db.patch(user._id, {
      failedLoginCount: nextCount,
      failedLoginWindowStart: nextWindowStart,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: "system:loginLockout",
      action: "user.login_failed",
      targetUserId: String(user._id),
      targetEmail: user.email,
      details: JSON.stringify({ attempts: nextCount, maxFailedAttempts, windowMinutes }),
      at: now,
    });
    return {
      locked: false,
      newlyLocked: false,
      userId: user._id,
      name: user.name,
      email: user.email,
    };
  },
});

export const unlockLogin = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const { user: actor } = await adminPermissionOrThrow(ctx, "users:write");
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("USER_NOT_FOUND");
    await ctx.db.patch(target._id, {
      loginLockedAt: undefined,
      failedLoginCount: undefined,
      failedLoginWindowStart: undefined,
      updatedBy: String(actor._id),
      updatedAt: Date.now(),
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: String(actor._id),
      action: "user.login_unlocked",
      targetUserId: String(target._id),
      targetEmail: target.email,
      at: Date.now(),
    });
  },
});

export const runLockoutSideEffects = internalAction({
  args: {
    userId: v.id("users"),
    email: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      await invalidateSessions(ctx, { userId: args.userId });
    } catch {
      /* best effort */
    }
    try {
      await ctx.runMutation(internal.push.removeAllForUser, { userId: String(args.userId) });
    } catch {
      /* best effort */
    }
    try {
      await ctx.runMutation(internal.sessions.removeAllMetadataForUser, {
        userId: args.userId,
      });
    } catch {
      /* best effort */
    }
    try {
      await ctx.runAction(internal.mail.sendAccountLockedEmail, {
        to: args.email,
        recipientName: args.name,
      });
    } catch {
      /* mail outage must not block lockout */
    }
  },
});
