import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DriveUploadStages } from '../scripts/lib/drive-upload-stages.mjs';
import { FileHttpError, classifyFileError } from '../scripts/lib/file-http-errors.mjs';
import { canonicalUploadMime, downloadContentPolicy } from '../scripts/lib/file-content-policy.mjs';
import { matchDriveMutationRoute } from '../scripts/lib/file-route-policy.mjs';
import { assertStagedUploadOwner, settleClaimedUpload } from '../scripts/lib/staged-upload-cleanup.mjs';
import { authorizeUpload, uploadApiForPurpose } from '../scripts/lib/upload-authorization.mjs';

const uploadApis = {
  work: {
    authorizeFileUpload: 'work-authorize',
    registerDriveUpload: 'work-register',
    finalizeStagedUpload: 'work-finalize',
  },
  peopleReview: {
    authorizeFileUpload: 'people-review-authorize',
    registerDriveUpload: 'people-review-register',
    finalizeStagedUpload: 'people-review-finalize',
  },
};

test('file errors preserve truthful authentication, validation, and infrastructure statuses', () => {
  assert.equal(classifyFileError(new Error('UNAUTHORIZED')).status, 401);
  assert.equal(classifyFileError(new Error('WORK_FILE_TOO_LARGE')).status, 413);
  assert.equal(classifyFileError(new Error('WORK_FILE_SIZE_MISMATCH')).status, 400);
  assert.equal(classifyFileError(new Error('WORK_FILE_FORBIDDEN')).status, 403);
  assert.equal(classifyFileError(new Error('drive unavailable')).status, 500);
  assert.equal(classifyFileError(new FileHttpError(502, 'DRIVE_DELETE_FAILED')).status, 502);
});

test('upload and download MIME policy ignores a spoofed request or stored content type', () => {
  assert.equal(canonicalUploadMime('report.pdf'), 'application/pdf');
  assert.equal(canonicalUploadMime('sheet.xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(canonicalUploadMime('payload.html'), null);
  assert.deepEqual(downloadContentPolicy('report.pdf'), {
    mimeType: 'application/pdf',
    disposition: 'attachment',
  });
  assert.deepEqual(downloadContentPolicy('evidence.png'), {
    mimeType: 'image/png',
    disposition: 'inline',
  });
});

test('Drive mutation routes accept only scoped upload tokens or trusted cleanup jobs', () => {
  assert.equal(matchDriveMutationRoute('DELETE', '/api/files/drive/caller-supplied-drive-id'), null);
  assert.deepEqual(matchDriveMutationRoute('DELETE', '/api/files/uploads/stage-token'), {
    kind: 'staged-upload',
    id: 'stage-token',
    finalize: false,
  });
  assert.deepEqual(matchDriveMutationRoute('DELETE', '/api/files/cleanup-jobs/record-id'), {
    kind: 'cleanup-job',
    id: 'record-id',
  });
});

test('work uploads never fall back to people-review authorization', async () => {
  const queries = [];
  const client = {
    async query(queryRef) {
      queries.push(queryRef);
      if (queryRef === uploadApis.work.authorizeFileUpload) throw new Error('WORK_FILE_FORBIDDEN');
      return { userId: 'people-review-user' };
    },
  };

  await assert.rejects(
    authorizeUpload(client, 'work', uploadApis),
    (error) => error.status === 403 && error.code === 'FILE_ACCESS_DENIED',
  );
  assert.deepEqual(queries, [uploadApis.work.authorizeFileUpload]);
  assert.equal(uploadApiForPurpose('work', uploadApis).registerDriveUpload, 'work-register');
  assert.equal(uploadApiForPurpose('work', uploadApis).finalizeStagedUpload, 'work-finalize');
});

test('people-review uploads never fall back to work authorization', async () => {
  const queries = [];
  const client = {
    async query(queryRef) {
      queries.push(queryRef);
      if (queryRef === uploadApis.peopleReview.authorizeFileUpload) {
        throw new Error('PEOPLE_REVIEW_FILE_FORBIDDEN');
      }
      return { userId: 'work-user' };
    },
  };

  await assert.rejects(
    authorizeUpload(client, 'people-review', uploadApis),
    (error) => error.status === 403 && error.code === 'FILE_ACCESS_DENIED',
  );
  assert.deepEqual(queries, [uploadApis.peopleReview.authorizeFileUpload]);
  assert.equal(uploadApiForPurpose('people-review', uploadApis).registerDriveUpload, 'people-review-register');
  assert.equal(uploadApiForPurpose('people-review', uploadApis).finalizeStagedUpload, 'people-review-finalize');
});

test('staged upload capabilities are durable and removable without exposing Drive ids as keys', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lvt-stage-test-'));
  const statePath = path.join(directory, 'stages.json');
  const first = new DriveUploadStages(statePath);
  await first.add('capability-token', {
    driveFileId: 'drive-file-id',
    purpose: 'work',
    userId: 'user-1',
  });

  const second = new DriveUploadStages(statePath);
  assert.deepEqual(await second.get('capability-token'), {
    driveFileId: 'drive-file-id',
    purpose: 'work',
    userId: 'user-1',
  });
  assert.equal(await second.get('drive-file-id'), null);
  await second.remove('capability-token');
  assert.equal((await readFile(statePath, 'utf8')).trim(), '{}');
});

test('staged cleanup is object-scoped and propagates Drive failures', async () => {
  const stage = { driveFileId: 'owned-drive-file', userId: 'owner' };
  let deleteCalls = 0;
  assert.throws(
    () => assertStagedUploadOwner(stage, 'other-user'),
    (error) => error.status === 403,
  );
  assert.equal(deleteCalls, 0);

  await settleClaimedUpload({
    claim: { action: 'retain', driveFileId: stage.driveFileId },
    deleteDriveFile: async () => { deleteCalls += 1; },
  });
  assert.equal(deleteCalls, 0, 'an atomic committed decision must retain the Drive file');

  await assert.rejects(
    settleClaimedUpload({
      claim: { action: 'delete', driveFileId: stage.driveFileId },
      deleteDriveFile: async () => { throw new FileHttpError(502, 'DRIVE_DELETE_FAILED'); },
    }),
    (error) => error.status === 502,
  );

  await settleClaimedUpload({
    claim: { action: 'delete', driveFileId: stage.driveFileId },
    deleteDriveFile: async (driveFileId) => {
      assert.equal(driveFileId, stage.driveFileId);
      deleteCalls += 1;
    },
  });
  assert.equal(deleteCalls, 1);
});
