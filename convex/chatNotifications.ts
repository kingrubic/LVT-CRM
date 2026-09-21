import type { Id } from "./_generated/dataModel";
import { CHAT_NOTIFICATION_LIST_LIMIT, CHAT_NOTIFICATION_TTL_MS } from "./chatMessagePolicy.ts";

export async function insertChatNotificationEvents(
  ctx: { db: any },
  args: {
    recipientUserIds: string[];
    kind: "work" | "duty";
    sourceId: string;
    messageId: string;
    title: string;
    description: string;
    createdAt: number;
  },
) {
  const sourceType = args.kind === "duty" ? "duty_chat" : "work_chat";
  for (const userId of args.recipientUserIds) {
    if (!userId) continue;
    await ctx.db.insert("chatNotificationEvents", {
      userId: String(userId),
      kind: args.kind,
      sourceType,
      sourceId: String(args.sourceId),
      messageId: String(args.messageId),
      title: args.title,
      description: args.description,
      active: true,
      createdAt: args.createdAt,
    });
  }
}

export async function deactivateChatNotificationEvents(ctx: { db: any }, messageId: string) {
  const rows = await ctx.db
    .query("chatNotificationEvents")
    .withIndex("by_message", (q: any) => q.eq("messageId", String(messageId)))
    .collect();
  for (const row of rows) {
    if (row.active !== false) {
      await ctx.db.patch(row._id as Id<"chatNotificationEvents">, { active: false });
    }
  }
}

export function chatEventToFeedItem(row: {
  kind: "work" | "duty";
  sourceType: "work_chat" | "duty_chat";
  sourceId: string;
  messageId: string;
  title: string;
  description: string;
  createdAt: number;
}) {
  return {
    key: `${row.kind}:${row.sourceType}:${row.messageId}`,
    kind: row.kind,
    sourceType: row.sourceType,
    sourceId: String(row.sourceId),
    title: row.title,
    description: row.description,
    dueAt: row.createdAt,
    milestoneHours: 0,
    milestoneLabel: "Tin nhắn mới",
    availableAt: row.createdAt,
    createdAt: row.createdAt,
  };
}

export function mergeChatFeedItems<T extends { key: string; availableAt: number }>(
  groups: T[][],
  now = Date.now(),
): T[] {
  const byKey = new Map<string, T>();
  for (const group of groups) {
    for (const item of group) {
      if (now - item.availableAt > CHAT_NOTIFICATION_TTL_MS) continue;
      if (!byKey.has(item.key)) byKey.set(item.key, item);
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.availableAt - a.availableAt)
    .slice(0, CHAT_NOTIFICATION_LIST_LIMIT);
}
