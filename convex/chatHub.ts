import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { dutyListTitle } from "./assignmentPolicy";
import { getWorkVisibilityMode } from "./lib";
import { listDutyChatRecipientIds, listWorkChatRecipientIds, loadWorkChatRecords } from "./chatAudience";
import {
  activeGroupMembers,
  isChatAdmin,
  loadChatGroup,
  membershipRow,
  requireChatUser,
} from "./chatGroupAccess";
import {
  archiveInbox,
  deactivateThreadInbox,
  markInboxRead,
  publishChatMessage,
  seedInboxPreview,
} from "./chatInbox";
import { CHAT_RECALLED_PLACEHOLDER } from "./chatMessagePolicy";
import {
  CHAT_BACKFILL_SCAN,
  CHAT_GROUP_LIST_LIMIT,
  CHAT_GROUP_MEMBER_LIMIT,
  CHAT_INBOX_LIST_LIMIT,
  GROUP_CREATED_PREVIEW,
  chatDisplayName,
  nextOwnerMember,
  normalizeMemberIds,
  parseThreadKey,
  threadKeyFor,
  validateGroupName,
} from "./chatHubPolicy";

const BACKFILL_START = 9_000_000_000_000_000;

function conversationFromInbox(row: any) {
  return {
    threadKey: String(row.threadKey),
    kind: row.kind,
    entityId: String(row.entityId),
    title: String(row.title || ""),
    lastBodyText: String(row.lastBodyText || ""),
    lastMessageAt: Number(row.lastMessageAt || 0),
    lastAuthorUserId: String(row.lastAuthorUserId || ""),
    unreadCount: Number(row.unreadCount || 0),
    memberCount: null as number | null,
    viewerIsMember: true,
  };
}

async function loadActiveUsersById(ctx: any, ids: string[]) {
  const map = new Map<string, any>();
  for (const id of ids) {
    if (!id || map.has(id)) continue;
    try {
      const user = await ctx.db.get(id as Id<"users">);
      if (user?.status === "active") map.set(id, user);
    } catch {
      /* skip */
    }
  }
  return map;
}

async function insertMember(ctx: any, args: {
  groupId: string;
  userId: string;
  role: "owner" | "member";
  now: number;
}) {
  const existing = await membershipRow(ctx, args.groupId, args.userId);
  if (existing) {
    await ctx.db.patch(existing._id, {
      role: args.role,
      active: true,
      joinedAt: existing.joinedAt || args.now,
      updatedAt: args.now,
    });
    return;
  }
  await ctx.db.insert("chatGroupMembers", {
    groupId: args.groupId,
    userId: args.userId,
    role: args.role,
    active: true,
    joinedAt: args.now,
    createdAt: args.now,
    updatedAt: args.now,
  });
}

async function requireOwnedGroup(ctx: any, groupId: string) {
  const user = await requireChatUser(ctx);
  const group = await loadChatGroup(ctx, groupId);
  if (!group?.active) throw new Error("GROUP_NOT_FOUND");
  if (String(group.ownerUserId) !== String(user._id)) throw new Error("GROUP_FORBIDDEN");
  return { user, group };
}

async function syncState(ctx: any, scope: string) {
  return await ctx.db
    .query("chatHubSync")
    .withIndex("by_scope", (q: any) => q.eq("scope", scope))
    .first();
}

async function saveSync(ctx: any, scope: string, state: any, patch: { cursor: number; done: boolean }) {
  const now = Date.now();
  if (!state) {
    await ctx.db.insert("chatHubSync", { scope, cursor: patch.cursor, done: patch.done, updatedAt: now });
    return;
  }
  await ctx.db.patch(state._id, { cursor: patch.cursor, done: patch.done, updatedAt: now });
}

async function skipThread(ctx: any, kind: "work" | "duty", entityId: string, row: any) {
  const now = Date.now();
  await ctx.db.insert("chatThreads", {
    threadKey: threadKeyFor(kind, entityId),
    kind,
    entityId,
    title: "",
    lastBodyText: "",
    lastMessageAt: Number(row.createdAt || 0),
    lastAuthorUserId: String(row.authorUserId || ""),
    active: false,
    createdAt: now,
    updatedAt: now,
  });
}

