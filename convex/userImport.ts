import { createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { adminPermissionOrThrow, authUserIdOrThrow } from "./lib";
import {
  USER_IMPORT_MAX_BYTES,
  USER_IMPORT_TTL_MS,
  assertImportUploadUsable,
  emailOccupiesImportSlot,
} from "./userImportPolicy";
import { validateUserImportRows } from "./userImportValidate";

export const listDepartmentsInternal = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("departments").collect(),
});

export const listPositionsInternal = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("positions").collect(),
});

export const listPermissionGroupsInternal = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("permissionGroups").collect(),
});

export const listUserEmailsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.filter(emailOccupiesImportSlot).map((u) => u.email || "").filter(Boolean);
  },
});

export const getUploadInternal = internalQuery({
  args: { uploadId: v.id("userImportUploads") },
  handler: async (ctx, args) => await ctx.db.get(args.uploadId),
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

export const auditImportedUser = internalMutation({
  args: {
    email: v.string(),
    userId: v.id("users"),
    departmentId: v.string(),
    permissionGroupId: v.string(),
    positionId: v.string(),
    actorUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      action: "user.import_create",
      targetUserId: args.userId,
      targetEmail: args.email,
      details: JSON.stringify({
        departmentId: args.departmentId,
        permissionGroupId: args.permissionGroupId,
        positionId: args.positionId,
      }),
      at: Date.now(),
    });
  },
});

/** Soft-disable users created mid-batch when import rolls back. */
export const rollbackImportedUser = internalMutation({
  args: { userId: v.id("users"), actorUserId: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.userId, {
      status: "disabled",
      importRollbackAt: now,
      updatedAt: now,
      updatedBy: args.actorUserId,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      action: "user.import_rollback",
      targetUserId: args.userId,
      at: now,
    });
  },
});

/** Reuse a rolled-back import row so the same email can be committed again. */
export const reactivateImportedUser = internalMutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    departmentId: v.string(),
    permissionGroupId: v.string(),
    positionId: v.string(),
    actorUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.userId, {
      name: args.name,
      role: "user",
      departmentId: args.departmentId,
      permissionGroupId: args.permissionGroupId,
      positionId: args.positionId,
      status: "active",
      mustChangePassword: true,
      importRollbackAt: undefined,
      updatedAt: now,
      updatedBy: args.actorUserId,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: args.actorUserId,
      action: "user.import_create",
      targetUserId: args.userId,
      details: JSON.stringify({ reactivated: true }),
      at: now,
    });
  },
});

export const claimUploadForCommit = internalMutation({
  args: { uploadId: v.id("userImportUploads") },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (!upload) throw new Error("IMPORT_UPLOAD_NOT_FOUND");
    if (upload.status === "committed") throw new Error("IMPORT_UPLOAD_ALREADY_COMMITTED");
    if (upload.status === "committing") throw new Error("IMPORT_UPLOAD_IN_PROGRESS");
    if (upload.status === "expired" || Date.now() > upload.expiresAt) {
      throw new Error("IMPORT_UPLOAD_EXPIRED");
    }
    await ctx.db.patch(args.uploadId, { status: "committing" });
  },
});

export const releaseUploadClaim = internalMutation({
  args: { uploadId: v.id("userImportUploads") },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (!upload || upload.status !== "committing") return;
    await ctx.db.patch(args.uploadId, { status: "uploaded" });
  },
});

