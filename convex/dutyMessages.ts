import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { dutyListTitle, isDutyParticipant } from "./assignmentPolicy";
import {
  canRecallChatMessage,
  evaluateChatRecall,
  isChatMessageRecalled,
  recallErrorCode,
} from "./chatMessagePolicy";
import { requireDutiesAccess } from "./duties";
import { isOperationalManagerRole, isSameDepartmentSubordinate, resolveUserMenuAccess } from "./lib";
import { canAccessDutyChat, prepareDutyMessageBody } from "./dutyMessagePolicy";
import { sanitizeWorkMessageHtml, workChatAuthorInitials } from "./workMessagePolicy";

const MESSAGE_LIST_LIMIT = 200;

async function loadDuty(ctx: any, dutyId: string) {
  try {
    return await ctx.db.get(dutyId as Id<"duties">);
  } catch {
    return null;
  }
}

async function authorizeDutyChat(ctx: any, dutyId: string) {
  const { user, access, isAdmin } = await requireDutiesAccess(ctx);
  const duty = await loadDuty(ctx, String(dutyId || ""));
  const users = await ctx.db.query("users").collect();
  const positions = await ctx.db.query("positions").collect();
  const subordinateUsers = isAdmin
    ? []
    : users.filter(
        (target: any) =>
          target.status === "active" && isSameDepartmentSubordinate(user, target, positions),
      );
  const allowed = canAccessDutyChat({
    actorUserId: String(user._id),
    actorRole: String(user.role || ""),
    actorAccess: String(access || ""),
    actorDepartmentId: user.departmentId,
    duty,
    subordinateUsers,
  });
  if (!allowed || !duty) throw new Error("DUTY_CHAT_FORBIDDEN");
  const usersById = new Map<string, { status?: string; name?: string; email?: string }>(
    users.map((row: any) => [String(row._id), row]),
  );
  return { user, duty, usersById };
}

function displayName(user: { name?: string; email?: string } | null | undefined) {
  const name = String(user?.name || "").trim();
  if (name) return name;
  const email = String(user?.email || "").trim();
  if (email) return email;
  return "Người dùng";
}

export const list = query({
  args: { dutyId: v.string() },
  handler: async (ctx, args) => {
    const { user, duty, usersById } = await authorizeDutyChat(ctx, args.dutyId);
    const rows = await ctx.db
      .query("dutyMessages")
      .withIndex("by_duty_created", (q: any) => q.eq("dutyId", String(args.dutyId)))
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
      dutyId: String(duty._id),
      dutyTitle: dutyListTitle(duty),
      currentUserId: String(user._id),
      isParticipant: isDutyParticipant(user, duty),
      messages,
    };
  },
});

export const create = mutation({
  args: {
    dutyId: v.string(),
    bodyHtml: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, duty, usersById } = await authorizeDutyChat(ctx, args.dutyId);
    const prepared = prepareDutyMessageBody(args.bodyHtml);
    const now = Date.now();
    const messageId = await ctx.db.insert("dutyMessages", {
      dutyId: String(args.dutyId),
      authorUserId: String(user._id),
      bodyHtml: prepared.bodyHtml,
      bodyText: prepared.bodyText,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const users = [...usersById.values()] as any[];
    const positions = await ctx.db.query("positions").collect();
    const recipientIds: string[] = [];
    for (const candidate of users) {
      if (candidate.status !== "active" || String(candidate._id) === String(user._id)) continue;
      const menuAccess = await resolveUserMenuAccess(ctx, candidate);
      if (!isOperationalManagerRole(candidate.role) && menuAccess.duties === "hidden") continue;
      const access = isOperationalManagerRole(candidate.role) ? "view_all" : String(menuAccess.duties || "hidden");
      const subordinateUsers = isOperationalManagerRole(candidate.role)
        ? []
        : users.filter(
            (target) =>
              target.status === "active" &&
              isSameDepartmentSubordinate(candidate, target, positions),
          );
      if (
        !canAccessDutyChat({
          actorUserId: String(candidate._id),
          actorRole: String(candidate.role || ""),
          actorAccess: access,
          actorDepartmentId: candidate.departmentId,
          duty,
          subordinateUsers,
        })
      ) {
        continue;
      }
      recipientIds.push(String(candidate._id));
    }
    if (recipientIds.length) {
      await ctx.scheduler.runAfter(0, internal.pushActions.sendToUsers, {
        userIds: recipientIds,
        title: `${displayName(user)} đã trao đổi`,
        body: dutyListTitle(duty),
        kind: "duty",
        sourceType: "duty_chat",
        sourceId: String(args.dutyId),
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
      row = await ctx.db.get(args.messageId as Id<"dutyMessages">);
    } catch {
      row = null;
    }
    if (!row?.active) throw new Error("DUTY_CHAT_RECALL_FORBIDDEN");
    const { user } = await authorizeDutyChat(ctx, String(row.dutyId));
    const decision = evaluateChatRecall({
      actorUserId: String(user._id),
      authorUserId: String(row.authorUserId),
      createdAt: row.createdAt,
      recalledAt: row.recalledAt,
    });
    if (!decision.ok) throw new Error(recallErrorCode("duty", decision.code));
    const now = Date.now();
    await ctx.db.patch(row._id, { recalledAt: now, updatedAt: now });
    return { recalled: true };
  },
});