async function fanoutHistorical(ctx: any, kind: "work" | "duty", row: any) {
  const entityId = kind === "work" ? String(row.documentId || "") : String(row.dutyId || "");
  if (!entityId) return;
  const existing = await ctx.db
    .query("chatThreads")
    .withIndex("by_thread_key", (q: any) => q.eq("threadKey", threadKeyFor(kind, entityId)))
    .first();
  if (existing) return;
  const preview = row.recalledAt ? CHAT_RECALLED_PLACEHOLDER : String(row.bodyText || "");
  if (kind === "duty") {
    let duty = null;
    try {
      duty = await ctx.db.get(entityId as Id<"duties">);
    } catch {
      duty = null;
    }
    if (!duty?.active) {
      await skipThread(ctx, kind, entityId, row);
      return;
    }
    const users = await ctx.db.query("users").collect();
    const positions = await ctx.db.query("positions").collect();
    const recipientIds = await listDutyChatRecipientIds(ctx, {
      authorUserId: String(row.authorUserId || ""),
      duty,
      users,
      positions,
    });
    await publishChatMessage(ctx, {
      kind,
      entityId,
      title: dutyListTitle(duty),
      bodyText: preview,
      createdAt: row.createdAt,
      authorUserId: String(row.authorUserId || ""),
      recipientIds,
      historical: true,
    });
    return;
  }
  const records = await loadWorkChatRecords(ctx, entityId);
  if (!records.document?.active) {
    await skipThread(ctx, kind, entityId, row);
    return;
  }
  const positions = await ctx.db.query("positions").collect();
  const visibilityMode = await getWorkVisibilityMode(ctx);
  const users = [...records.usersById.values()];
  const recipientIds = await listWorkChatRecipientIds(ctx, {
    authorUserId: String(row.authorUserId || ""),
    document: records.document,
    workItems: records.workItems,
    personalTasks: records.personalTasks,
    users,
    usersById: records.usersById,
    positions,
    visibilityMode,
  });
  const document = records.document;
  await publishChatMessage(ctx, {
    kind,
    entityId,
    title: String(document.title || document.fileName || document.content || "Công việc"),
    bodyText: preview,
    createdAt: row.createdAt,
    authorUserId: String(row.authorUserId || ""),
    recipientIds,
    historical: true,
  });
}

async function stepBackfill(ctx: any, scope: "work" | "duty") {
  const state = await syncState(ctx, scope);
  if (state?.done) return { done: true };
  const cursor = Number.isFinite(state?.cursor) ? Number(state.cursor) : BACKFILL_START;
  const table = scope === "work" ? "workMessages" : "dutyMessages";
  const rows = await ctx.db
    .query(table)
    .withIndex("by_created", (q: any) => q.lt("createdAt", cursor))
    .order("desc")
    .take(CHAT_BACKFILL_SCAN);
  if (!rows.length) {
    await saveSync(ctx, scope, state, { cursor, done: true });
    return { done: true };
  }
  let fanouts = 0;
  let nextCursor = Number(rows[rows.length - 1].createdAt || cursor);
  let stopped = false;
  for (const row of rows) {
    if (row.active === false) continue;
    const entityId = scope === "work" ? String(row.documentId || "") : String(row.dutyId || "");
    if (!entityId) continue;
    const existing = await ctx.db
      .query("chatThreads")
      .withIndex("by_thread_key", (q: any) => q.eq("threadKey", threadKeyFor(scope, entityId)))
      .first();
    if (existing) continue;
    if (fanouts >= 1) {
      nextCursor = Number(row.createdAt || 0) + 1;
      stopped = true;
      break;
    }
    await fanoutHistorical(ctx, scope, row);
    fanouts += 1;
  }
  const done = !stopped && rows.length < CHAT_BACKFILL_SCAN;
  if (nextCursor === cursor) nextCursor = cursor - 1;
  await saveSync(ctx, scope, state, { cursor: nextCursor, done });
  return { done: false };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireChatUser(ctx);
    const userId = String(user._id);
    const inbox = await ctx.db
      .query("chatInbox")
      .withIndex("by_user_active_activity", (q: any) => q.eq("userId", userId).eq("active", true))
      .order("desc")
      .take(CHAT_INBOX_LIST_LIMIT);
    const conversations = inbox.map(conversationFromInbox);
    const seen = new Set(conversations.map((item: { threadKey: string }) => item.threadKey));
    if (isChatAdmin(user)) {
      const groups = await ctx.db
        .query("chatGroups")
        .withIndex("by_active_activity", (q: any) => q.eq("active", true))
        .order("desc")
        .take(CHAT_GROUP_LIST_LIMIT);
      for (const group of groups) {
        const threadKey = threadKeyFor("group", String(group._id));
        if (seen.has(threadKey)) {
          const row = conversations.find((item: { threadKey: string }) => item.threadKey === threadKey);
          if (row) row.memberCount = Number(group.memberCount || 0);
          continue;
        }
        conversations.push({
          threadKey,
          kind: "group",
          entityId: String(group._id),
          title: String(group.name || "Nhóm"),
          lastBodyText: String(group.lastBodyText || ""),
          lastMessageAt: Number(group.lastMessageAt || group.createdAt || 0),
          lastAuthorUserId: String(group.lastAuthorUserId || ""),
          unreadCount: 0,
          memberCount: Number(group.memberCount || 0),
          viewerIsMember: false,
        });
      }
    }
    conversations.sort((a: { lastMessageAt: number }, b: { lastMessageAt: number }) => b.lastMessageAt - a.lastMessageAt);
    const [workSync, dutySync] = await Promise.all([syncState(ctx, "work"), syncState(ctx, "duty")]);
    return {
      currentUserId: userId,
      isAdmin: isChatAdmin(user),
      backfillPending: !workSync?.done || !dutySync?.done,
      conversations,
    };
  },
});

