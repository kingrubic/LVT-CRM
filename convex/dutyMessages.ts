import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { dutyListTitle, isDutyParticipant } from "./assignmentPolicy";
import { requireDutiesAccess } from "./duties";
import { isSameDepartmentSubordinate } from "./lib";
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
    const messages = [...rows]
      .filter((row: any) => row.active)
      .reverse()
      .map((row: any) => {
        const author = usersById.get(String(row.authorUserId));
        const authorName = displayName(author);
        return {
          _id: row._id,
          authorUserId: row.authorUserId,
          authorName,
          authorInitials: workChatAuthorInitials(authorName),
          bodyHtml: sanitizeWorkMessageHtml(row.bodyHtml),
          createdAt: row.createdAt,
          isSelf: String(row.authorUserId) === String(user._id),
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
    const { user } = await authorizeDutyChat(ctx, args.dutyId);
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
    return { messageId };
  },
});
