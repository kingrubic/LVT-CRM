import { getAuthSessionId, invalidateSessions } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { adminPermissionOrThrow, authUserIdOrThrow, currentUserOrThrow } from "./lib";

const CLIENT_KINDS = new Set(["web", "android", "ios", "unknown"]);

function cleanText(value: string | undefined, max: number, fallback = "") {
  const text = (value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return fallback;
  return text.slice(0, max);
}

function defaultDeviceName(kind: string) {
  if (kind === "android") return "Android";
  if (kind === "ios") return "iPhone";
  if (kind === "web") return "Trình duyệt Web";
  return "Thiết bị không xác định";
}

function defaultPlatformLabel(kind: string) {
  if (kind === "android") return "CRM Lê Văn Tám Android";
  if (kind === "ios") return "CRM Lê Văn Tám iOS";
  if (kind === "web") return "CRM Lê Văn Tám Web";
  return "CRM Lê Văn Tám";
}

function mapSessionRow(
  session: {
    _id: Id<"authSessions">;
    _creationTime: number;
    expirationTime: number;
  },
  meta: {
    deviceName?: string;
    platformLabel?: string;
    clientKind?: string;
    appVersion?: string;
    lastActiveAt?: number;
    createdAt?: number;
  } | null,
  currentSessionId: Id<"authSessions"> | null,
) {
  const clientKind =
    meta?.clientKind && CLIENT_KINDS.has(meta.clientKind) ? meta.clientKind : "unknown";
  return {
    sessionId: session._id,
    isCurrent: currentSessionId === session._id,
    deviceName: meta?.deviceName || defaultDeviceName(clientKind),
    platformLabel: meta?.platformLabel || defaultPlatformLabel(clientKind),
    clientKind,
    appVersion: meta?.appVersion || null,
    lastActiveAt: meta?.lastActiveAt ?? session._creationTime,
    createdAt: meta?.createdAt ?? session._creationTime,
    expirationTime: session.expirationTime,
  };
}

async function sessionsForUser(
  ctx: any,
  userId: Id<"users">,
  currentSessionId: Id<"authSessions"> | null,
) {
  const [authSessions, metas] = await Promise.all([
    ctx.db
      .query("authSessions")
      .withIndex("userId", (q: any) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("deviceSessions")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .collect(),
  ]);
  const liveIds = new Set(authSessions.map((row: any) => String(row._id)));
  const metaBySession = new Map<string, any>(
    metas
      .filter((row: any) => liveIds.has(String(row.sessionId)))
      .map((row: any) => [String(row.sessionId), row]),
  );
  return authSessions
    .map((session: any) =>
      mapSessionRow(session, metaBySession.get(String(session._id)) ?? null, currentSessionId),
    )
    .sort((a: any, b: any) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      return b.lastActiveAt - a.lastActiveAt;
    });
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUserOrThrow(ctx);
    const currentSessionId = await getAuthSessionId(ctx);
    return await sessionsForUser(ctx, user._id, currentSessionId);
  },
});

export const listForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await adminPermissionOrThrow(ctx, "users:read");
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("USER_NOT_FOUND");
    return await sessionsForUser(ctx, args.userId, null);
  },
});

export const registerCurrent = mutation({
  args: {
    deviceName: v.string(),
    platformLabel: v.string(),
    clientKind: v.string(),
    appVersion: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    pushToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await currentUserOrThrow(ctx);
    if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
    if (user.loginLockedAt) throw new Error("ACCOUNT_LOCKED");
    const sessionId = await getAuthSessionId(ctx);
    if (!sessionId) throw new Error("UNAUTHENTICATED");

    const clientKind = CLIENT_KINDS.has(args.clientKind) ? args.clientKind : "unknown";
    const deviceName = cleanText(args.deviceName, 80, defaultDeviceName(clientKind));
    const platformLabel = cleanText(args.platformLabel, 120, defaultPlatformLabel(clientKind));
    const appVersion = cleanText(args.appVersion, 40) || undefined;
    const userAgent = cleanText(args.userAgent, 300) || undefined;
    const pushToken = cleanText(args.pushToken, 4096) || undefined;
    const now = Date.now();

    const existing = await ctx.db
      .query("deviceSessions")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        deviceName,
        platformLabel,
        clientKind,
        appVersion,
        userAgent,
        pushToken: pushToken ?? existing.pushToken,
        lastActiveAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("deviceSessions", {
      sessionId,
      userId: user._id,
      deviceName,
      platformLabel,
      clientKind,
      appVersion,
      userAgent,
      pushToken,
      lastActiveAt: now,
      createdAt: now,
    });
  },
});