export const unreadTotal = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireChatUser(ctx);
    const row = await ctx.db
      .query("chatCounters")
      .withIndex("by_user", (q: any) => q.eq("userId", String(user._id)))
      .first();
    return { count: Number(row?.unreadTotal || 0) };
  },
});

export const markRead = mutation({
  args: { threadKey: v.string() },
  handler: async (ctx, args) => {
    const user = await requireChatUser(ctx);
    if (!parseThreadKey(args.threadKey)) return { unread: 0 };
    return await markInboxRead(ctx, String(user._id), args.threadKey);
  },
});

export const archiveMine = mutation({
  args: { threadKey: v.string() },
  handler: async (ctx, args) => {
    const user = await requireChatUser(ctx);
    if (!parseThreadKey(args.threadKey)) return { ok: false };
    await archiveInbox(ctx, String(user._id), args.threadKey);
    return { ok: true };
  },
});

export const continueBackfill = mutation({
  args: {},
  handler: async (ctx) => {
    await requireChatUser(ctx);
    const work = await syncState(ctx, "work");
    if (!work?.done) {
      const step = await stepBackfill(ctx, "work");
      return { done: false, scope: "work" as const, scopeDone: step.done };
    }
    const duty = await syncState(ctx, "duty");
    if (!duty?.done) {
      const step = await stepBackfill(ctx, "duty");
      return { done: false, scope: "duty" as const, scopeDone: step.done };
    }
    return { done: true, scope: "duty" as const, scopeDone: true };
  },
});

export const directory = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireChatUser(ctx);
    // ponytail: one active-staff collect when the picker opens. Same table the chat send path already loads; paginate if the school outgrows a single staff directory.
    const [users, departments] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("departments").collect(),
    ]);
    const departmentName = new Map(departments.map((row: any) => [String(row._id), String(row.name || "")]));
    const people = users
      .filter((row: any) => row.status === "active" && String(row._id) !== String(user._id))
      .map((row: any) => ({
        userId: String(row._id),
        name: chatDisplayName(row),
        email: String(row.email || ""),
        departmentName: departmentName.get(String(row.departmentId || "")) || "",
      }))
      .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "vi"));
    return { people };
  },
});

