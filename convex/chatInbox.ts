/** Maintain per-user inbox rows. Callers already decided who may see the thread. */

import type { Id } from "./_generated/dataModel";
import { CHAT_RECALLED_PLACEHOLDER } from "./chatMessagePolicy.ts";
import {
  chatPreviewText,
  isLatestChatPreview,
  recallUnreadDelta,
  threadKeyFor,
  type ChatKind,
} from "./chatHubPolicy.ts";

type DbCtx = { db: any };

async function inboxRowsForUserThread(ctx: DbCtx, userId: string, threadKey: string) {
  return await ctx.db
    .query("chatInbox")
    .withIndex("by_user_thread", (q: any) => q.eq("userId", userId).eq("threadKey", threadKey))
    .collect();
}

async function threadRows(ctx: DbCtx, threadKey: string) {
  return await ctx.db
    .query("chatThreads")
    .withIndex("by_thread_key", (q: any) => q.eq("threadKey", threadKey))
    .collect();
}

function keepNewest(rows: any[]) {
  if (rows.length <= 1) return rows[0] || null;
  return [...rows].sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0))[0];
}

async function bumpUnread(ctx: DbCtx, userId: string, delta: number, now: number) {
  if (!delta) return;
  const row = await ctx.db
    .query("chatCounters")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
  if (!row) {
    if (delta > 0) {
      await ctx.db.insert("chatCounters", { userId, unreadTotal: delta, updatedAt: now });
    }
    return;
  }
  await ctx.db.patch(row._id, {
    unreadTotal: Math.max(0, Number(row.unreadTotal || 0) + delta),
    updatedAt: now,
  });
}

async function touchThread(ctx: DbCtx, args: {
  threadKey: string;
  kind: ChatKind;
  entityId: string;
  title: string;
  bodyText: string;
  createdAt: number;
  authorUserId: string;
}) {
  const preview = chatPreviewText(args.bodyText);
  const rows = await threadRows(ctx, args.threadKey);
  const existing = keepNewest(rows);
  if (!existing) {
    await ctx.db.insert("chatThreads", {
      threadKey: args.threadKey,
      kind: args.kind,
      entityId: args.entityId,
      title: args.title,
      lastBodyText: preview,
      lastMessageAt: args.createdAt,
      lastAuthorUserId: args.authorUserId,
      active: true,
      createdAt: args.createdAt,
      updatedAt: args.createdAt,
    });
    return;
  }
  if ((existing.lastMessageAt || 0) > args.createdAt) return;
  await ctx.db.patch(existing._id, {
    title: args.title,
    lastBodyText: preview,
    lastMessageAt: args.createdAt,
    lastAuthorUserId: args.authorUserId,
    kind: args.kind,
    entityId: args.entityId,
    active: true,
    updatedAt: args.createdAt,
  });
}

