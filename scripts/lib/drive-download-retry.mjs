const TRANSIENT_DRIVE_PATTERNS = [
  /context deadline exceeded/i,
  /client\.timeout/i,
  /request canceled/i,
  /timeout while awaiting headers/i,
  /timed? out/i,
  /econnreset/i,
  /econnrefused/i,
  /socket hang up/i,
  /temporarily unavailable/i,
  /service unavailable/i,
  /rate limit/i,
  /\b429\b/,
  /\b5\d\d\b/,
];

function errorText(error) {
  if (!(error instanceof Error)) return String(error || '');
  return [error.message, error.stderr, error.stdout, error.cause?.message]
    .filter(Boolean)
    .join('\n');
}

export function isTransientDriveDownloadError(error) {
  const text = errorText(error);
  return TRANSIENT_DRIVE_PATTERNS.some((pattern) => pattern.test(text));
}

export async function retryDriveDownload(
  download,
  {
    attempts = 3,
    delays = [300, 900],
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    onRetry = () => {},
  } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await download(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isTransientDriveDownloadError(error)) throw error;
      onRetry(error, attempt);
      await sleep(delays[Math.min(attempt - 1, delays.length - 1)] ?? 0);
    }
  }
  throw lastError;
}