export const groupState = query({
  args: { groupId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireChatUser(ctx);
    const group = await loadChatGroup(ctx, args.groupId);
    if (!group?.active) return null;
    const member = await membershipRow(ctx, args.groupId, String(user._id));
    const viewerIsMember = Boolean(member?.active);
    const viewerIsAdmin = isChatAdmin(user);
    if (!viewerIsMember && !viewerIsAdmin) return null;
    const members = await activeGroupMembers(ctx, args.groupId);
    const names = await loadActiveUsersById(ctx, members.map((row: any) => String(row.userId)));
    return {
      groupId: String(group._id),
      name: String(group.name || ""),
      memberCount: Number(group.memberCount || members.length),
      ownerUserId: String(group.ownerUserId || ""),
      viewerIsMember,
      viewerIsOwner: String(group.ownerUserId) === String(user._id),
      viewerIsAdmin,
      canManage: String(group.ownerUserId) === String(user._id),
      canDissolve: String(group.ownerUserId) === String(user._id) || viewerIsAdmin,
      canLeave: viewerIsMember,
      canSend: viewerIsMember,
      members: members
        .map((row: any) => {
          const person = names.get(String(row.userId));
          return {
            userId: String(row.userId),
            name: person ? chatDisplayName(person) : "Người dùng",
            role: row.role === "owner" || String(row.userId) === String(group.ownerUserId) ? "owner" : "member",
            isSelf: String(row.userId) === String(user._id),
          };
        })
        .sort((a: { role: string; name: string }, b: { role: string; name: string }) => {
          if (a.role !== b.role) return a.role === "owner" ? -1 : 1;
          return a.name.localeCompare(b.name, "vi");
        }),
    };
  },
});

export const createGroup = mutation({
  args: {
    name: v.string(),
    memberIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireChatUser(ctx);
    const nameCheck = validateGroupName(args.name);
    if (!nameCheck.ok) throw new Error(nameCheck.code);
    const memberIds = normalizeMemberIds(args.memberIds, String(user._id));
    if (!memberIds.length) throw new Error("GROUP_MEMBERS_REQUIRED");
    if (memberIds.length + 1 > CHAT_GROUP_MEMBER_LIMIT) throw new Error("GROUP_TOO_MANY_MEMBERS");
    const people = await loadActiveUsersById(ctx, memberIds);
    if (people.size !== memberIds.length) throw new Error("GROUP_MEMBER_INVALID");
    const now = Date.now();
    const groupId = await ctx.db.insert("chatGroups", {
      name: nameCheck.name,
      ownerUserId: String(user._id),
      memberCount: memberIds.length + 1,
      lastBodyText: GROUP_CREATED_PREVIEW,
      lastMessageAt: now,
      lastAuthorUserId: "",
      active: true,
      createdBy: String(user._id),
      createdAt: now,
      updatedAt: now,
    });
    await insertMember(ctx, { groupId: String(groupId), userId: String(user._id), role: "owner", now });
    const everyone = [String(user._id), ...memberIds];
    for (const userId of memberIds) {
      await insertMember(ctx, { groupId: String(groupId), userId, role: "member", now });
    }
    for (const userId of everyone) {
      await seedInboxPreview(ctx, {
        userId,
        kind: "group",
        entityId: String(groupId),
        title: nameCheck.name,
        bodyText: GROUP_CREATED_PREVIEW,
        createdAt: now,
        authorUserId: "",
      });
    }
    return { groupId };
  },
});

export const renameGroup = mutation({
  args: { groupId: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const { group } = await requireOwnedGroup(ctx, args.groupId);
    const nameCheck = validateGroupName(args.name);
    if (!nameCheck.ok) throw new Error(nameCheck.code);
    const now = Date.now();
    await ctx.db.patch(group._id, { name: nameCheck.name, updatedAt: now });
    const threadKey = threadKeyFor("group", String(group._id));
    const threads = await ctx.db
      .query("chatThreads")
      .withIndex("by_thread_key", (q: any) => q.eq("threadKey", threadKey))
      .collect();
    for (const thread of threads) {
      await ctx.db.patch(thread._id, { title: nameCheck.name, updatedAt: now });
    }
    const inbox = await ctx.db
      .query("chatInbox")
      .withIndex("by_thread", (q: any) => q.eq("threadKey", threadKey))
      .collect();
    for (const row of inbox) {
      await ctx.db.patch(row._id, { title: nameCheck.name, updatedAt: now });
    }
    return { name: nameCheck.name };
  },
});

