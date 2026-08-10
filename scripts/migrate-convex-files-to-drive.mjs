import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const driveAccount = 'bemiagent@gmail.com';

function zipText(snapshotPath, entry) {
  return execFileSync('/usr/bin/unzip', ['-p', snapshotPath, entry], {
    encoding: 'utf8',
    maxBuffer: 25 * 1024 * 1024,
  });
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function convexRun(functionName, args) {
  const stdout = execFileSync(
    path.join(projectRoot, 'scripts/lvt-convex-self-hosted-env.sh'),
    [
      path.join(projectRoot, 'node_modules/.bin/convex'),
      'run',
      functionName,
      JSON.stringify(args),
      '--typecheck',
      'disable',
      '--codegen',
      'disable',
    ],
    { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return JSON.parse(stdout.trim());
}

function deleteUploadedFile(driveFileId) {
  try {
    execFileSync(
      '/opt/homebrew/bin/gog',
      ['drive', 'delete', driveFileId, '--account', driveAccount, '--no-input'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (error) {
    console.error(`failed to clean uploaded Drive file ${driveFileId}: ${error.message}`);
  }
}

function migrationOutcome(status, driveFileId) {
  if (status?.migrated === true && status.driveFileId === driveFileId) return 'committed';
  if (status?.migrated === false && status.driveFileId == null) return 'not_committed';
  if (
    status?.migrated === true
    && typeof status.driveFileId === 'string'
    && status.driveFileId !== driveFileId
  ) return 'not_committed';
  return 'ambiguous';
}

function readMigrationOutcome(documentId, driveFileId, runConvex) {
  try {
    const status = runConvex('work:driveMigrationStatus', { documentId });
    return { outcome: migrationOutcome(status, driveFileId), status };
  } catch (error) {
    return { outcome: 'ambiguous', error };
  }
}

function exactFinalizeOutcome(finalized, driveFileId) {
  return finalized?.driveFileId === driveFileId ? 'committed' : 'unconfirmed';
}

export function deleteIfDefinitivelyNotCommitted({
  documentId,
  driveFileId,
  runConvex = convexRun,
  deleteDriveFile = deleteUploadedFile,
}) {
  const reconciled = readMigrationOutcome(documentId, driveFileId, runConvex);
  if (reconciled.outcome === 'not_committed') deleteDriveFile(driveFileId);
  return reconciled;
}

export function finalizeUploadedDriveFile({
  documentId,
  driveFileId,
  driveChecksum,
  runConvex = convexRun,
  deleteDriveFile = deleteUploadedFile,
}) {
  const args = { documentId, driveFileId, driveChecksum };
  let finalizeError;

  try {
    const finalized = runConvex('work:finalizeDriveMigration', args);
    if (exactFinalizeOutcome(finalized, driveFileId) === 'committed') {
      return { outcome: 'committed' };
    }
  } catch (error) {
    finalizeError = error;
  }

  let reconciled = readMigrationOutcome(documentId, driveFileId, runConvex);
  if (reconciled.outcome === 'committed') return { outcome: 'committed' };
  if (reconciled.outcome === 'ambiguous') {
    throw finalizeError || reconciled.error || new Error(`Drive migration outcome is ambiguous for ${documentId}`);
  }

  if (reconciled.status.migrated) {
    deleteDriveFile(driveFileId);
    return { outcome: 'superseded' };
  }

  try {
    const retried = runConvex('work:finalizeDriveMigration', args);
    if (exactFinalizeOutcome(retried, driveFileId) === 'committed') {
      return { outcome: 'committed' };
    }
  } catch (error) {
    finalizeError ||= error;
  }

  reconciled = readMigrationOutcome(documentId, driveFileId, runConvex);
  if (reconciled.outcome === 'committed') return { outcome: 'committed' };
  if (reconciled.outcome === 'not_committed') {
    deleteDriveFile(driveFileId);
    throw finalizeError || new Error(`Drive migration was not committed for ${documentId}`);
  }
  throw finalizeError || reconciled.error || new Error(`Drive migration outcome is ambiguous for ${documentId}`);
}

function main(snapshotPath) {
  if (!snapshotPath) {
    throw new Error('Usage: node scripts/migrate-convex-files-to-drive.mjs <snapshot.zip>');
  }
  const folderId = execFileSync(
    '/usr/bin/security',
    ['find-generic-password', '-s', 'lvt-crm-drive-folder-id', '-a', driveAccount, '-w'],
    { encoding: 'utf8' },
  ).trim();
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'lvt-drive-migration-'));

  try {
    const documents = zipText(snapshotPath, 'officeDocuments/documents.jsonl')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((document) => document.fileId && !document.driveFileId);
    const entries = execFileSync('/usr/bin/unzip', ['-Z1', snapshotPath], { encoding: 'utf8' })
      .trim()
      .split('\n');

    for (const document of documents) {
      const status = convexRun('work:driveMigrationStatus', { documentId: document._id });
      if (status.migrated) {
        console.log(`skipped document=${document._id} already_migrated=true`);
        continue;
      }
      const storageEntry = entries.find((entry) => entry.startsWith(`_storage/${document.fileId}.`));
      if (!storageEntry) throw new Error(`Missing storage payload for ${document._id}`);

      const localFile = path.join(temporaryDirectory, path.basename(storageEntry));
      writeFileSync(
        localFile,
        execFileSync('/usr/bin/unzip', ['-p', snapshotPath, storageEntry], {
          encoding: null,
          maxBuffer: 25 * 1024 * 1024,
        }),
        { mode: 0o600 },
      );
      const sourceChecksum = sha256(localFile);

      const uploadResult = JSON.parse(execFileSync(
        '/opt/homebrew/bin/gog',
        [
          'drive',
          'upload',
          localFile,
          '--account',
          driveAccount,
          '--parent',
          folderId,
          '--name',
          document.fileName,
          '--mime-type',
          document.fileType || 'application/octet-stream',
          '--json',
          '--no-input',
        ],
        { encoding: 'utf8', maxBuffer: 1024 * 1024 },
      ));
      const uploaded = uploadResult.file || uploadResult.upload || uploadResult;
      if (!uploaded?.id) throw new Error(`Drive upload response missing file ID for ${document._id}`);

      try {
        const verificationFile = `${localFile}.verify`;
        execFileSync(
          '/opt/homebrew/bin/gog',
          [
            'drive',
            'download',
            uploaded.id,
            '--account',
            driveAccount,
            '--out',
            verificationFile,
            '--no-input',
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        if (sha256(verificationFile) !== sourceChecksum) {
          throw new Error(`Drive checksum mismatch for ${document._id}`);
        }
      } catch (error) {
        deleteIfDefinitivelyNotCommitted({
          documentId: document._id,
          driveFileId: uploaded.id,
        });
        throw error;
      }

      const finalized = finalizeUploadedDriveFile({
        documentId: document._id,
        driveFileId: uploaded.id,
        driveChecksum: sourceChecksum,
      });
      if (finalized.outcome === 'superseded') {
        console.log(`skipped document=${document._id} already_migrated=true`);
        continue;
      }
      console.log(`migrated document=${document._id} checksum=${sourceChecksum}`);
    }

    console.log(`migration_complete count=${documents.length}`);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]);
}
