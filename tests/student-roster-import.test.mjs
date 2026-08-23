import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';

import { rowsFromRosterMatrix, cellTextPreserve } from '../convex/studentRosterImportSheet.ts';
import {
  assertRosterUploadMatchesClass,
  assertStoredImportMetadata,
  findMatchingGuardian,
  guardiansToInsert,
  rosterCommitAllowed,
  validateRosterImportRows,
} from '../convex/studentRosterImportValidate.ts';
import { assertImportUploadUsable } from '../convex/userImportPolicy.ts';

const headers = [
  'ma_hoc_sinh',
  'ho_ten',
  'ngay_sinh',
  'gioi_tinh',
  'so_thu_tu',
  'dien_thoai_hoc_sinh',
  'ho_ten_cha',
  'dien_thoai_cha',
  'ho_ten_me',
  'dien_thoai_me',
  'ho_ten_nguoi_giam_ho',
  'dien_thoai_nguoi_giam_ho',
  'dien_uu_tien',
  'dan_toc',
  'hoan_canh_kho_khan',
  'ghi_chu',
];

function matrix(rows) {
  return [headers, ...rows];
}

test('phone leading zero survives parse and preview', () => {
  assert.equal(cellTextPreserve('0912345678'), '0912345678');
  const parsed = rowsFromRosterMatrix(
    matrix([
      ['HS001', 'Nguyễn Văn A', '12/09/2013', 'nam', '1', '0912345678', '', '', '', '', '', '', '', '', '', ''],
    ]),
  );
  assert.equal(parsed.headersOk, true);
  assert.equal(parsed.rows[0].dien_thoai_hoc_sinh, '0912345678');
  const result = validateRosterImportRows(parsed.rows);
  assert.equal(result.ok, true);
  assert.equal(result.preview[0].studentPhone, '0912345678');
});

test('duplicate student code in workbook blocks commit of the whole file', () => {
  const parsed = rowsFromRosterMatrix(
    matrix([
      ['HS001', 'A', '', '', '1', '', '', '', '', '', '', '', '', '', '', ''],
      ['HS001', 'B', '', '', '2', '', '', '', '', '', '', '', '', '', '', ''],
    ]),
  );
  const result = validateRosterImportRows(parsed.rows);
  assert.equal(result.ok, false);
  assert.equal(rosterCommitAllowed(result), false);
  const blocker = result.blockers.find((item) => item.code === 'STUDENT_CODE_DUPLICATE_FILE');
  assert.ok(blocker);
  assert.equal(blocker.rowNumber, 3);
  assert.equal(blocker.column, 'ma_hoc_sinh');
  assert.equal(blocker.field, 'studentCode');
  assert.equal(blocker.rejectedValue, 'HS001');
  assert.match(blocker.message, /trùng/);
});

test('preview reports every blocking row with field, value, code, and Vietnamese message', () => {
  const parsed = rowsFromRosterMatrix(
    matrix([
      ['', '', '31/13/2013', 'xyz', '0', '12', 'Cha', '0900000000', '', '', '', '', '', '', '', ''],
      ['HS002', 'An', '2013-02-02', 'nữ', '1', '0911111111', '', '', '', '', '', '', '', '', '', ''],
    ]),
  );
  const result = validateRosterImportRows(parsed.rows, { existingStudentCodes: ['HS002'] });
  assert.equal(result.ok, false);
  assert.equal(result.preview.length, 0);
  const codes = result.blockers.map((item) => item.code);
  assert.ok(codes.includes('STUDENT_CODE_REQUIRED'));
  assert.ok(codes.includes('FULL_NAME_REQUIRED'));
  assert.ok(codes.includes('INVALID_DATE_OF_BIRTH'));
  assert.ok(codes.includes('INVALID_GENDER'));
  assert.ok(codes.includes('INVALID_ROSTER_NUMBER'));
  assert.ok(codes.includes('INVALID_PHONE'));
  assert.ok(codes.includes('STUDENT_CODE_EXISTS'));
  for (const issue of result.blockers) {
    assert.equal(typeof issue.rowNumber, 'number');
    assert.equal(typeof issue.field, 'string');
    assert.equal(typeof issue.column, 'string');
    assert.equal(typeof issue.code, 'string');
    assert.match(issue.message, /[A-Za-zÀ-ỹ]/);
  }
});

