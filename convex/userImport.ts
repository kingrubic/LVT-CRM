import { createAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { authUserIdOrThrow } from "./lib";
import { validateUserImportRows } from "./userImportValidate";

const USER_IMPORT_TTL_MS = 60 * 60 * 1000;
const USER_IMPORT_MAX_BYTES = 2 * 1024 * 1024;

const importRowValidator = v.object({
  rowNumber: v.number(),
  ho_ten: v.string(),
  email: v.string(),
  ma_phong_ban: v.string(),
  ma_chuc_vu: v.string(),
  ma_nhom_quyen: v.string(),
  mat_khau_tam_thoi: v.string(),
});

export const listDepartmentsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("departments").collect();
  },
});

export const listPositionsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("positions").collect();
  },
});

export const listPermissionGroupsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("permissionGroups").collect();
  },
});

export const listUserEmailsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.map((u) => u.email || "").filter(Boolean);
  },
});

export const getUploadInternal = internalQuery({
  args: { uploadId: v.id("userImportUploads") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.uploadId);
  },
});

export const markUploadCommitted = internalMutation({
  args: {
    uploadId: v.id("userImportUploads"),
    rowCount: v.number(),
  },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (!upload) throw new Error("IMPORT_UPLOAD_NOT_FOUND");
    await ctx.db.patch(args.uploadId, {
      status: "committed",
      rowCount: args.rowCount,
    });
  },
});

export const insertCreatedUser = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
    departmentId: v.string(),
    permissionGroupId: v.string(),
    positionId: v.string(),
    actorUserId: v.id("users"),
    authUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Auth createAccount already inserted the users row; patch CRM fields if needed.
    const now = Date.now();
    await ctx.db.patch(args.authUserId, {
      email: args.email,
      name: args.name,
      role: "user",
      departmentId: args.departmentId,
      permissionGroupId: args.permissionGroupId,
      positionId: args.positionId,
      status: "active",
      mustChangePassword: true,
      createdBy: args.actorUserId,
      updatedBy: args.actorUserId,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      action: "user.import_create",
      targetUserId: args.authUserId,
      targetEmail: args.email,
      details: JSON.stringify({
        departmentId: args.departmentId,
        permissionGroupId: args.permissionGroupId,
        positionId: args.positionId,
      }),
      at: now,
    });
  },
});

export const deleteImportedUser = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.userId);
  },
});

export const purgeImportUpload = internalMutation({
  args: { uploadId: v.id("userImportUploads") },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (!upload) return;
    if (upload.status === "expired") return;
    try {
      await ctx.storage.delete(upload.storageId);
    } catch {
      // Blob may already be gone.
    }
    await ctx.db.patch(args.uploadId, { status: "expired" });
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await ctx.runQuery(internal.users.requireAdmin, { permission: "users:write" });
    return await ctx.storage.generateUploadUrl();
  },
});

export const registerUpload = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(),
  },
  handler: async (ctx, args) => {
    const { user } = await (
      await import("./lib")
    ).adminPermissionOrThrow(ctx, "users:write");
    const fileName = args.fileName.trim();
    if (!fileName.toLowerCase().endsWith(".xlsx")) throw new Error("INVALID_IMPORT_FILE");
    if (!args.fileSize || args.fileSize > USER_IMPORT_MAX_BYTES) throw new Error("IMPORT_FILE_TOO_LARGE");
    const now = Date.now();
    const expiresAt = now + USER_IMPORT_TTL_MS;
    const uploadId = await ctx.db.insert("userImportUploads", {
      storageId: args.storageId,
      fileName,
      fileSize: args.fileSize,
      uploadedBy: user._id,
      status: "uploaded",
      createdAt: now,
      expiresAt,
    });
    await ctx.scheduler.runAfter(USER_IMPORT_TTL_MS, internal.userImport.purgeImportUpload, {
      uploadId,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: user._id,
      action: "user.import_upload",
      details: JSON.stringify({ uploadId, fileName, fileSize: args.fileSize }),
      at: now,
    });
    return { uploadId, expiresAt };
  },
});

