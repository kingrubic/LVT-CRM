import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";
import { currentUserOrThrow } from "./lib";
import {
  AVATAR_MAX_BYTES,
  avatarStoredFile,
  detectAvatarKind,
  hexFromBuffer,
} from "./userAvatarPolicy";

async function deleteStorageBestEffort(
  ctx: { storage: { delete: (id: Id<"_storage">) => Promise<void> } },
  storageId: Id<"_storage"> | null | undefined,
) {
  if (!storageId) return;
  try {
    await ctx.storage.delete(storageId);
  } catch {
    // Blob may already be gone.
  }
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await currentUserOrThrow(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const setOwnAvatar = action({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.users.requireCurrentUser, {});
    const blob = await ctx.storage.get(args.storageId);
    if (!blob) throw new Error("AVATAR_UPLOAD_NOT_FOUND");
    const buffer = await blob.arrayBuffer();
    if (!buffer.byteLength) {
      await deleteStorageBestEffort(ctx, args.storageId);
      throw new Error("INVALID_AVATAR_FILE");
    }
    if (buffer.byteLength > AVATAR_MAX_BYTES || args.fileSize > AVATAR_MAX_BYTES) {
      await deleteStorageBestEffort(ctx, args.storageId);
      throw new Error("AVATAR_FILE_TOO_LARGE");
    }
    const kind = detectAvatarKind(new Uint8Array(buffer));
    if (!kind) {
      await deleteStorageBestEffort(ctx, args.storageId);
      throw new Error("INVALID_AVATAR_FILE");
    }
    const stored = avatarStoredFile(kind);
    const checksum = hexFromBuffer(await crypto.subtle.digest("SHA-256", buffer));
    const committed = await ctx.runMutation(internal.users.commitOwnAvatar, {
      storageId: args.storageId,
      fileName: stored.fileName,
      contentType: stored.contentType,
      fileSize: buffer.byteLength,
      checksum,
    });
    if (committed.previousId && String(committed.previousId) !== String(args.storageId)) {
      await deleteStorageBestEffort(ctx, committed.previousId);
    }
    return { hasAvatar: true, avatarVersion: checksum };
  },
});

export const clearOwnAvatar = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await currentUserOrThrow(ctx);
    const previousId = user.avatarStorageId;
    const now = Date.now();
    await ctx.db.patch(user._id, {
      avatarStorageId: undefined,
      avatarFileName: undefined,
      avatarContentType: undefined,
      avatarSize: undefined,
      avatarChecksum: undefined,
      avatarUpdatedAt: undefined,
      updatedAt: now,
      updatedBy: String(user._id),
    });
    await deleteStorageBestEffort(ctx, previousId);
    return { hasAvatar: false, avatarVersion: null };
  },
});

export const authorizeAvatarDownload = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUserOrThrow(ctx);
    if (!user.avatarStorageId) throw new Error("AVATAR_NOT_FOUND");
    const storageUrl = await ctx.storage.getUrl(user.avatarStorageId);
    if (!storageUrl) throw new Error("AVATAR_NOT_FOUND");
    return {
      storageUrl,
      fileName: user.avatarFileName || "avatar.jpg",
      fileType: user.avatarContentType || "image/jpeg",
      fileSize: user.avatarSize || 0,
      fileVersion: user.avatarChecksum || (user.avatarUpdatedAt != null ? `t${user.avatarUpdatedAt}` : "avatar"),
    };
  },
});
