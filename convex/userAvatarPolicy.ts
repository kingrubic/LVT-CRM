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
