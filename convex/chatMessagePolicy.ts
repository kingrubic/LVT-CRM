/** Shared recall + chat-notification rules for work and duty threads. */

export const CHAT_RECALL_WINDOW_MS = 15 * 60 * 1000;
export const CHAT_NOTIFICATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const CHAT_NOTIFICATION_LIST_LIMIT = 80;
export const CHAT_RECALLED_PLACEHOLDER = "Tin nhắn đã được thu hồi";

export function isChatMessageRecalled(row: { recalledAt?: number | null; recalled?: boolean } | null | undefined) {
  if (!row) return false;
  if (row.recalled === true) return true;
  return Boolean(row.recalledAt);
}

export function evaluateChatRecall(args: {
  actorUserId: string;
  authorUserId: string;
  createdAt: number;
  recalledAt?: number | null;
  now?: number;
}): { ok: true } | { ok: false; code: "CHAT_RECALL_NOT_AUTHOR" | "CHAT_RECALL_ALREADY" | "CHAT_RECALL_TOO_LATE" } {
  const now = args.now ?? Date.now();
  if (String(args.actorUserId || "") !== String(args.authorUserId || "")) {
    return { ok: false, code: "CHAT_RECALL_NOT_AUTHOR" };
  }
  if (isChatMessageRecalled(args)) return { ok: false, code: "CHAT_RECALL_ALREADY" };
  if (!Number.isFinite(args.createdAt) || now - args.createdAt > CHAT_RECALL_WINDOW_MS) {
    return { ok: false, code: "CHAT_RECALL_TOO_LATE" };
  }
  return { ok: true };
}

export function canRecallChatMessage(args: {
  actorUserId: string;
  authorUserId: string;
  createdAt: number;
  recalledAt?: number | null;
  now?: number;
}) {
  return evaluateChatRecall(args).ok;
}

export function shouldNotifyChatViewer(args: {
  viewerUserId: string;
  authorUserId: string;
  canSeeChat: boolean;
  recalledAt?: number | null;
  active?: boolean;
}) {
  if (args.active === false) return false;
  if (isChatMessageRecalled(args)) return false;
  if (!args.canSeeChat) return false;
  if (String(args.viewerUserId || "") === String(args.authorUserId || "")) return false;
  return true;
}

function truncatePreview(text: string, max = 120) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

export function buildChatNotificationItem(args: {
  kind: "work" | "duty";
  messageId: string;
  entityId: string;
  entityTitle: string;
  authorName: string;
  bodyText: string;
  createdAt: number;
}) {
  const sourceType = args.kind === "duty" ? "duty_chat" : "work_chat";
  const title = `${args.authorName} đã trao đổi: ${args.entityTitle || (args.kind === "duty" ? "Công tác" : "Công việc")}`;
  return {
    key: `${args.kind}:${sourceType}:${args.messageId}`,
    kind: args.kind,
    sourceType,
    sourceId: String(args.entityId),
    title,
    description: truncatePreview(args.bodyText) || "Có tin nhắn mới trong trao đổi.",
    dueAt: args.createdAt,
    milestoneHours: 0,
    milestoneLabel: "Tin nhắn mới",
    availableAt: args.createdAt,
  };
}

export function selectVisibleChatNotifications<T extends { createdAt: number }>(
  items: T[],
  now = Date.now(),
): T[] {
  const cutoff = now - CHAT_NOTIFICATION_TTL_MS;
  return items
    .filter((item) => item.createdAt >= cutoff)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, CHAT_NOTIFICATION_LIST_LIMIT);
}

export function recallErrorCode(kind: "work" | "duty", code: string) {
  const prefix = kind === "duty" ? "DUTY_CHAT" : "WORK_CHAT";
  if (code === "CHAT_RECALL_NOT_AUTHOR" || code === "CHAT_RECALL_ALREADY") {
    return `${prefix}_RECALL_FORBIDDEN`;
  }
  if (code === "CHAT_RECALL_TOO_LATE") return `${prefix}_RECALL_TOO_LATE`;
  return `${prefix}_RECALL_FORBIDDEN`;
}
