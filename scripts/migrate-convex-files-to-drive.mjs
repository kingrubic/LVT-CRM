import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [snapshotPath] = process.argv.slice(2);
if (!snapshotPath) {
  throw new Error('Usage: node scripts/migrate-convex-files-to-drive.mjs <snapshot.zip>');
}

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const driveAccount = 'bemiagent@gmail.com';
const folderId = execFileSync(
  '/usr/bin/security',
  ['find-generic-password', '-s', 'lvt-crm-drive-folder-id', '-a', driveAccount, '-w'],
  { encoding: 'utf8' },
).trim();
const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'lvt-drive-migration-'));

function zipText(entry) {
  return execFileSync('/usr/bin/unzip', ['-p', snapshotPath, entry], {
    encoding: 'utf8',
    maxBuffer: 25 * 1024 * 1024,
  });
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

try {
  const documents = zipText('officeDocuments/documents.jsonl')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((document) => document.fileId && !document.driveFileId);
  const entries = execFileSync('/usr/bin/unzip', ['-Z1', snapshotPath], { encoding: 'utf8' })
    .trim()
    .split('\n');

  for (const document of documents) {
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

    execFileSync(
      path.join(projectRoot, 'scripts/lvt-convex-self-hosted-env.sh'),
      [
        path.join(projectRoot, 'node_modules/.bin/convex'),
        'run',
        'work:finalizeDriveMigration',
        JSON.stringify({
          documentId: document._id,
          driveFileId: uploaded.id,
          driveChecksum: sourceChecksum,
        }),
        '--typecheck',
        'disable',
        '--codegen',
        'disable',
      ],
      { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    console.log(`migrated document=${document._id} checksum=${sourceChecksum}`);
  }

  console.log(`migration_complete count=${documents.length}`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
