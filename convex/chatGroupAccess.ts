import type { Id } from "./_generated/dataModel";
import { currentUserOrThrow } from "./lib";

export async function requireChatUser(ctx: any) {
  const user = await currentUserOrThrow(ctx);
  if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
  if (user.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  return user;
}

export function isChatAdmin(user: { role?: string }) {
  return user.role === "admin";
}

export async function loadChatGroup(ctx: any, groupId: string) {
  try {
    return await ctx.db.get(groupId as Id<"chatGroups">);
  } catch {
    return null;
  }
}

export async function activeGroupMembers(ctx: any, groupId: string) {
  return await ctx.db
    .query("chatGroupMembers")
    .withIndex("by_group_active", (q: any) => q.eq("groupId", String(groupId)).eq("active", true))
    .collect();
}

export async function membershipRow(ctx: any, groupId: string, userId: string) {
  const rows = await ctx.db
    .query("chatGroupMembers")
    .withIndex("by_group_user", (q: any) => q.eq("groupId", String(groupId)).eq("userId", String(userId)))
    .collect();
  return rows[0] || null;
}

export async function requireGroupReader(ctx: any, groupId: string) {
  const user = await requireChatUser(ctx);
  const group = await loadChatGroup(ctx, groupId);
  if (!group?.active) throw new Error("GROUP_CHAT_FORBIDDEN");
  const member = await membershipRow(ctx, groupId, String(user._id));
  const viewerIsMember = Boolean(member?.active);
  const viewerIsAdmin = isChatAdmin(user);
  if (!viewerIsMember && !viewerIsAdmin) throw new Error("GROUP_CHAT_FORBIDDEN");
  return { user, group, member, viewerIsMember, viewerIsAdmin };
}

export async function requireGroupSender(ctx: any, groupId: string) {
  const access = await requireGroupReader(ctx, groupId);
  if (!access.viewerIsMember) throw new Error("GROUP_CHAT_FORBIDDEN");
  return access;
}