export const validateRows = action({
  args: {
    rows: v.array(importRowValidator),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.users.requireAdmin, { permission: "users:write" });
    const [departments, positions, permissionGroups, existingEmails] = await Promise.all([
      ctx.runQuery(internal.userImport.listDepartmentsInternal, {}),
      ctx.runQuery(internal.userImport.listPositionsInternal, {}),
      ctx.runQuery(internal.userImport.listPermissionGroupsInternal, {}),
      ctx.runQuery(internal.userImport.listUserEmailsInternal, {}),
    ]);
    const result = validateUserImportRows(args.rows, {
      departments,
      positions,
      permissionGroups,
      existingEmails,
    });
    return {
      ok: result.ok,
      errors: result.errors,
      preview: result.ok
        ? result.preview.map((row) => ({
            rowNumber: row.rowNumber,
            name: row.name,
            email: row.email,
            role: row.role,
            departmentCode: row.departmentCode,
            positionCode: row.positionCode,
            permissionGroupCode: row.permissionGroupCode,
            departmentName: row.departmentName,
            positionName: row.positionName,
            permissionGroupName: row.permissionGroupName,
          }))
        : [],
    };
  },
});

export const commit = action({
  args: {
    uploadId: v.id("userImportUploads"),
    rows: v.array(importRowValidator),
  },
  handler: async (ctx, args): Promise<{ createdCount: number; users: { email: string; name: string }[] }> => {
    const actorId = await authUserIdOrThrow(ctx);
    await ctx.runQuery(internal.users.requireAdmin, { permission: "users:write" });

    const upload = await ctx.runQuery(internal.userImport.getUploadInternal, {
      uploadId: args.uploadId,
    });
    if (!upload) throw new Error("IMPORT_UPLOAD_NOT_FOUND");
    if (upload.uploadedBy !== actorId) throw new Error("FORBIDDEN");
    if (upload.status === "expired") throw new Error("IMPORT_UPLOAD_EXPIRED");

    const [departments, positions, permissionGroups, existingEmails] = await Promise.all([
      ctx.runQuery(internal.userImport.listDepartmentsInternal, {}),
      ctx.runQuery(internal.userImport.listPositionsInternal, {}),
      ctx.runQuery(internal.userImport.listPermissionGroupsInternal, {}),
      ctx.runQuery(internal.userImport.listUserEmailsInternal, {}),
    ]);
    const result = validateUserImportRows(args.rows, {
      departments,
      positions,
      permissionGroups,
      existingEmails,
    });
    if (!result.ok) throw new Error("IMPORT_VALIDATION_FAILED");

    const created: Id<"users">[] = [];
    const createdUsers: { email: string; name: string }[] = [];
    try {
      for (const row of result.preview) {
        const now = Date.now();
        const createdAccount = await createAccount(ctx, {
          provider: "password",
          account: { id: row.email, secret: row.temporaryPassword },
          profile: {
            email: row.email,
            name: row.name,
            role: "user",
            departmentId: row.departmentId,
            permissionGroupId: row.permissionGroupId,
            positionId: row.positionId,
            status: "active",
            mustChangePassword: true,
            createdBy: actorId,
            updatedBy: actorId,
            createdAt: now,
            updatedAt: now,
          },
        });
        const userId = createdAccount.user._id as Id<"users">;
        created.push(userId);
        createdUsers.push({ email: row.email, name: row.name });
        await ctx.runMutation(internal.userImport.insertCreatedUser, {
          email: row.email,
          name: row.name,
          departmentId: row.departmentId,
          permissionGroupId: row.permissionGroupId,
          positionId: row.positionId,
          actorUserId: actorId,
          authUserId: userId,
        });
      }
    } catch (error) {
      for (const userId of created.reverse()) {
        try {
          await ctx.runMutation(internal.userImport.deleteImportedUser, { userId });
        } catch {
          // Best-effort rollback.
        }
      }
      const message = String((error as Error)?.message ?? error);
      if (message.includes("already exists") || message.includes("Account already")) {
        throw new Error("EMAIL_TAKEN");
      }
      throw new Error("USER_IMPORT_FAILED");
    }

    await ctx.runMutation(internal.userImport.markUploadCommitted, {
      uploadId: args.uploadId,
      rowCount: created.length,
    });

    return { createdCount: created.length, users: createdUsers };
  },
});
