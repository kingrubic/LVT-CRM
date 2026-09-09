import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertEntityCode } from "./entityCodes";
import {
  adminPermissionOrThrow,
  currentUserOrThrow,
  hasActiveNameConflict,
  isOperationalManagerRole,
  resolveUserMenuAccess,
} from "./lib";
import {
  DEFAULT_DOCUMENT_TYPES,
  requireDocumentTypeId,
  sortDocumentTypes,
} from "./documentTypePolicy";

export { DEFAULT_DOCUMENT_TYPES, requireDocumentTypeId, sortDocumentTypes };

function cleanDocumentType(args: { name: string; code: string }) {
  const name = args.name.trim();
  const code = assertEntityCode(args.code);
  if (!name || name.length > 120) throw new Error("INVALID_NAME");
  return { name, code };
}

async function assertDocumentTypeNameAvailable(ctx: { db: any }, name: string, excludeId?: string) {
  const types = await ctx.db.query("documentTypes").collect();
  if (hasActiveNameConflict(types, name, excludeId)) {
    throw new Error("DOCUMENT_TYPE_NAME_TAKEN");
  }
}

export async function ensureDefaultDocumentTypes(ctx: { db: any }, now = Date.now()) {
  const created: string[] = [];
  for (const item of DEFAULT_DOCUMENT_TYPES) {
    const existing = await ctx.db
      .query("documentTypes")
      .withIndex("by_code", (q: any) => q.eq("code", item.code))
      .unique();
    if (existing) {
      if (!existing.active) {
        await ctx.db.patch(existing._id, { name: item.name, active: true, updatedAt: now });
      }
      continue;
    }
    const id = await ctx.db.insert("documentTypes", {
      code: item.code,
      name: item.name,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    created.push(String(id));
  }
  return created;
}

export async function listActiveDocumentTypes(ctx: { db: any }) {
  const types = await ctx.db.query("documentTypes").collect();
  return sortDocumentTypes(types.filter((item: any) => item.active)).map((item: any) => ({
    _id: item._id,
    name: item.name,
    code: item.code,
  }));
}

export async function assertActiveDocumentType(ctx: { db: any }, documentTypeId: string) {
  const id = ctx.db.normalizeId("documentTypes", documentTypeId);
  if (!id) throw new Error("INVALID_DOCUMENT_TYPE");
  const row = await ctx.db.get(id);
  if (!row?.active || !row.name || !row.code) {
    throw new Error("INVALID_DOCUMENT_TYPE");
  }
  return row;
}

async function documentTypeInUse(ctx: { db: any }, documentTypeId: string) {
  const id = String(documentTypeId);
  const [documents, workItems, personalTasks] = await Promise.all([
    ctx.db.query("officeDocuments").collect(),
    ctx.db.query("workItems").collect(),
    ctx.db.query("personalTasks").collect(),
  ]);
  if (documents.some((row: any) => String(row.documentTypeId || "") === id)) return true;
  const completionUsesType = (rows: any[]) =>
    rows.some((row: any) =>
      (row.completions || []).some((item: any) => String(item.documentTypeId || "") === id),
    );
  return completionUsesType(workItems) || completionUsesType(personalTasks);
}

async function requireDocumentTypeReader(ctx: any) {
  const user = await currentUserOrThrow(ctx);
  if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
  if (isOperationalManagerRole(user.role)) return user;
  const menuAccess = await resolveUserMenuAccess(ctx, user);
  if (menuAccess.work === "hidden") throw new Error("FORBIDDEN: work menu hidden");
  return user;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await adminPermissionOrThrow(ctx, "settings:read");
    const types = await ctx.db.query("documentTypes").collect();
    return {
      documentTypes: sortDocumentTypes(types),
    };
  },
});

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    await requireDocumentTypeReader(ctx);
    return { documentTypes: await listActiveDocumentTypes(ctx) };
  },
});

export const ensureDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    await requireDocumentTypeReader(ctx);
    const created = await ensureDefaultDocumentTypes(ctx);
    return { createdCount: created.length };
  },
});

export const create = mutation({
  args: { name: v.string(), code: v.string() },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "settings:write");
    const input = cleanDocumentType(args);
    const existing = await ctx.db
      .query("documentTypes")
      .withIndex("by_code", (q) => q.eq("code", input.code))
      .unique();
    await assertDocumentTypeNameAvailable(ctx, input.name, existing && !existing.active ? existing._id : undefined);
    const now = Date.now();
    if (existing) {
      if (existing.active) throw new Error("CODE_TAKEN");
      await ctx.db.patch(existing._id, { ...input, active: true, updatedAt: now });
      await ctx.db.insert("auditLogs", {
        actorUserId: actor.user._id,
        action: "document_type.reactivate",
        details: JSON.stringify({ id: existing._id, ...input }),
        at: now,
      });
      return existing._id;
    }
    const id = await ctx.db.insert("documentTypes", {
      ...input,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "document_type.create",
      details: JSON.stringify({ id, ...input }),
      at: now,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("documentTypes"),
    name: v.string(),
    code: v.string(),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "settings:write");
    const current = await ctx.db.get(args.id);
    if (!current) throw new Error("DOCUMENT_TYPE_NOT_FOUND");
    const input = cleanDocumentType(args);
    const duplicate = await ctx.db
      .query("documentTypes")
      .withIndex("by_code", (q) => q.eq("code", input.code))
      .unique();
    if (duplicate && duplicate._id !== args.id) throw new Error("CODE_TAKEN");
    await assertDocumentTypeNameAvailable(ctx, input.name, args.id);
    const now = Date.now();
    await ctx.db.patch(args.id, {
      ...input,
      active: args.active ?? current.active,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "document_type.update",
      details: JSON.stringify({ id: args.id, ...input }),
      at: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("documentTypes") },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "settings:write");
    const current = await ctx.db.get(args.id);
    if (!current) throw new Error("DOCUMENT_TYPE_NOT_FOUND");
    if (await documentTypeInUse(ctx, args.id)) {
      throw new Error("DOCUMENT_TYPE_IN_USE");
    }
    const now = Date.now();
    await ctx.db.patch(args.id, { active: false, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "document_type.remove",
      details: JSON.stringify({ id: args.id, code: current.code }),
      at: now,
    });
  },
});
