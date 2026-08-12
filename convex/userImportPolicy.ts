/** Shared bulk-import upload rules (TTL, size, commit state). */

export const USER_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const USER_IMPORT_TTL_MS = 60 * 60 * 1000;

export type ImportUploadState = {
  uploadedBy: string;
  status: string;
  expiresAt: number;
  fileSize?: number;
};

export function isImportUploadExpired(upload: { status: string; expiresAt: number }, now = Date.now()) {
  return upload.status === "expired" || now > upload.expiresAt;
}

/**
 * Staged Excel must belong to the actor, stay within the 1-hour TTL, and
 * (for commit) must not already be committed or in-flight.
 */
export function assertImportUploadUsable(
  upload: ImportUploadState,
  args: { actorId: string; now?: number; forCommit?: boolean },
) {
  if (String(upload.uploadedBy) !== String(args.actorId)) throw new Error("FORBIDDEN");
  const now = args.now ?? Date.now();
  if (isImportUploadExpired(upload, now)) throw new Error("IMPORT_UPLOAD_EXPIRED");
  if (args.forCommit) {
    if (upload.status === "committed") throw new Error("IMPORT_UPLOAD_ALREADY_COMMITTED");
    if (upload.status === "committing") throw new Error("IMPORT_UPLOAD_IN_PROGRESS");
  }
}

/** Disabled users left by a failed import batch must not block a retry of the same emails. */
export function emailOccupiesImportSlot(user: {
  email?: string | null;
  status: string;
  importRollbackAt?: number;
}) {
  if (!user.email) return false;
  return !(user.status === "disabled" && user.importRollbackAt);
}
