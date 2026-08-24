import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/lib/ConfirmActionModal.jsx'),
  'utf8',
);

test('edit confirm copy matches the required Vietnamese prompts', () => {
  assert.match(source, /Bạn có chắc chắn Hủy sửa không\?/);
  assert.match(source, /Bạn có chắc chắn Lưu không\?/);
});
