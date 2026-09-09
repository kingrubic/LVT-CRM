import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_DOCUMENT_TYPES,
  FALLBACK_DOCUMENT_TYPE_CODE,
  completionHasFile,
  needsDocumentTypeBackfill,
  officeDocumentHasFile,
  requireDocumentTypeId,
  resolveDisplayedDocumentType,
  sortDocumentTypes,
} from '../convex/documentTypePolicy.ts';

test('ba loại văn bản mặc định là Kế hoạch, Biên bản, Báo cáo', () => {
  assert.deepEqual(
    DEFAULT_DOCUMENT_TYPES.map((item) => item.code),
    ['KE_HOACH', 'BIEN_BAN', 'BAO_CAO'],
  );
  assert.deepEqual(
    DEFAULT_DOCUMENT_TYPES.map((item) => item.name),
    ['Kế hoạch', 'Biên bản', 'Báo cáo'],
  );
});

test('chỉ bắt buộc loại văn bản khi có file đính kèm', () => {
  assert.equal(requireDocumentTypeId(false, ''), null);
  assert.equal(requireDocumentTypeId(false, null), null);
  assert.equal(requireDocumentTypeId(true, 'abc'), 'abc');
  assert.throws(() => requireDocumentTypeId(true, ''), /DOCUMENT_TYPE_REQUIRED/);
  assert.throws(() => requireDocumentTypeId(true, '   '), /DOCUMENT_TYPE_REQUIRED/);
});

test('sắp xếp loại văn bản theo tên tiếng Việt', () => {
  const sorted = sortDocumentTypes([
    { name: 'Kế hoạch' },
    { name: 'Báo cáo' },
    { name: 'Biên bản' },
  ]);
  assert.deepEqual(sorted.map((item) => item.name), ['Báo cáo', 'Biên bản', 'Kế hoạch']);
});

test('file cũ chưa có loại được gắn mặc định Biên bản', () => {
  assert.equal(FALLBACK_DOCUMENT_TYPE_CODE, 'BIEN_BAN');
  assert.equal(needsDocumentTypeBackfill(true, ''), true);
  assert.equal(needsDocumentTypeBackfill(true, '   '), true);
  assert.equal(needsDocumentTypeBackfill(true, 'type-1'), false);
  assert.equal(needsDocumentTypeBackfill(false, ''), false);
  assert.equal(officeDocumentHasFile({ driveFileId: 'drive-1' }), true);
  assert.equal(officeDocumentHasFile({ fileId: 'file-1' }), true);
  assert.equal(officeDocumentHasFile({}), false);
  assert.equal(completionHasFile({ fileName: 'bien_ban.pdf' }), true);
  assert.equal(completionHasFile({ driveFileId: 'drive-1' }), true);
  assert.equal(completionHasFile({ fileName: '  ' }), false);

  const types = [
    { _id: 'kh', code: 'KE_HOACH', name: 'Kế hoạch' },
    { _id: 'bb', code: 'BIEN_BAN', name: 'Biên bản' },
  ];
  assert.deepEqual(resolveDisplayedDocumentType(true, '', types), {
    documentTypeId: 'bb',
    documentTypeName: 'Biên bản',
  });
  assert.deepEqual(resolveDisplayedDocumentType(true, 'kh', types), {
    documentTypeId: 'kh',
    documentTypeName: 'Kế hoạch',
  });
  assert.deepEqual(resolveDisplayedDocumentType(false, '', types), {
    documentTypeId: '',
    documentTypeName: '',
  });
});