async function upsertInboxRow(ctx: DbCtx, args: {
  userId: string;
  threadKey: string;
  kind: ChatKind;
  entityId: string;
  title: string;
  bodyText: string;
  createdAt: number;
  authorUserId: string;
  unreadDelta: number;
  markRead: boolean;
  reactivate?: boolean;
}) {
  const now = args.createdAt;
  const preview = chatPreviewText(args.bodyText);
  const rows = await inboxRowsForUserThread(ctx, args.userId, args.threadKey);
  const existing = keepNewest(rows);
  if (!existing) {
    const unreadCount = args.markRead ? 0 : Math.max(0, args.unreadDelta);
    await ctx.db.insert("chatInbox", {
      userId: args.userId,
      threadKey: args.threadKey,
      kind: args.kind,
      entityId: args.entityId,
      title: args.title,
      lastBodyText: preview,
      lastMessageAt: args.createdAt,
      lastAuthorUserId: args.authorUserId,
      lastReadAt: args.markRead ? args.createdAt : 0,
      unreadCount,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    if (unreadCount) await bumpUnread(ctx, args.userId, unreadCount, now);
    return;
  }
  if ((existing.lastMessageAt || 0) > args.createdAt) {
    if (args.reactivate && existing.active === false) {
      await ctx.db.patch(existing._id, { active: true, title: args.title, updatedAt: now });
    }
    return;
  }
  const nextUnread = args.markRead
    ? 0
    : Math.max(0, Number(existing.unreadCount || 0) + args.unreadDelta);
  const delta = nextUnread - Number(existing.unreadCount || 0);
  await ctx.db.patch(existing._id, {
    kind: args.kind,
    entityId: args.entityId,
    title: args.title,
    lastBodyText: preview,
    lastMessageAt: args.createdAt,
    lastAuthorUserId: args.authorUserId,
    lastReadAt: args.markRead ? Math.max(Number(existing.lastReadAt || 0), args.createdAt) : existing.lastReadAt,
    unreadCount: nextUnread,
    active: true,
    updatedAt: now,
  });
  if (delta) await bumpUnread(ctx, args.userId, delta, now);
}

export async function publishChatMessage(ctx: DbCtx, args: {
  kind: ChatKind;
  entityId: string;
  title: string;
  bodyText: string;
  createdAt: number;
  authorUserId: string;
  recipientIds: string[];
  /** Historical backfill marks every viewer read so old threads do not badge. */
  historical?: boolean;
}) {
  const threadKey = threadKeyFor(args.kind, args.entityId);
  const authorUserId = String(args.authorUserId || "");
  await touchThread(ctx, {
    threadKey,
    kind: args.kind,
    entityId: String(args.entityId),
    title: args.title,
    bodyText: args.bodyText,
    createdAt: args.createdAt,
    authorUserId,
  });
  const seen = new Set<string>();
  if (authorUserId) {
    seen.add(authorUserId);
    await upsertInboxRow(ctx, {
      userId: authorUserId,
      threadKey,
      kind: args.kind,
      entityId: String(args.entityId),
      title: args.title,
      bodyText: args.bodyText,
      createdAt: args.createdAt,
      authorUserId,
      unreadDelta: 0,
      markRead: true,
    });
  }
  for (const userId of args.recipientIds) {
    const id = String(userId || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    await upsertInboxRow(ctx, {
      userId: id,
      threadKey,
      kind: args.kind,
      entityId: String(args.entityId),
      title: args.title,
      bodyText: args.bodyText,
      createdAt: args.createdAt,
      authorUserId,
      unreadDelta: args.historical ? 0 : 1,
      markRead: Boolean(args.historical),
    });
  }
  if (args.kind === "group") {
    try {
      const group = await ctx.db.get(args.entityId as Id<"chatGroups">);
      if (group && (group.lastMessageAt || 0) <= args.createdAt) {
        await ctx.db.patch(group._id, {
          lastBodyText: chatPreviewText(args.bodyText),
          lastMessageAt: args.createdAt,
          lastAuthorUserId: authorUserId,
          updatedAt: args.createdAt,
        });
      }
    } catch {
      /* group id is only valid for group threads */
    }
  }
}

export async function seedInboxPreview(ctx: DbCtx, args: {
  userId: string;
  kind: ChatKind;
  entityId: string;
  title: string;
  bodyText: string;
  createdAt: number;
  authorUserId: string;
}) {
  const threadKey = threadKeyFor(args.kind, args.entityId);
  await touchThread(ctx, { ...args, threadKey, entityId: String(args.entityId) });
  await upsertInboxRow(ctx, {
    ...args,
    threadKey,
    entityId: String(args.entityId),
    unreadDelta: 0,
    markRead: true,
    reactivate: true,
  });
}

export async function applyChatRecall(ctx: DbCtx, args: {
  kind: ChatKind;
  entityId: string;
  messageCreatedAt: number;
  authorUserId: string;
}) {
  const now = Date.now();
  const threadKey = threadKeyFor(args.kind, args.entityId);
  const thread = keepNewest(await threadRows(ctx, threadKey));
  const latest = thread
    ? isLatestChatPreview({
        lastMessageAt: thread.lastMessageAt || 0,
        lastAuthorUserId: String(thread.lastAuthorUserId || ""),
        messageCreatedAt: args.messageCreatedAt,
        authorUserId: args.authorUserId,
      })
    : false;
  if (thread && latest) {
    await ctx.db.patch(thread._id, { lastBodyText: CHAT_RECALLED_PLACEHOLDER, updatedAt: now });
  }
  if (latest && args.kind === "group") {
    try {
      const group = await ctx.db.get(args.entityId as Id<"chatGroups">);
      if (group) {
        await ctx.db.patch(group._id, { lastBodyText: CHAT_RECALLED_PLACEHOLDER, updatedAt: now });
      }
    } catch {
      /* ignore malformed id */
    }
  }
  const rows = await ctx.db
    .query("chatInbox")
    .withIndex("by_thread", (q: any) => q.eq("threadKey", threadKey))
    .collect();
  for (const row of rows) {
    const delta = recallUnreadDelta({
      unreadCount: Number(row.unreadCount || 0),
      lastReadAt: Number(row.lastReadAt || 0),
      messageCreatedAt: args.messageCreatedAt,
    });
    const patch: Record<string, unknown> = {
      unreadCount: Math.max(0, Number(row.unreadCount || 0) + delta),
      updatedAt: now,
    };
    if (latest) patch.lastBodyText = CHAT_RECALLED_PLACEHOLDER;
    await ctx.db.patch(row._id, patch);
    if (delta) await bumpUnread(ctx, String(row.userId), delta, now);
  }
}

export async function markInboxRead(ctx: DbCtx, userId: string, threadKey: string) {
  const now = Date.now();
  const row = keepNewest(await inboxRowsForUserThread(ctx, userId, threadKey));
  if (!row?.active) return { unread: 0 };
  const prev = Number(row.unreadCount || 0);
  if (prev || (row.lastReadAt || 0) < now) {
    await ctx.db.patch(row._id, { unreadCount: 0, lastReadAt: now, updatedAt: now });
  }
  if (prev) await bumpUnread(ctx, userId, -prev, now);
  return { unread: 0 };
}

export async function archiveInbox(ctx: DbCtx, userId: string, threadKey: string) {
  const now = Date.now();
  const row = keepNewest(await inboxRowsForUserThread(ctx, userId, threadKey));
  if (!row || row.active === false) return;
  const prev = Number(row.unreadCount || 0);
  await ctx.db.patch(row._id, { active: false, unreadCount: 0, updatedAt: now });
  if (prev) await bumpUnread(ctx, userId, -prev, now);
}

export async function deactivateThreadInbox(ctx: DbCtx, threadKey: string) {
  const now = Date.now();
  const rows = await ctx.db
    .query("chatInbox")
    .withIndex("by_thread", (q: any) => q.eq("threadKey", threadKey))
    .collect();
  for (const row of rows) {
    if (row.active === false && !row.unreadCount) continue;
    const prev = Number(row.unreadCount || 0);
    await ctx.db.patch(row._id, { active: false, unreadCount: 0, updatedAt: now });
    if (prev) await bumpUnread(ctx, String(row.userId), -prev, now);
  }
  const thread = keepNewest(await threadRows(ctx, threadKey));
  if (thread?.active !== false) {
    await ctx.db.patch(thread._id, { active: false, updatedAt: now });
  }
}