export const purgeImportUpload = internalMutation({
  args: { uploadId: v.id("userImportUploads") },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (!upload || upload.status === "expired") return;
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
    await adminPermissionOrThrow(ctx, "users:write");
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
    const { user } = await adminPermissionOrThrow(ctx, "users:write");
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
    // Always purge after 1 hour — success or validation failure.
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

type UploadDoc = {
  _id: Id<"userImportUploads">;
  storageId: Id<"_storage">;
  fileName: string;
  fileSize: number;
  uploadedBy: Id<"users">;
  status: string;
  rowCount?: number;
  createdAt: number;
  expiresAt: number;
};

type ValidateLoadResult = {
  upload: UploadDoc;
  ok: boolean;
  errors: { rowNumber: number; message: string; detail: string | null }[];
  preview: {
    rowNumber: number;
    name: string;
    email: string;
    role: "user";
    departmentCode: string;
    positionCode: string;
    permissionGroupCode: string;
    departmentId: string;
    positionId: string;
    permissionGroupId: string;
    departmentName: string;
    positionName: string;
    permissionGroupName: string;
    temporaryPassword: string;
  }[];
};

async function loadAndValidateUpload(
  ctx: { runQuery: any; runAction: any },
  args: { uploadId: Id<"userImportUploads">; actorId: Id<"users">; forCommit?: boolean },
): Promise<ValidateLoadResult> {
  const upload = (await ctx.runQuery(internal.userImport.getUploadInternal, {
    uploadId: args.uploadId,
  })) as UploadDoc | null;
  if (!upload) throw new Error("IMPORT_UPLOAD_NOT_FOUND");
  assertImportUploadUsable(upload, { actorId: args.actorId, forCommit: args.forCommit });

  const parsed = (await ctx.runAction(internal.userImportParse.parseStorageXlsx, {
    storageId: upload.storageId,
  })) as {
    ok: boolean;
    message: string | null;
    rows: {
      rowNumber: number;
      ho_ten: string;
      email: string;
      ma_phong_ban: string;
      ma_chuc_vu: string;
      ma_nhom_quyen: string;
      mat_khau_tam_thoi: string;
    }[];
  };
  if (!parsed.ok) {
    return {
      upload,
      ok: false,
      errors: [
        {
          rowNumber: 0,
          message:
            parsed.message === "INVALID_IMPORT_HEADERS"
              ? "File không đúng mẫu. Vui lòng dùng file nhập liệu mẫu của hệ thống."
              : parsed.message === "IMPORT_FILE_EMPTY"
                ? "File import trống."
                : parsed.message === "IMPORT_FILE_TOO_LARGE"
                  ? "File vượt quá giới hạn 2 MB."
                  : "Không đọc được file import từ server.",
          detail: parsed.message,
        },
      ],
      preview: [],
    };
  }

  const [departments, positions, permissionGroups, existingEmails] = await Promise.all([
    ctx.runQuery(internal.userImport.listDepartmentsInternal, {}),
    ctx.runQuery(internal.userImport.listPositionsInternal, {}),
    ctx.runQuery(internal.userImport.listPermissionGroupsInternal, {}),
    ctx.runQuery(internal.userImport.listUserEmailsInternal, {}),
  ]);
  const result = validateUserImportRows(parsed.rows, {
    departments,
    positions,
    permissionGroups,
    existingEmails,
  });
  return { upload, ok: result.ok, errors: result.errors, preview: result.ok ? result.preview : [] };
}

/** Validate by re-reading the staged server file (upload first, then check). */
export const validateUpload = action({
  args: { uploadId: v.id("userImportUploads") },
  handler: async (ctx, args): Promise<{
    ok: boolean;
    errors: { rowNumber: number; message: string; detail: string | null }[];
    preview: {
      rowNumber: number;
      name: string;
      email: string;
      role: string;
      departmentCode: string;
      positionCode: string;
      permissionGroupCode: string;
      departmentName: string;
      positionName: string;
      permissionGroupName: string;
    }[];
    fileName: string;
    expiresAt: number;
  }> => {
    const actorId = await authUserIdOrThrow(ctx);
    await ctx.runQuery(internal.users.requireAdmin, { permission: "users:write" });
    const result = await loadAndValidateUpload(ctx, { uploadId: args.uploadId, actorId });
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
      fileName: result.upload.fileName,
      expiresAt: result.upload.expiresAt,
    };
  },
});

/** Commit by re-reading the same staged server file — never trust client rows. */
export const commit = action({
  args: { uploadId: v.id("userImportUploads") },
  handler: async (
    ctx,
    args,
  ): Promise<{ createdCount: number; users: { email: string; name: string }[] }> => {
    const actorId = await authUserIdOrThrow(ctx);
    await ctx.runQuery(internal.users.requireAdmin, { permission: "users:write" });
    const result = await loadAndValidateUpload(ctx, {
      uploadId: args.uploadId,
      actorId,
      forCommit: true,
    });
    if (!result.ok) throw new Error("IMPORT_VALIDATION_FAILED");

    await ctx.runMutation(internal.userImport.claimUploadForCommit, { uploadId: args.uploadId });

    const created: Id<"users">[] = [];
    const createdUsers: { email: string; name: string }[] = [];
    try {
      for (const row of result.preview) {
        const now = Date.now();
        const existing = await ctx.runQuery(internal.users.byEmail, { email: row.email });
        let userId: Id<"users">;
        if (existing && existing.status === "disabled" && existing.importRollbackAt) {
          await modifyAccountCredentials(ctx, {
            provider: "password",
            account: { id: row.email, secret: row.temporaryPassword },
          });
          await ctx.runMutation(internal.userImport.reactivateImportedUser, {
            userId: existing._id,
            name: row.name,
            departmentId: row.departmentId,
            permissionGroupId: row.permissionGroupId,
            positionId: row.positionId,
            actorUserId: actorId,
          });
          userId = existing._id;
        } else {
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
          userId = createdAccount.user._id as Id<"users">;
          await ctx.runMutation(internal.userImport.auditImportedUser, {
            email: row.email,
            userId,
            departmentId: row.departmentId,
            permissionGroupId: row.permissionGroupId,
            positionId: row.positionId,
            actorUserId: actorId,
          });
        }
        created.push(userId);
        createdUsers.push({ email: row.email, name: row.name });
      }
    } catch (error) {
      for (const userId of created.reverse()) {
        try {
          await ctx.runMutation(internal.userImport.rollbackImportedUser, {
            userId,
            actorUserId: actorId,
          });
        } catch {
          // Best-effort rollback.
        }
      }
      try {
        await ctx.runMutation(internal.userImport.releaseUploadClaim, { uploadId: args.uploadId });
      } catch {
        // Best-effort: leave committing so a retry is explicit rather than double-create.
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
