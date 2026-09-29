/** Pure rules for the Trao đổi hub. No Convex runtime imports. */

import { CHAT_RECALLED_PLACEHOLDER } from "./chatMessagePolicy.ts";

export const CHAT_INBOX_LIST_LIMIT = 150;
export const CHAT_GROUP_LIST_LIMIT = 200;
export const CHAT_GROUP_NAME_MAX = 80;
/** ponytail: fan-out is one inbox write per member; raise with a paged member index if groups grow past this. */
export const CHAT_GROUP_MEMBER_LIMIT = 100;
export const CHAT_MESSAGE_PAGE_DEFAULT = 200;
export const CHAT_MESSAGE_PAGE_MAX = 200;
export const CHAT_BACKFILL_SCAN = 40;
export const CHAT_DIRECTORY_LIMIT = 500;
export const GROUP_CREATED_PREVIEW = "Nhóm vừa được tạo";

export type ChatKind = "work" | "duty" | "group";

export function threadKeyFor(kind: ChatKind, entityId: string) {
  return `${kind}:${String(entityId || "")}`;
}

export function parseThreadKey(value: string): { kind: ChatKind; entityId: string } | null {
  const raw = String(value || "");
  const idx = raw.indexOf(":");
  if (idx <= 0) return null;
  const kind = raw.slice(0, idx);
  const entityId = raw.slice(idx + 1);
  if (!entityId) return null;
  if (kind !== "work" && kind !== "duty" && kind !== "group") return null;
  return { kind, entityId };
}

export function clampChatPageLimit(value: number | undefined) {
  const n = Number(value ?? CHAT_MESSAGE_PAGE_DEFAULT);
  if (!Number.isFinite(n) || n < 1) return CHAT_MESSAGE_PAGE_DEFAULT;
  return Math.min(Math.floor(n), CHAT_MESSAGE_PAGE_MAX);
}

export function chatPreviewText(text: string, max = 120) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

export function chatDisplayName(user: { name?: string; email?: string } | null | undefined) {
  const name = String(user?.name || "").trim();
  if (name) return name;
  const email = String(user?.email || "").trim();
  if (email) return email;
  return "Người dùng";
}

export function normalizeGroupName(raw: string) {
  return String(raw || "").replace(/\s+/g, " ").trim();
}

export function validateGroupName(
  raw: string,
): { ok: true; name: string } | { ok: false; code: "GROUP_NAME_REQUIRED" | "GROUP_NAME_TOO_LONG" } {
  const name = normalizeGroupName(raw);
  if (!name) return { ok: false, code: "GROUP_NAME_REQUIRED" };
  if ([...name].length > CHAT_GROUP_NAME_MAX) return { ok: false, code: "GROUP_NAME_TOO_LONG" };
  return { ok: true, name };
}

export function normalizeMemberIds(ids: readonly string[], actorUserId: string) {
  const actor = String(actorUserId || "");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids || []) {
    const value = String(id || "").trim();
    if (!value || value === actor || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/** Negative when a still-unread message is recalled; otherwise zero. */
export function recallUnreadDelta(args: {
  unreadCount: number;
  lastReadAt: number;
  messageCreatedAt: number;
}) {
  if ((args.unreadCount || 0) <= 0) return 0;
  if ((args.lastReadAt || 0) >= args.messageCreatedAt) return 0;
  return -1;
}

export function isLatestChatPreview(args: {
  lastMessageAt: number;
  lastAuthorUserId: string;
  messageCreatedAt: number;
  authorUserId: string;
}) {
  return args.lastMessageAt === args.messageCreatedAt
    && String(args.lastAuthorUserId || "") === String(args.authorUserId || "");
}

export function recalledPreview() {
  return CHAT_RECALLED_PLACEHOLDER;
}

export function nextOwnerMember<T extends { userId: string; joinedAt: number; role?: string }>(
  members: T[],
  leavingUserId: string,
) {
  return members
    .filter((member) => member.userId !== leavingUserId)
    .sort((a, b) => a.joinedAt - b.joinedAt || a.userId.localeCompare(b.userId))[0] || null;
}
