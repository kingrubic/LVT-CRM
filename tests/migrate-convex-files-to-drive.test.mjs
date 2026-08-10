import assert from 'node:assert/strict';
import test from 'node:test';
import { finalizeUploadedDriveFile } from '../scripts/migrate-convex-files-to-drive.mjs';

const migration = {
  documentId: 'document-1',
  driveFileId: 'drive-file-1',
  driveChecksum: 'checksum-1',
};

test('post-commit finalize transport failure retains the exact committed Drive file', () => {
  const calls = [];
  const deleted = [];
  const result = finalizeUploadedDriveFile({
    ...migration,
    runConvex(functionName, args) {
      calls.push([functionName, args]);
      if (functionName === 'work:finalizeDriveMigration') {
        throw new Error('transport timed out after commit');
      }
      return { migrated: true, driveFileId: migration.driveFileId };
    },
    deleteDriveFile: (driveFileId) => deleted.push(driveFileId),
  });

  assert.deepEqual(result, { outcome: 'committed' });
  assert.deepEqual(deleted, []);
  assert.deepEqual(calls.map(([functionName]) => functionName), [
    'work:finalizeDriveMigration',
    'work:driveMigrationStatus',
  ]);
  assert.deepEqual(calls[1][1], { documentId: migration.documentId });
});

test('definitively not committed upload is retried then cleaned up', () => {
  const calls = [];
  const deleted = [];

  assert.throws(
    () => finalizeUploadedDriveFile({
      ...migration,
      runConvex(functionName) {
        calls.push(functionName);
        if (functionName === 'work:finalizeDriveMigration') {
          throw new Error('transport failed before commit');
        }
        return { migrated: false, driveFileId: null };
      },
      deleteDriveFile: (driveFileId) => deleted.push(driveFileId),
    }),
    /transport failed before commit/,
  );

  assert.deepEqual(calls, [
    'work:finalizeDriveMigration',
    'work:driveMigrationStatus',
    'work:finalizeDriveMigration',
    'work:driveMigrationStatus',
  ]);
  assert.deepEqual(deleted, [migration.driveFileId]);
});