test('empty optional guardian fields do not create guardian rows', () => {
  const parsed = rowsFromRosterMatrix(
    matrix([['HS010', 'Bình', '', '', '1', '', '', '', '', '', '', '', '', '', '', '']]),
  );
  const result = validateRosterImportRows(parsed.rows);
  assert.equal(result.ok, true);
  assert.deepEqual(result.preview[0].guardians, []);
});

test('merge mode rejects a student actively enrolled in another class or year', () => {
  const parsed = rowsFromRosterMatrix(
    matrix([['HS001', 'An', '', '', '1', '', '', '', '', '', '', '', '', '', '', '']]),
  );
  const otherClass = validateRosterImportRows(parsed.rows, {
    mode: 'merge',
    existingStudentCodes: ['HS001'],
    existingEnrollments: [{ studentCode: 'HS001', classId: 'class-6a2', schoolYearId: 'year-1', status: 'active' }],
    targetClassId: 'class-6a1',
    targetSchoolYearId: 'year-1',
  });
  assert.equal(otherClass.ok, false);
  const blocker = otherClass.blockers.find((item) => item.code === 'STUDENT_ENROLLED_OTHER_CLASS');
  assert.ok(blocker);
  assert.equal(blocker.rowNumber, 2);
  assert.equal(blocker.column, 'ma_hoc_sinh');
  assert.equal(blocker.rejectedValue, 'HS001');
  assert.match(blocker.message, /lớp khác/);
  const yearMismatch = validateRosterImportRows(parsed.rows, {
    mode: 'merge',
    existingStudentCodes: ['HS001'],
    existingEnrollments: [{ studentCode: 'HS001', classId: 'class-6a1', schoolYearId: 'year-2', status: 'active' }],
    targetClassId: 'class-6a1',
    targetSchoolYearId: 'year-1',
  });
  assert.equal(yearMismatch.ok, false);
  assert.ok(yearMismatch.blockers.some((item) => item.code === 'ENROLLMENT_YEAR_MISMATCH'));
});

test('merge retry does not duplicate an existing guardian', () => {
  const incoming = [{ relationship: 'father', fullName: 'Nguyễn Văn B' }];
  const existing = [{ relationship: 'father', fullName: 'Nguyễn Văn B', active: true }];
  assert.ok(findMatchingGuardian(existing, incoming[0]));
  assert.deepEqual(guardiansToInsert(existing, incoming), []);
  assert.equal(guardiansToInsert([], incoming).length, 1);
});

test('roster internal helpers are not public and cannot mutate another upload', () => {
  const source = readFileSync(new URL('../convex/studentRosterImport.ts', import.meta.url), 'utf8');
  for (const name of [
    'getUploadInternal',
    'listStudentCodesInternal',
    'storeValidationInternal',
    'commitValidatedInternal',
  ]) {
    assert.match(source, new RegExp(`export const ${name} = internal(Query|Mutation)`));
    assert.doesNotMatch(source, new RegExp(`export const ${name} = (query|mutation)\\(`));
  }
  assert.match(source, /internal\.studentRosterImport\.(getUploadInternal|storeValidationInternal|commitValidatedInternal)/);
  const foreign = {
    uploadedBy: 'teacher-1',
    status: 'uploaded',
    expiresAt: Date.now() + 60_000,
  };
  assert.throws(() => assertImportUploadUsable(foreign, { actorId: 'teacher-2' }), /FORBIDDEN/);
  assert.throws(
    () => assertImportUploadUsable({ ...foreign, expiresAt: Date.now() - 1 }, { actorId: 'teacher-1' }),
    /IMPORT_UPLOAD_EXPIRED/,
  );
  assert.throws(
    () =>
      assertImportUploadUsable({ ...foreign, status: 'committed' }, { actorId: 'teacher-1', forCommit: true }),
    /IMPORT_UPLOAD_ALREADY_COMMITTED/,
  );
  assert.throws(
    () => assertRosterUploadMatchesClass({ schoolYearId: 'year-1', classId: 'c1' }, { schoolYearId: 'year-2', _id: 'c1' }),
    /ENROLLMENT_YEAR_MISMATCH/,
  );
  assert.throws(
    () => assertStoredImportMetadata(null, { fileSize: 10, maxBytes: 100 }),
    /INVALID_IMPORT_FILE/,
  );
  assert.throws(
    () => assertStoredImportMetadata({ size: 20 }, { fileSize: 10, maxBytes: 100 }),
    /INVALID_IMPORT_FILE/,
  );
});
