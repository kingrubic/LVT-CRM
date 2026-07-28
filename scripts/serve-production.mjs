import { createHash } from 'node:crypto';
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

async function authorizeAnyUpload(client, purpose = '') {
  const attempts = purpose === 'people-review'
    ? [anyApi.peopleReview.authorizeFileUpload, anyApi.work.authorizeFileUpload]
    : [anyApi.work.authorizeFileUpload, anyApi.peopleReview.authorizeFileUpload];
  let lastError;
  for (const queryRef of attempts) {
    try {
      await client.query(queryRef, {});
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('UPLOAD_FORBIDDEN');
}

async function deleteDriveFile(driveFileId) {
  if (!driveFileId || !/^[a-zA-Z0-9_-]+$/.test(driveFileId)) return;
  try {
    await execFileAsync(
      '/opt/homebrew/bin/gog',
      ['drive', 'delete', driveFileId, '--account', driveAccount, '--no-input'],
      { maxBuffer: 1024 * 1024 },
    );
  } catch (error) {
    console.error('LVT drive delete failed', {
      driveFileId,
      code: error instanceof Error ? error.message : 'UNKNOWN',
    });
  }
}

async function uploadToDrive(request, response) {
  const fileName = safeFileName(request);
  const declaredSize = Number(request.headers['content-length'] || 0);
  // Content-Length can be absent when proxies use chunked transfer; allow and count bytes instead.
  if (!fileName || declaredSize > maxFileSize) {
    console.error('LVT upload rejected before stream', {
      fileName,
      declaredSize,
      hasNameHeader: Boolean(request.headers['x-file-name']),
    });
    response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end('{"error":"INVALID_FILE"}\n');
    return;
  }

  const client = await authorizedClient(request);
  const purpose = String(request.headers['x-lvt-upload-purpose'] || '').trim();
  await authorizeAnyUpload(client, purpose);

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

    const { stdout } = await execFileAsync(
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
        String(request.headers['content-type'] || 'application/octet-stream'),
        '--json',
        '--no-input',
      ],
      { maxBuffer: 1024 * 1024 },
    );
    const result = JSON.parse(stdout);
    const uploaded = result.file || result.upload || result;
    if (!uploaded?.id) throw new Error('DRIVE_UPLOAD_INVALID_RESPONSE');

    response.writeHead(201, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    });
    response.end(`${JSON.stringify({
      driveFileId: uploaded.id,
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
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    response.setHeader('Content-Length', metadata.size);
    response.setHeader('Content-Type', file.fileType || 'application/octet-stream');
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
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    response.setHeader('Content-Length', metadata.size);
    response.setHeader('Content-Type', file.fileType || 'application/octet-stream');
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

    const driveDelete = request.method === 'DELETE'
      ? new URL(request.url || '/', 'http://localhost').pathname.match(/^\/api\/files\/drive\/([^/]+)$/)
      : null;
    if (driveDelete) {
      const client = await authorizedClient(request);
      await authorizeAnyUpload(client);
      await deleteDriveFile(driveDelete[1]);
      response.writeHead(204);
      response.end();
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
      const status = error instanceof Error && error.message === 'UNAUTHORIZED' ? 401 : 403;
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end('{"error":"FILE_ACCESS_DENIED"}\n');
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