export const touchCurrent = mutation({
  args: {},
  handler: async (ctx) => {
    const sessionId = await getAuthSessionId(ctx);
    if (!sessionId) return;
    const existing = await ctx.db
      .query("deviceSessions")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (existing) {
      const user = await ctx.db.get(existing.userId);
      if (!user || user.status !== "active" || user.loginLockedAt) return;
      await ctx.db.patch(existing._id, { lastActiveAt: Date.now() });
    }
  },
});

export const authSessionIdsForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .collect();
    return sessions.map((row) => row._id);
  },
});

export const cleanupAfterRevoke = internalMutation({
  args: {
    userId: v.id("users"),
    sessionIds: v.array(v.id("authSessions")),
  },
  handler: async (ctx, args) => {
    const pushTokens = new Set<string>();
    for (const sessionId of args.sessionIds) {
      const meta = await ctx.db
        .query("deviceSessions")
        .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
        .unique();
      if (meta) {
        if (meta.pushToken) pushTokens.add(meta.pushToken);
        await ctx.db.delete(meta._id);
      }
    }
    for (const token of pushTokens) {
      const row = await ctx.db
        .query("pushTokens")
        .withIndex("by_token", (q) => q.eq("token", token))
        .unique();
      if (row && row.userId === String(args.userId)) {
        await ctx.db.delete(row._id);
      }
    }
  },
});

export const removeAllMetadataForUser = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("deviceSessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  },
});

async function revokeSessionsAction(
  ctx: any,
  userId: Id<"users">,
  targetSessionIds: Id<"authSessions">[],
) {
  if (!targetSessionIds.length) return { revoked: 0 };
  const all: Id<"authSessions">[] = await ctx.runQuery(internal.sessions.authSessionIdsForUser, {
    userId,
  });
  const targetSet = new Set(targetSessionIds.map(String));
  const except = all.filter((id) => !targetSet.has(String(id)));
  await invalidateSessions(ctx, { userId, except });
  await ctx.runMutation(internal.sessions.cleanupAfterRevoke, {
    userId,
    sessionIds: targetSessionIds,
  });
  return { revoked: targetSessionIds.length };
}

export const revokeMine = action({
  args: { sessionId: v.id("authSessions") },
  handler: async (ctx, args) => {
    const userId = await authUserIdOrThrow(ctx);
    const currentSessionId = await getAuthSessionId(ctx);
    if (currentSessionId && args.sessionId === currentSessionId) {
      throw new Error("CANNOT_REVOKE_CURRENT_SESSION");
    }
    const all: Id<"authSessions">[] = await ctx.runQuery(internal.sessions.authSessionIdsForUser, {
      userId,
    });
    if (!all.some((id) => id === args.sessionId)) throw new Error("SESSION_NOT_FOUND");
    return await revokeSessionsAction(ctx, userId, [args.sessionId]);
  },
});

export const revokeAllOthers = action({
  args: {},
  handler: async (ctx) => {
    const userId = await authUserIdOrThrow(ctx);
    const currentSessionId = await getAuthSessionId(ctx);
    if (!currentSessionId) throw new Error("UNAUTHENTICATED");
    const all: Id<"authSessions">[] = await ctx.runQuery(internal.sessions.authSessionIdsForUser, {
      userId,
    });
    const targets = all.filter((id) => id !== currentSessionId);
    return await revokeSessionsAction(ctx, userId, targets);
  },
});

export const revokeForUser = action({
  args: {
    userId: v.id("users"),
    sessionId: v.id("authSessions"),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.users.requireAdmin, { permission: "users:write" });
    const all: Id<"authSessions">[] = await ctx.runQuery(internal.sessions.authSessionIdsForUser, {
      userId: args.userId,
    });
    if (!all.some((id) => id === args.sessionId)) throw new Error("SESSION_NOT_FOUND");
    return await revokeSessionsAction(ctx, args.userId, [args.sessionId]);
  },
});

export const revokeAllForUser = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.users.requireAdmin, { permission: "users:write" });
    const all: Id<"authSessions">[] = await ctx.runQuery(internal.sessions.authSessionIdsForUser, {
      userId: args.userId,
    });
    if (!all.length) return { revoked: 0 };
    await invalidateSessions(ctx, { userId: args.userId });
    await ctx.runMutation(internal.sessions.cleanupAfterRevoke, {
      userId: args.userId,
      sessionIds: all,
    });
    await ctx.runMutation(internal.push.removeAllForUser, { userId: String(args.userId) });
    return { revoked: all.length };
  },
});
