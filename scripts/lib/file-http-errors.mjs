export class FileHttpError extends Error {
  constructor(status, code, cause) {
    super(code, { cause });
    this.status = status;
    this.code = code;
  }
}

export function classifyFileError(error) {
  if (error instanceof FileHttpError) return error;
  const message = error instanceof Error ? error.message : String(error || 'UNKNOWN');
  if (message === 'UNAUTHORIZED' || /Unauthenticated|Authentication/i.test(message)) {
    return new FileHttpError(401, 'UNAUTHORIZED', error);
  }
  if (/FORBIDDEN|ACCESS_DENIED/i.test(message)) {
    return new FileHttpError(403, 'FILE_ACCESS_DENIED', error);
  }
  if (/NOT_FOUND/i.test(message)) return new FileHttpError(404, 'FILE_NOT_FOUND', error);
  if (/UPLOAD_(NOT_FINALIZED|CLEANUP_IN_PROGRESS|CLEANUP_CLAIM_LOST|ALREADY_COMMITTED|CLAIM_INVALID)/i.test(message)) {
    return new FileHttpError(409, 'UPLOAD_CONFLICT', error);
  }
  if (/TOO_LARGE/i.test(message)) return new FileHttpError(413, 'FILE_TOO_LARGE', error);
  if (/INVALID_FILE|SIZE_MISMATCH|INVALID_UPLOAD|ArgumentValidation|Invalid argument/i.test(message)) {
    return new FileHttpError(400, 'INVALID_FILE', error);
  }
  return new FileHttpError(500, 'FILE_SERVER_ERROR', error);
}
