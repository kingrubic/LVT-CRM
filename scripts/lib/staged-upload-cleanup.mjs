import { FileHttpError } from './file-http-errors.mjs';

export async function settleClaimedUpload({ claim, deleteDriveFile }) {
  if (!claim || !['delete', 'retain'].includes(claim.action) || !claim.driveFileId) {
    throw new FileHttpError(409, 'UPLOAD_CLAIM_INVALID');
  }
  if (claim.action === 'delete') await deleteDriveFile(claim.driveFileId);
}

export function assertStagedUploadOwner(stage, actorUserId) {
  if (!stage) throw new FileHttpError(404, 'FILE_NOT_FOUND');
  if (!actorUserId || String(actorUserId) !== String(stage.userId)) {
    throw new FileHttpError(403, 'FILE_ACCESS_DENIED');
  }
}
