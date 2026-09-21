import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  activePositionLevel,
  currentUserOrThrow,
  getWorkVisibilityMode,
  isOperationalManagerRole,
  resolveUserMenuAccess,
} from "./lib";
import {
  buildChatNotificationItem,
  canRecallChatMessage,
  evaluateChatRecall,
  isChatMessageRecalled,
  recallErrorCode,
} from "./chatMessagePolicy";
import { deactivateChatNotificationEvents, insertChatNotificationEvents } from "./chatNotifications";
import {
  canAccessWorkChat,
  prepareWorkMessageBody,
  sanitizeWorkMessageHtml,
  workChatAuthorInitials,
} from "./workMessagePolicy";

const MESSAGE_LIST_LIMIT = 200;

async function requireWorkChatActor(ctx: any) {
  const user = await currentUserOrThrow(ctx);
  if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
  if (user.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  const menuAccess = await resolveUserMenuAccess(ctx, user);
  if (!isOperationalManagerRole(user.role) && menuAccess.work === "hidden") {
    throw new Error("FORBIDDEN: work menu hidden");
  }
  const positions = await ctx.db.query("positions").collect();
  return {
    user,
    isAdmin: isOperationalManagerRole(user.role),
    level: isOperationalManagerRole(user.role) ? 5 : activePositionLevel(user, positions),
    positions,
  };
}

async function loadWorkChatContext(ctx: any, documentId: string) {
  let document = null;
  try {
    document = await ctx.db.get(documentId as Id<"officeDocuments">);
  } catch {
    document = null;
  }
  const workItems = (await ctx.db
    .query("workItems")
    .withIndex("by_document", (q: any) => q.eq("documentId", String(documentId)))
    .collect())
    .filter((item: any) => item.active);
  const personalTasks = [];
  for (const item of workItems) {
    const rows = await ctx.db
      .query("personalTasks")
      .withIndex("by_work_item", (q: any) => q.eq("workItemId", String(item._id)))
      .collect();
    for (const row of rows) {
      if (row.active) personalTasks.push(row);
    }
  }
  const users = await ctx.db.query("users").collect();
  const usersById = new Map<string, { status?: string; name?: string; email?: string }>(
    users.map((user: any) => [String(user._id), user]),
  );
  return { document, workItems, personalTasks, usersById };
}

async function authorizeWorkChat(ctx: any, documentId: string) {
  const actor = await requireWorkChatActor(ctx);
  const visibilityMode = await getWorkVisibilityMode(ctx);
  const { document, workItems, personalTasks, usersById } = await loadWorkChatContext(
    ctx,
    String(documentId || ""),
  );
  const allowed = canAccessWorkChat({
    actorUserId: String(actor.user._id),
    actorRole: actor.user.role,
    actorLevel: actor.level,
    actorDepartmentId: String(actor.user.departmentId || ""),
    visibilityMode,
    document,
    workItems,
    personalTasks,
    usersById,
  });
  if (!allowed) throw new Error("WORK_CHAT_FORBIDDEN");
  return { actor, document, usersById };
}

function displayName(user: { name?: string; email?: string } | null | undefined) {
  const name = String(user?.name || "").trim();
  if (name) return name;
  const email = String(user?.email || "").trim();
  if (email) return email;
  return "Người dùng";
}

export const list = query({
  args: { documentId: v.string() },
  handler: async (ctx, args) => {
    const { actor, document, usersById } = await authorizeWorkChat(ctx, args.documentId);
    const rows = await ctx.db
      .query("workMessages")
      .withIndex("by_document_created", (q: any) => q.eq("documentId", String(args.documentId)))
      .order("desc")
      .take(MESSAGE_LIST_LIMIT);
    const now = Date.now();
    const messages = [...rows]
      .filter((row: any) => row.active)
      .reverse()
      .map((row: any) => {
        const author = usersById.get(String(row.authorUserId));
        const authorName = displayName(author);
        const recalled = isChatMessageRecalled(row);
        const isSelf = String(row.authorUserId) === String(actor.user._id);
        return {
          _id: row._id,
          authorUserId: row.authorUserId,
          authorName,
          authorInitials: workChatAuthorInitials(authorName),
          bodyHtml: recalled ? "" : sanitizeWorkMessageHtml(row.bodyHtml),
          createdAt: row.createdAt,
          recalled,
          canRecall: canRecallChatMessage({
            actorUserId: String(actor.user._id),
            authorUserId: String(row.authorUserId),
            createdAt: row.createdAt,
            recalledAt: row.recalledAt,
            now,
          }),
          isSelf,
        };
      });
    return {
      documentId: String(document._id),
      documentTitle: String(document.title || document.fileName || document.content || "Công việc"),
      currentUserId: String(actor.user._id),
      messages,
    };
  },
});

export const create = mutation({
  args: {
    documentId: v.string(),
    bodyHtml: v.string(),
  },
  handler: async (ctx, args) => {
    const { actor } = await authorizeWorkChat(ctx, args.documentId);
    const prepared = prepareWorkMessageBody(args.bodyHtml);
    const now = Date.now();
    const messageId = await ctx.db.insert("workMessages", {
      documentId: String(args.documentId),
      authorUserId: String(actor.user._id),
      bodyHtml: prepared.bodyHtml,
      bodyText: prepared.bodyText,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const { document, workItems, personalTasks, usersById } = await loadWorkChatContext(
      ctx,
      String(args.documentId),
    );
    const visibilityMode = await getWorkVisibilityMode(ctx);
    const recipientIds: string[] = [];
    for (const row of usersById.values()) {
      const user = row as any;
      if (user.status !== "active" || String(user._id) === String(actor.user._id)) continue;
      const menuAccess = await resolveUserMenuAccess(ctx, user);
      if (!isOperationalManagerRole(user.role) && menuAccess.work === "hidden") continue;
      if (
        !canAccessWorkChat({
          actorUserId: String(user._id),
          actorRole: String(user.role || "user"),
          actorLevel: isOperationalManagerRole(user.role)
            ? 5
            : activePositionLevel(user, actor.positions),
          actorDepartmentId: String(user.departmentId || ""),
          visibilityMode,
          document,
          workItems,
          personalTasks,
          usersById,
        })
      ) {
        continue;
      }
      recipientIds.push(String(user._id));
    }
    if (recipientIds.length) {
      const feedItem = buildChatNotificationItem({
        kind: "work",
        messageId: String(messageId),
        entityId: String(args.documentId),
        entityTitle: String(document?.title || document?.fileName || "Công việc"),
        authorName: displayName(actor.user),
        bodyText: prepared.bodyText,
        createdAt: now,
      });
      await insertChatNotificationEvents(ctx, {
        recipientUserIds: recipientIds,
        kind: "work",
        sourceId: String(args.documentId),
        messageId: String(messageId),
        title: feedItem.title,
        description: feedItem.description,
        createdAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.pushActions.sendToUsers, {
        userIds: recipientIds,
        title: feedItem.title,
        body: feedItem.description,
        kind: "work",
        sourceType: "work_chat",
        sourceId: String(args.documentId),
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
      row = await ctx.db.get(args.messageId as Id<"workMessages">);
    } catch {
      row = null;
    }
    if (!row?.active) throw new Error("WORK_CHAT_RECALL_FORBIDDEN");
    const { actor } = await authorizeWorkChat(ctx, String(row.documentId));
    const decision = evaluateChatRecall({
      actorUserId: String(actor.user._id),
      authorUserId: String(row.authorUserId),
      createdAt: row.createdAt,
      recalledAt: row.recalledAt,
    });
    if (!decision.ok) throw new Error(recallErrorCode("work", decision.code));
    const now = Date.now();
    await ctx.db.patch(row._id, { recalledAt: now, updatedAt: now });
    await deactivateChatNotificationEvents(ctx, String(row._id));
    return { recalled: true };
  },
});
