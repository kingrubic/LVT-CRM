import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";
import { currentUserOrThrow } from "./lib";

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

type AvatarKind = "jpeg" | "png" | "webp";

export function detectAvatarKind(bytes: Uint8Array): AvatarKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (
    bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export function avatarStoredFile(kind: AvatarKind): { fileName: string; contentType: string } {
  if (kind === "png") return { fileName: "avatar.png", contentType: "image/png" };
  if (kind === "webp") return { fileName: "avatar.webp", contentType: "image/webp" };
  return { fileName: "avatar.jpg", contentType: "image/jpeg" };
}

export function hexFromBuffer(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function publicSessionUser(user: Record<string, unknown>) {
  const {
    avatarStorageId,
    avatarFileName: _avatarFileName,
    avatarContentType: _avatarContentType,
    avatarSize: _avatarSize,
    avatarChecksum,
    avatarUpdatedAt,
    ...safe
  } = user as {
    avatarStorageId?: string;
    avatarFileName?: string;
    avatarContentType?: string;
    avatarSize?: number;
    avatarChecksum?: string;
    avatarUpdatedAt?: number;
  } & Record<string, unknown>;
  return {
    ...safe,
    hasAvatar: Boolean(avatarStorageId),
    avatarVersion: avatarChecksum || (avatarUpdatedAt != null ? `t${avatarUpdatedAt}` : null),
  };
}

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
