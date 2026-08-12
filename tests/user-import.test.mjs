import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENTITY_CODE_MAX_LENGTH,
  generateCodeFromName,
  isValidEntityCode,
  normalizeEntityCode,
} from '../src/lib/entityCodes.js';
import {
  USER_IMPORT_MESSAGES,
  rowsFromSheetMatrix,
  validateUserImportRows,
} from '../src/lib/userImport.js';

test('normalizeEntityCode uppercases and strips diacritics', () => {
  assert.equal(normalizeEntityCode(' giáo '), 'GIAO');
  assert.equal(normalizeEntityCode('toan_1'), 'TOAN_1');
});

test('isValidEntityCode enforces 20 chars and charset', () => {
  assert.equal(isValidEntityCode('GVCN'), true);
  assert.equal(isValidEntityCode('gv-cn_1'), true);
  assert.equal(isValidEntityCode('BAD CODE'), false);
  assert.equal(isValidEntityCode('A'.repeat(ENTITY_CODE_MAX_LENGTH + 1)), false);
});

test('generateCodeFromName uses initials then length fallbacks', () => {
  assert.equal(generateCodeFromName('Giáo viên chủ nhiệm', new Set()), 'GVCN');
  assert.equal(generateCodeFromName('Giáo viên chủ nhiệm', new Set(['GVCN'])), 'GIA');
  assert.equal(generateCodeFromName('Giáo viên chủ nhiệm', new Set(['GVCN', 'GIA'])), 'GIAO');
  assert.equal(generateCodeFromName('A', new Set(['A'])), 'A2');
});

test('rowsFromSheetMatrix accepts required headers', () => {
  const parsed = rowsFromSheetMatrix([
    ['ho_ten', 'email', 'ma_phong_ban', 'ma_chuc_vu', 'ma_nhom_quyen', 'mat_khau_tam_thoi'],
    ['Nguyen Van A', 'a@school.vn', 'TOAN', 'GV', 'GVCN', 'Matkhau12'],
  ]);
  assert.equal(parsed.headersOk, true);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].email, 'a@school.vn');
});

test('validateUserImportRows is all-or-nothing with detailed errors', () => {
  const context = {
    departments: [{ _id: 'd1', name: 'Toán', code: 'TOAN', active: true }],
    positions: [{ _id: 'p1', name: 'Giáo viên', code: 'GV', active: true }],
    permissionGroups: [{ _id: 'g1', name: 'GVCN', code: 'GVCN', active: true }],
    existingEmails: ['exists@school.vn'],
  };

  const missing = validateUserImportRows(
    [{ rowNumber: 2, ho_ten: '', email: '', ma_phong_ban: '', ma_chuc_vu: '', ma_nhom_quyen: '', mat_khau_tam_thoi: '' }],
    context,
  );
  assert.equal(missing.ok, false);
  assert.equal(missing.errors[0].message, USER_IMPORT_MESSAGES.incomplete);

  const badLookup = validateUserImportRows(
    [
      {
        rowNumber: 2,
        ho_ten: 'A',
        email: 'a@school.vn',
        ma_phong_ban: 'NOPE',
        ma_chuc_vu: 'GV',
        ma_nhom_quyen: 'GVCN',
        mat_khau_tam_thoi: 'Matkhau12',
      },
    ],
    context,
  );
  assert.equal(badLookup.ok, false);
  assert.equal(badLookup.errors[0].message, USER_IMPORT_MESSAGES.lookup);

  const dup = validateUserImportRows(
    [
      {
        rowNumber: 2,
        ho_ten: 'A',
        email: 'exists@school.vn',
        ma_phong_ban: 'toan',
        ma_chuc_vu: 'gv',
        ma_nhom_quyen: 'gvcn',
        mat_khau_tam_thoi: 'Matkhau12',
      },
    ],
    context,
  );
  assert.equal(dup.ok, false);
  assert.equal(dup.errors[0].message, USER_IMPORT_MESSAGES.duplicateEmail);

  const ok = validateUserImportRows(
    [
      {
        rowNumber: 2,
        ho_ten: 'A',
        email: 'new@school.vn',
        ma_phong_ban: 'toan',
        ma_chuc_vu: 'gv',
        ma_nhom_quyen: 'gvcn',
        mat_khau_tam_thoi: 'Matkhau12',
      },
    ],
    context,
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.preview[0].departmentId, 'd1');
  assert.equal(ok.preview[0].role, 'user');
});

test('invalid catalog codes block import before row checks', () => {
  const result = validateUserImportRows(
    [
      {
        rowNumber: 2,
        ho_ten: 'A',
        email: 'a@school.vn',
        ma_phong_ban: 'TOAN',
        ma_chuc_vu: 'GV',
        ma_nhom_quyen: 'GVCN',
        mat_khau_tam_thoi: 'Matkhau12',
      },
    ],
    {
      departments: [{ _id: 'd1', name: 'Toán', code: 'BAD CODE', active: true }],
      positions: [{ _id: 'p1', name: 'GV', code: 'GV', active: true }],
      permissionGroups: [{ _id: 'g1', name: 'G', code: 'GVCN', active: true }],
      existingEmails: [],
    },
  );
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /Phòng ban/);
});