export const addMembers = mutation({
  args: { groupId: v.string(), memberIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const { group } = await requireOwnedGroup(ctx, args.groupId);
    const memberIds = normalizeMemberIds(args.memberIds, String(group.ownerUserId));
    if (!memberIds.length) throw new Error("GROUP_MEMBERS_REQUIRED");
    const current = await activeGroupMembers(ctx, String(group._id));
    const activeIds = new Set(current.map((row: any) => String(row.userId)));
    const adding = memberIds.filter((id) => !activeIds.has(id));
    if (!adding.length) return { added: 0 };
    if (activeIds.size + adding.length > CHAT_GROUP_MEMBER_LIMIT) throw new Error("GROUP_TOO_MANY_MEMBERS");
    const people = await loadActiveUsersById(ctx, adding);
    if (people.size !== adding.length) throw new Error("GROUP_MEMBER_INVALID");
    const now = Date.now();
    for (const userId of adding) {
      await insertMember(ctx, { groupId: String(group._id), userId, role: "member", now });
      await seedInboxPreview(ctx, {
        userId,
        kind: "group",
        entityId: String(group._id),
        title: String(group.name || "Nhóm"),
        bodyText: String(group.lastBodyText || GROUP_CREATED_PREVIEW),
        createdAt: Number(group.lastMessageAt || now),
        authorUserId: String(group.lastAuthorUserId || ""),
      });
    }
    await ctx.db.patch(group._id, { memberCount: activeIds.size + adding.length, updatedAt: now });
    return { added: adding.length };
  },
});

export const removeMember = mutation({
  args: { groupId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const { group } = await requireOwnedGroup(ctx, args.groupId);
    const userId = String(args.userId || "");
    if (!userId || userId === String(group.ownerUserId)) throw new Error("GROUP_FORBIDDEN");
    const member = await membershipRow(ctx, String(group._id), userId);
    if (!member?.active) throw new Error("GROUP_MEMBER_INVALID");
    const now = Date.now();
    await ctx.db.patch(member._id, { active: false, leftAt: now, updatedAt: now });
    await archiveInbox(ctx, userId, threadKeyFor("group", String(group._id)));
    await ctx.db.patch(group._id, {
      memberCount: Math.max(1, Number(group.memberCount || 1) - 1),
      updatedAt: now,
    });
    return { removed: true };
  },
});

async function dissolveGroupRecord(ctx: any, group: any) {
  const now = Date.now();
  await ctx.db.patch(group._id, { active: false, updatedAt: now });
  const members = await activeGroupMembers(ctx, String(group._id));
  for (const member of members) {
    await ctx.db.patch(member._id, { active: false, leftAt: now, updatedAt: now });
  }
  await deactivateThreadInbox(ctx, threadKeyFor("group", String(group._id)));
}

export const leaveGroup = mutation({
  args: { groupId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireChatUser(ctx);
    const group = await loadChatGroup(ctx, args.groupId);
    if (!group?.active) throw new Error("GROUP_NOT_FOUND");
    const member = await membershipRow(ctx, args.groupId, String(user._id));
    if (!member?.active) throw new Error("GROUP_FORBIDDEN");
    const members = await activeGroupMembers(ctx, String(group._id));
    const others = members.filter((row: any) => String(row.userId) !== String(user._id));
    if (!others.length) {
      await dissolveGroupRecord(ctx, group);
      return { left: true, dissolved: true };
    }
    const now = Date.now();
    if (String(group.ownerUserId) === String(user._id)) {
      const next = nextOwnerMember(
        members.map((row: any) => ({
          userId: String(row.userId),
          joinedAt: Number(row.joinedAt || 0),
          role: row.role,
        })),
        String(user._id),
      );
      if (!next) {
        await dissolveGroupRecord(ctx, group);
        return { left: true, dissolved: true };
      }
      await ctx.db.patch(group._id, { ownerUserId: next.userId, memberCount: others.length, updatedAt: now });
      const nextRow = members.find((row: any) => String(row.userId) === next.userId);
      if (nextRow) await ctx.db.patch(nextRow._id, { role: "owner", updatedAt: now });
    } else {
      await ctx.db.patch(group._id, { memberCount: others.length, updatedAt: now });
    }
    await ctx.db.patch(member._id, { active: false, leftAt: now, updatedAt: now });
    await archiveInbox(ctx, String(user._id), threadKeyFor("group", String(group._id)));
    return { left: true, dissolved: false };
  },
});

export const dissolveGroup = mutation({
  args: { groupId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireChatUser(ctx);
    const group = await loadChatGroup(ctx, args.groupId);
    if (!group?.active) throw new Error("GROUP_NOT_FOUND");
    const isOwner = String(group.ownerUserId) === String(user._id);
    if (!isOwner && !isChatAdmin(user)) throw new Error("GROUP_FORBIDDEN");
    await dissolveGroupRecord(ctx, group);
    return { dissolved: true };
  },
});
