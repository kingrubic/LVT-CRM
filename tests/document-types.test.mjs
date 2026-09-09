import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_DOCUMENT_TYPES,
  requireDocumentTypeId,
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
