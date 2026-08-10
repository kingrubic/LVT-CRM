import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { promisify } from 'node:util';
import { execFile, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import { DriveUploadStages } from './lib/drive-upload-stages.mjs';
import { canonicalUploadMime, downloadContentPolicy } from './lib/file-content-policy.mjs';
import { FileHttpError, classifyFileError } from './lib/file-http-errors.mjs';
import { matchDriveMutationRoute } from './lib/file-route-policy.mjs';
import { assertStagedUploadOwner, settleClaimedUpload } from './lib/staged-upload-cleanup.mjs';
import { authorizeUpload, uploadApiForPurpose } from './lib/upload-authorization.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(projectRoot, 'dist');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3007);
const convexUrl = process.env.CONVEX_URL
  || process.env.CONVEX_SELF_HOSTED_URL
  || 'http://127.0.0.1:3210';
const driveAccount = process.env.LVT_DRIVE_ACCOUNT || 'bemiagent@gmail.com';
const maxFileSize = 20 * 1024 * 1024;
const acceptedExtensions = new Set(['pdf', 'docx', 'xlsx', 'xls', 'png', 'jpg', 'jpeg']);
const execFileAsync = promisify(execFile);
const uploadStages = new DriveUploadStages(
  process.env.LVT_DRIVE_UPLOAD_STATE_PATH
    || path.join(projectRoot, '.runtime', 'drive-upload-stages.json'),
);

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function applySecurityHeaders(response) {
  response.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
}

function bearerToken(request) {
  const header = String(request.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function safeFileName(request) {
  try {
    const name = decodeURIComponent(String(request.headers['x-file-name'] || '')).trim();
    const extension = name.toLowerCase().split('.').pop() || '';
    if (!name || name.length > 255 || name.includes('/') || name.includes('\\')) return null;
    return acceptedExtensions.has(extension) ? name : null;
  } catch {
    return null;
  }
}

function applyPrivateDownloadHeaders(response, fileName, size) {
  const policy = downloadContentPolicy(fileName);
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('Content-Disposition', `${policy.disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  response.setHeader('Content-Length', size);
  response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  response.setHeader('Content-Type', policy.mimeType);
}

function driveFolderId() {
  if (process.env.LVT_DRIVE_FOLDER_ID) return process.env.LVT_DRIVE_FOLDER_ID;
  return execFileSync(
    '/usr/bin/security',
    ['find-generic-password', '-s', 'lvt-crm-drive-folder-id', '-a', driveAccount, '-w'],
    { encoding: 'utf8' },
  ).trim();
}

async function authorizedClient(request) {
  const token = bearerToken(request);
  if (!token) throw new Error('UNAUTHORIZED');
  const client = new ConvexHttpClient(convexUrl);
  client.setAuth(token);
  return client;
}

function uploadApi(stage, name) {
  return uploadApiForPurpose(stage.purpose)[name];
}

async function deleteDriveFile(driveFileId) {
  if (!driveFileId || !/^[a-zA-Z0-9_-]+$/.test(driveFileId)) {
    throw new FileHttpError(400, 'INVALID_FILE');
  }
  try {
    await execFileAsync(
      '/opt/homebrew/bin/gog',
      ['drive', 'delete', driveFileId, '--account', driveAccount, '--no-input'],
      { maxBuffer: 1024 * 1024 },
    );
  } catch (error) {
    const detail = `${error?.stderr || ''} ${error?.message || ''}`;
    if (/not found|does not exist|404/i.test(detail)) return;
    throw new FileHttpError(502, 'DRIVE_DELETE_FAILED', error);
  }
}

async function settleClaimedStage(client, cleanupToken, stage) {
  const claimId = randomUUID();
  const claim = await client.mutation(uploadApi(stage, 'claimStagedUploadCleanup'), {
    cleanupToken,
    claimId,
  });
  try {
    await settleClaimedUpload({ claim, deleteDriveFile });
    if (claim.action === 'delete') {
      await client.mutation(uploadApi(stage, 'completeStagedUploadCleanup'), {
        cleanupToken,
        claimId,
      });
    }
  } catch (error) {
    if (claim.action === 'delete') {
      try {
        await client.mutation(uploadApi(stage, 'releaseStagedUploadCleanup'), {
          cleanupToken,
          claimId,
        });
      } catch (releaseError) {
        console.error('LVT upload cleanup claim release failed', {
          cleanupToken,
          code: releaseError instanceof Error ? releaseError.message : 'UNKNOWN',
        });
      }
    }
    throw error;
  }
}

async function collectStaleUploads(client, actorUserId) {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [cleanupToken, stage] of await uploadStages.entries()) {
    if (stage.userId !== String(actorUserId) || stage.createdAt > cutoff) continue;
    try {
      await settleClaimedStage(client, cleanupToken, stage);
      await uploadStages.remove(cleanupToken);
    } catch (error) {
      console.error('LVT stale upload cleanup failed', {
        cleanupToken,
        code: error instanceof Error ? error.message : 'UNKNOWN',
      });
    }
  }
}

async function handleStagedUpload(request, response, cleanupToken, finalizeOnly) {
  if (!/^[0-9a-f-]{36}$/i.test(cleanupToken)) throw new FileHttpError(400, 'INVALID_UPLOAD');
  const stage = await uploadStages.get(cleanupToken);
  if (!stage) throw new FileHttpError(404, 'FILE_NOT_FOUND');
  const client = await authorizedClient(request);
  const actor = await authorizeUpload(client, stage.purpose);
  assertStagedUploadOwner(stage, actor?.userId);
  if (finalizeOnly) {
    await client.mutation(uploadApi(stage, 'finalizeStagedUpload'), { cleanupToken });
  } else {
    await settleClaimedStage(client, cleanupToken, stage);
  }
  await uploadStages.remove(cleanupToken);
  response.writeHead(204);
  response.end();
}

async function handleCleanupJob(request, response, cleanupJobId) {
  const client = await authorizedClient(request);
  const job = await client.query(anyApi.peopleReview.authorizeDriveCleanupJob, { cleanupJobId });
  await deleteDriveFile(job.driveFileId);
  await client.mutation(anyApi.peopleReview.completeDriveCleanupJob, { cleanupJobId });
  response.writeHead(204);
  response.end();
}

async function uploadToDrive(request, response) {
  const fileName = safeFileName(request);
  const declaredSize = Number(request.headers['content-length'] || 0);
  // Content-Length can be absent when proxies use chunked transfer; allow and count bytes instead.
  if (!fileName) {
    console.error('LVT upload rejected before stream', {
      fileName,
      declaredSize,
      hasNameHeader: Boolean(request.headers['x-file-name']),
    });
    response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end('{"error":"INVALID_FILE"}\n');
    return;
  }
  if (declaredSize > maxFileSize) {
    response.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end('{"error":"FILE_TOO_LARGE"}\n');
    return;
  }

  const client = await authorizedClient(request);
  const purpose = String(request.headers['x-lvt-upload-purpose'] || '').trim() === 'people-review'
    ? 'people-review'
    : 'work';
  const actor = await authorizeUpload(client, purpose);
  await collectStaleUploads(client, actor?.userId);

  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'lvt-drive-upload-'));
  const temporaryFile = path.join(temporaryDirectory, 'upload.bin');
  const hash = createHash('sha256');
  let received = 0;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      received += chunk.length;
      if (received > maxFileSize) {
        callback(new Error('WORK_FILE_TOO_LARGE'));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  try {
    await pipeline(request, limiter, createWriteStream(temporaryFile, { mode: 0o600 }));
    if (received <= 0) throw new Error('INVALID_FILE');
    if (declaredSize > 0 && received !== declaredSize) throw new Error('WORK_FILE_SIZE_MISMATCH');

    let stdout;
    try {
      ({ stdout } = await execFileAsync(
        '/opt/homebrew/bin/gog',
        [
        'drive',
        'upload',
        temporaryFile,
        '--account',
        driveAccount,
        '--parent',
        driveFolderId(),
        '--name',
        fileName,
        '--mime-type',
        canonicalUploadMime(fileName),
        '--json',
        '--no-input',
        ],
        { maxBuffer: 1024 * 1024 },
      ));
    } catch (error) {
      throw new FileHttpError(502, 'DRIVE_UPLOAD_FAILED', error);
    }
    const result = JSON.parse(stdout);
    const uploaded = result.file || result.upload || result;
    if (!uploaded?.id) throw new Error('DRIVE_UPLOAD_INVALID_RESPONSE');
    const cleanupToken = randomUUID();
    const stage = {
      driveFileId: uploaded.id,
      purpose,
      userId: String(actor?.userId || ''),
      createdAt: Date.now(),
    };
    try {
      await client.mutation(uploadApi(stage, 'registerDriveUpload'), {
        cleanupToken,
        driveFileId: uploaded.id,
      });
      await uploadStages.add(cleanupToken, stage);
    } catch (error) {
      try {
        await settleClaimedStage(client, cleanupToken, stage);
      } catch {
        await deleteDriveFile(uploaded.id);
      }
      throw error;
    }

    response.writeHead(201, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    });
    response.end(`${JSON.stringify({
      driveFileId: uploaded.id,
      cleanupToken,
      driveChecksum: hash.digest('hex'),
      fileSize: received,
    })}\n`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function downloadPeopleReviewFile(request, response, kind, fileId) {
  const client = await authorizedClient(request);
  const file = await client.query(anyApi.peopleReview.authorizeFileDownload, { kind, fileId });
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'lvt-drive-download-'));
  const temporaryFile = path.join(temporaryDirectory, 'download.bin');

  try {
    await execFileAsync(
      '/opt/homebrew/bin/gog',
      [
        'drive',
        'download',
        file.driveFileId,
        '--account',
        driveAccount,
        '--out',
        temporaryFile,
        '--no-input',
      ],
      { maxBuffer: 1024 * 1024 },
    );
    const metadata = await stat(temporaryFile);
    applyPrivateDownloadHeaders(response, file.fileName, metadata.size);
    response.writeHead(200);
    await pipeline(createReadStream(temporaryFile), response);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function downloadFromDrive(request, response, documentId) {
  const client = await authorizedClient(request);
  const file = await client.query(anyApi.work.authorizeFileDownload, { documentId });
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'lvt-drive-download-'));
  const temporaryFile = path.join(temporaryDirectory, 'download.bin');

  try {
    await execFileAsync(
      '/opt/homebrew/bin/gog',
      [
        'drive',
        'download',
        file.driveFileId,
        '--account',
        driveAccount,
        '--out',
        temporaryFile,
        '--no-input',
      ],
      { maxBuffer: 1024 * 1024 },
    );
    const metadata = await stat(temporaryFile);
    applyPrivateDownloadHeaders(response, file.fileName, metadata.size);
    response.writeHead(200);
    await pipeline(createReadStream(temporaryFile), response);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function existingFile(candidate) {
  try {
    const metadata = await stat(candidate);
    return metadata.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  try {
    applySecurityHeaders(response);

    if (request.url === '/healthz') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end('{"status":"ok"}\n');
      return;
    }

    if (request.method === 'POST' && request.url === '/api/files/upload') {
      await uploadToDrive(request, response);
      return;
    }

    const driveMutation = matchDriveMutationRoute(request.method, request.url);
    if (driveMutation?.kind === 'staged-upload') {
      await handleStagedUpload(request, response, driveMutation.id, driveMutation.finalize);
      return;
    }
    if (driveMutation?.kind === 'cleanup-job') {
      await handleCleanupJob(request, response, driveMutation.id);
      return;
    }

    const peopleReviewDownload = request.method === 'GET'
      ? new URL(request.url || '/', 'http://localhost').pathname.match(/^\/api\/people-review\/files\/(fault|evaluation)\/([^/]+)$/)
      : null;
    if (peopleReviewDownload) {
      await downloadPeopleReviewFile(request, response, peopleReviewDownload[1], peopleReviewDownload[2]);
      return;
    }

    const privateDownload = request.method === 'GET'
      ? new URL(request.url || '/', 'http://localhost').pathname.match(/^\/api\/files\/([^/]+)$/)
      : null;
    if (privateDownload) {
      await downloadFromDrive(request, response, privateDownload[1]);
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'DELETE' && request.method !== 'POST') {
      response.writeHead(405, { Allow: 'GET, HEAD, POST, DELETE' });
      response.end();
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
    } catch {
      response.writeHead(400);
      response.end();
      return;
    }
    if (pathname.startsWith('/api/')) {
      response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end('{"error":"FILE_NOT_FOUND"}\n');
      return;
    }

    const candidate = path.resolve(distRoot, `.${pathname}`);
    const isInsideDist = candidate === distRoot || candidate.startsWith(`${distRoot}${path.sep}`);
    if (!isInsideDist) {
      response.writeHead(403);
      response.end();
      return;
    }

    const filePath = (await existingFile(candidate)) || path.join(distRoot, 'index.html');
    const extension = path.extname(filePath).toLowerCase();
    const isHashedAsset = filePath.startsWith(`${path.join(distRoot, 'assets')}${path.sep}`);

    response.setHeader('Content-Type', contentTypes.get(extension) || 'application/octet-stream');
    response.setHeader(
      'Cache-Control',
      isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    );

    if (request.method === 'HEAD') {
      response.writeHead(200);
      response.end();
      return;
    }

    createReadStream(filePath)
      .on('error', () => {
        if (!response.headersSent) response.writeHead(500);
        response.end();
      })
      .pipe(response);
  } catch (error) {
    console.error('LVT private file request failed', {
      method: request.method,
      path: request.url,
      code: error instanceof Error ? error.message : 'UNKNOWN',
    });
    if (!response.headersSent) {
      const classified = classifyFileError(error);
      response.writeHead(classified.status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(`${JSON.stringify({ error: classified.code })}\n`);
    } else {
      response.end();
    }
  }
});

server.listen(port, host, () => {
  console.log(`LVT CRM production frontend listening on http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
