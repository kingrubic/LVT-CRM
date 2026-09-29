import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  buildChatNotificationItem,
  canRecallChatMessage,
  evaluateChatRecall,
  isChatMessageRecalled,
  recallErrorCode,
} from "./chatMessagePolicy";
import { deactivateChatNotificationEvents, insertChatNotificationEvents } from "./chatNotifications";
import { activeGroupMembers, requireGroupReader, requireGroupSender } from "./chatGroupAccess";
import { applyChatRecall, publishChatMessage } from "./chatInbox";
import { chatDisplayName, clampChatPageLimit } from "./chatHubPolicy";
import { prepareWorkMessageBody, sanitizeWorkMessageHtml, workChatAuthorInitials } from "./workMessagePolicy";

function prepareGroupMessageBody(html: string) {
  try {
    return prepareWorkMessageBody(html);
  } catch (error) {
    const code = String((error as Error)?.message || "");
    if (code === "WORK_CHAT_EMPTY") throw new Error("GROUP_CHAT_EMPTY");
    if (code === "WORK_CHAT_TOO_LONG") throw new Error("GROUP_CHAT_TOO_LONG");
    throw error;
  }
}

async function authorMap(ctx: any, userIds: string[]) {
  const usersById = new Map<string, { name?: string; email?: string }>();
  for (const userId of userIds) {
    if (!userId || usersById.has(userId)) continue;
    try {
      const user = await ctx.db.get(userId as Id<"users">);
      if (user) usersById.set(userId, user);
    } catch {
      /* skip malformed ids */
    }
  }
  return usersById;
}

export const list = query({
  args: {
    groupId: v.string(),
    before: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user, group } = await requireGroupReader(ctx, args.groupId);
    const limit = clampChatPageLimit(args.limit);
    const rows = await ctx.db
      .query("groupMessages")
      .withIndex("by_group_created", (q: any) => {
        const range = q.eq("groupId", String(args.groupId));
        return args.before ? range.lt("createdAt", args.before) : range;
      })
      .order("desc")
      .take(limit + 1);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).filter((row: any) => row.active);
    const usersById = await authorMap(ctx, page.map((row: any) => String(row.authorUserId)));
    const now = Date.now();
    const messages = [...page].reverse().map((row: any) => {
      const author = usersById.get(String(row.authorUserId));
      const authorName = chatDisplayName(author);
      const recalled = isChatMessageRecalled(row);
      const isSelf = String(row.authorUserId) === String(user._id);
      return {
        _id: row._id,
        authorUserId: row.authorUserId,
        authorName,
        authorInitials: workChatAuthorInitials(authorName),
        bodyHtml: recalled ? "" : sanitizeWorkMessageHtml(row.bodyHtml),
        createdAt: row.createdAt,
        recalled,
        canRecall: canRecallChatMessage({
          actorUserId: String(user._id),
          authorUserId: String(row.authorUserId),
          createdAt: row.createdAt,
          recalledAt: row.recalledAt,
          now,
        }),
        isSelf,
      };
    });
    return {
      groupId: String(group._id),
      groupTitle: String(group.name || "Nhóm"),
      currentUserId: String(user._id),
      hasMore,
      messages,
    };
  },
});

export const create = mutation({
  args: {
    groupId: v.string(),
    bodyHtml: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, group } = await requireGroupSender(ctx, args.groupId);
    const prepared = prepareGroupMessageBody(args.bodyHtml);
    const now = Date.now();
    const messageId = await ctx.db.insert("groupMessages", {
      groupId: String(args.groupId),
      authorUserId: String(user._id),
      bodyHtml: prepared.bodyHtml,
      bodyText: prepared.bodyText,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const members = await activeGroupMembers(ctx, String(group._id));
    const recipientIds = members
      .map((member: { userId: string }) => String(member.userId))
      .filter((id: string) => id && id !== String(user._id));
    await publishChatMessage(ctx, {
      kind: "group",
      entityId: String(group._id),
      title: String(group.name || "Nhóm"),
      bodyText: prepared.bodyText,
      createdAt: now,
      authorUserId: String(user._id),
      recipientIds,
    });
    if (recipientIds.length) {
      const feedItem = buildChatNotificationItem({
        kind: "group",
        messageId: String(messageId),
        entityId: String(group._id),
        entityTitle: String(group.name || "Nhóm"),
        authorName: chatDisplayName(user),
        bodyText: prepared.bodyText,
        createdAt: now,
      });
      await insertChatNotificationEvents(ctx, {
        recipientUserIds: recipientIds,
        kind: "group",
        sourceId: String(group._id),
        messageId: String(messageId),
        title: feedItem.title,
        description: feedItem.description,
        createdAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.pushActions.sendToUsers, {
        userIds: recipientIds,
        title: feedItem.title,
        body: feedItem.description,
        kind: "group",
        sourceType: "group_chat",
        sourceId: String(group._id),
      });
    }
    return { messageId };
  },
});

export const recall = mutation({
  args: { messageId: v.string() },
  handler: async (ctx, args) => {
    let row = null;
    try {
      row = await ctx.db.get(args.messageId as Id<"groupMessages">);
    } catch {
      row = null;
    }
    if (!row?.active) throw new Error("GROUP_CHAT_RECALL_FORBIDDEN");
    const { user } = await requireGroupSender(ctx, String(row.groupId));
    const decision = evaluateChatRecall({
      actorUserId: String(user._id),
      authorUserId: String(row.authorUserId),
      createdAt: row.createdAt,
      recalledAt: row.recalledAt,
    });
    if (!decision.ok) throw new Error(recallErrorCode("group", decision.code));
    const now = Date.now();
    await ctx.db.patch(row._id, { recalledAt: now, updatedAt: now });
    await deactivateChatNotificationEvents(ctx, String(row._id));
    await applyChatRecall(ctx, {
      kind: "group",
      entityId: String(row.groupId),
      messageCreatedAt: row.createdAt,
      authorUserId: String(row.authorUserId),
    });
    return { recalled: true };
  },
});
