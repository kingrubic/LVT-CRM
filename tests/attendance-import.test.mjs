import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';

import {
  ATTENDANCE_TEMPLATE_HEADERS,
  detectAttendanceHeader,
  rowsFromAttendanceMatrix,
} from '../convex/attendanceImportSheet.ts';
import {
  applyUnconfirmedNameMatchGate,
  decidePublishedDateAction,
  parseSchoolCameraStatus,
  reconcileAttendanceRows,
  reconcileSchoolAttendanceRows,
  REPLACE_MODE_CANCEL,
  REPLACE_MODE_REPLACE,
  REPLACE_MODE_SUPPLEMENT,
} from '../convex/attendanceImportValidate.ts';
import {
  ATTENDANCE_REPLACE_MODE_REQUIRED,
  attendanceReplaceModeChoices,
  buildAttendancePublishArgs,
  buildAttendanceValidateArgs,
  buildConfirmedAttendanceValidateArgs,
  canExplicitlyConfirmNameMatches,
  classPreviewState,
  isAttendanceReplaceModeRequired,
  proposedUniqueNameMatches,
  publishPlan,
  REPLACE_MODE_CANCEL as UI_REPLACE_MODE_CANCEL,
  REPLACE_MODE_REPLACE as UI_REPLACE_MODE_REPLACE,
  REPLACE_MODE_SUPPLEMENT as UI_REPLACE_MODE_SUPPLEMENT,
} from '../src/homeroom/attendanceImportPreview.js';
import {
  applyPublicationPolicy,
  attendanceImportPublishResult,
  planAttendanceImportWrites,
} from '../convex/studentAttendancePolicy.ts';
import { enrollmentsCoveringDate } from '../convex/homeroomCatalog.ts';
import { assertImportUploadUsable } from '../convex/userImportPolicy.ts';
import { messageFor } from '../src/lib/appErrorMessage.js';

const importUiSource = readFileSync(new URL('../src/homeroom/HomeroomAttendanceImport.jsx', import.meta.url), 'utf8');

const students = [
  { studentId: 's1', studentCode: 'HS001', fullName: 'Nguyễn Văn A', classId: 'c1', classCode: '6A1', enrollmentId: 'e1' },
  { studentId: 's2', studentCode: 'HS002', fullName: 'Nguyễn Văn A', classId: 'c1', classCode: '6A1', enrollmentId: 'e2' },
  { studentId: 's3', studentCode: 'HS003', fullName: 'Trần Thị B', classId: 'c1', classCode: '6A1', enrollmentId: 'e3' },
];

const TEMPLATE_HEADER = ['Mã HS', 'Họ tên HS', 'Mã lớp', 'Tên lớp', 'Thời gian có mặt', 'Trạng thái'];

test('fixed template header is detected below a title row and maps every column', () => {
  assert.deepEqual(Object.values(ATTENDANCE_TEMPLATE_HEADERS), TEMPLATE_HEADER);
  const matrix = [
    ['DANH SÁCH ĐIỂM DANH NGÀY 01/09/2026'],
    [],
    TEMPLATE_HEADER,
    ['HS001', 'Nguyễn Văn A', '6A1', 'Lớp 6A1', '07:05', 'Có mặt'],
    ['', '', '', '', '', ''],
    ['HS003', 'Trần Thị B', '6A1', 'Lớp 6A1', '', 'Vắng'],
  ];
  const header = detectAttendanceHeader(matrix);
  assert.equal(header?.rowIndex, 2);
  assert.deepEqual(header?.missing, []);
  assert.deepEqual(header?.columns, {
    studentCode: 0,
    studentName: 1,
    classCode: 2,
    className: 3,
    observedAt: 4,
    sourceStatus: 5,
  });
  const parsed = rowsFromAttendanceMatrix(matrix);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(parsed.rows[0], {
    rowNumber: 4,
    rawStudentCode: 'HS001',
    rawStudentName: 'Nguyễn Văn A',
    rawClassCode: '6A1',
    rawClassName: 'Lớp 6A1',
    rawObservedAt: '07:05',
    rawStatus: 'Có mặt',
  });
  assert.equal(parsed.rows[1].rowNumber, 6);
});

test('template errors are explicit: missing header, missing required columns, empty file', () => {
  assert.deepEqual(rowsFromAttendanceMatrix([['foo', 'bar'], ['1', '2']]), {
    ok: false,
    message: 'ATTENDANCE_TEMPLATE_HEADER_NOT_FOUND',
  });
  const missing = rowsFromAttendanceMatrix([['Mã HS', 'Họ tên HS', 'Thời gian có mặt'], ['HS001', 'A', '07:00']]);
  assert.equal(missing.ok, false);
  assert.equal(missing.message, 'ATTENDANCE_TEMPLATE_COLUMNS_MISSING');
  assert.deepEqual(missing.missing, ['classCode', 'sourceStatus']);
  assert.equal(
    messageFor(new Error(`${missing.message}:${missing.missing.join(',')}`)),
    'File điểm danh thiếu cột: Mã lớp, Trạng thái.',
  );
  assert.deepEqual(rowsFromAttendanceMatrix([TEMPLATE_HEADER]), { ok: false, message: 'IMPORT_FILE_EMPTY' });
});

test('school camera status accepts Có mặt / Trễ / Vắng with or without accents', () => {
  assert.equal(parseSchoolCameraStatus('Có mặt'), 'present');
  assert.equal(parseSchoolCameraStatus('co mat'), 'present');
  assert.equal(parseSchoolCameraStatus(' Trễ '), 'late');
  assert.equal(parseSchoolCameraStatus('Đi muộn'), 'late');
  assert.equal(parseSchoolCameraStatus('VẮNG'), 'absent');
  assert.equal(parseSchoolCameraStatus('Nghỉ'), null);
  assert.equal(parseSchoolCameraStatus(''), null);
});

test('whole-school file splits by class code; broken classes are skipped, good classes stay publishable', () => {
  const classes = [
    { classId: 'c1', code: '6A1', name: 'Lớp 6A1' },
    { classId: 'c2', code: '6A2', name: 'Lớp 6A2' },
  ];
  const roster = [
    ...students,
    { studentId: 's4', studentCode: 'HS004', fullName: 'Lê Văn C', classId: 'c2', classCode: '6A2', enrollmentId: 'e4' },
    { studentId: 's5', studentCode: 'HS005', fullName: 'Phạm D', classId: 'c2', classCode: '6A2', enrollmentId: 'e5' },
  ];
  const rows = [
    { rowNumber: 2, rawStudentCode: 'HS001', rawClassCode: '6A1', rawObservedAt: '07:05', rawStatus: 'Có mặt' },
    { rowNumber: 3, rawStudentCode: 'HS002', rawClassCode: '6a1', rawObservedAt: '07:25', rawStatus: 'Trễ' },
    { rowNumber: 4, rawStudentCode: 'HS004', rawClassCode: '6A2', rawStatus: 'Nghỉ' },
    { rowNumber: 5, rawStudentCode: 'HS005', rawClassCode: '6A2', rawStatus: 'Vắng' },
    { rowNumber: 6, rawStudentCode: 'HS999', rawClassCode: '9Z9', rawStatus: 'Có mặt' },
  ];
  const result = reconcileSchoolAttendanceRows(rows, { attendanceDate: '2026-09-01', classes, students: roster });
  const c1 = result.classes.find((row) => row.classId === 'c1');
  const c2 = result.classes.find((row) => row.classId === 'c2');
  assert.equal(c1.publishable, true);
  assert.equal(c1.present, 1);
  assert.equal(c1.late, 1);
  assert.equal(c1.missingCount, 1, 'HS003 is not in the file and becomes absent pending on publish');
  assert.equal(c2.publishable, false);
  assert.ok(c2.errorCount >= 1);
  assert.deepEqual(result.publishableClassIds, ['c1']);
  assert.ok(result.issues.some((item) => item.code === 'CAMERA_STATUS_INVALID' && item.rowNumber === 4));
  assert.ok(result.issues.some((item) => item.code === 'CAMERA_CLASS_UNKNOWN' && item.rowNumber === 6));
  assert.equal(result.rows.find((row) => row.rowNumber === 6)?.resolution, 'invalid');
  assert.equal(result.rows.find((row) => row.rowNumber === 5)?.rawObservation, 'absent');
  assert.equal(result.rows.length, rows.length);
});

test('ambiguous name does not auto-match without a student code', () => {
  const result = reconcileAttendanceRows(
    [{ rowNumber: 2, rawStudentName: 'Nguyễn Văn A', rawClassCode: '6A1' }],
    { attendanceDate: '2026-09-01', classId: 'c1', classCode: '6A1', students },
  );
  assert.equal(result.ok, false);
  assert.equal(result.rows[0].resolution, 'ambiguous');
  assert.ok(result.blockers.some((item) => item.code === 'CAMERA_NAME_AMBIGUOUS'));
});

test('same checksum and date is idempotent; a different file requires an explicit mode', () => {
  const existing = { importId: 'imp-1', checksum: 'abc', attendanceDate: '2026-09-01' };
  assert.deepEqual(
    decidePublishedDateAction({
      existingPublished: existing,
      nextChecksum: 'abc',
      attendanceDate: '2026-09-01',
    }),
    { action: 'idempotent', importId: 'imp-1' },
  );
  const required = decidePublishedDateAction({
    existingPublished: existing,
    nextChecksum: 'def',
    attendanceDate: '2026-09-01',
  });
  assert.equal(required.action, 'require_mode');
  assert.equal(required.code, 'ATTENDANCE_REPLACE_MODE_REQUIRED');
  for (const [requestedMode, action] of [
    [REPLACE_MODE_SUPPLEMENT, 'supplement'],
    [REPLACE_MODE_REPLACE, 'replace'],
    [REPLACE_MODE_CANCEL, 'cancel'],
  ]) {
    assert.equal(
      decidePublishedDateAction({ existingPublished: existing, nextChecksum: 'def', attendanceDate: '2026-09-01', requestedMode }).action,
      action,
    );
  }
});

test('positive_presence publication creates one day per enrollment and missing students become absent pending', () => {
  const parsed = rowsFromAttendanceMatrix([TEMPLATE_HEADER, ['HS001', 'Nguyễn Văn A', '6A1', 'Lớp 6A1', '07:05', 'Có mặt']]);
  assert.equal(parsed.ok, true);
  const reconciled = reconcileAttendanceRows(parsed.rows, {
    attendanceDate: '2026-09-01',
    classId: 'c1',
    classCode: '6A1',
    students,
  });
  assert.equal(reconciled.ok, true);
  const published = applyPublicationPolicy({
    enrollments: students.map((row) => ({
      enrollmentId: row.enrollmentId,
      studentId: row.studentId,
      classId: row.classId,
      schoolYearId: 'y1',
    })),
    matchedRows: reconciled.rows.map((row) => ({
      matchedStudentId: row.matchedStudentId,
      rawObservation: row.rawObservation,
      normalizedObservedAt: row.normalizedObservedAt,
    })),
    presencePolicy: 'positive_presence',
    attendanceDate: '2026-09-01',
    sourceImportId: 'imp-1',
  });
  assert.equal(published.days.length, 3);
  assert.equal(published.days.find((row) => row.studentId === 's1')?.effectiveStatus, 'present');
  assert.equal(published.days.find((row) => row.studentId === 's3')?.effectiveStatus, 'absent_pending');
});

test('publication roster is date-effective after a transfer', () => {
  const enrollments = [
    { classId: 'c1', studentId: 's1', startDate: '2026-08-15', endDate: '2026-10-31', status: 'transferred' },
    { classId: 'c1', studentId: 's2', startDate: '2026-08-15', status: 'active' },
    { classId: 'c2', studentId: 's1', startDate: '2026-11-01', status: 'active' },
  ];
  const onDate = enrollmentsCoveringDate(enrollments, { classId: 'c1', date: '2026-10-01' });
  assert.deepEqual(onDate.map((row) => row.studentId).sort(), ['s1', 's2']);
  const transferDayOld = enrollmentsCoveringDate(enrollments, { classId: 'c1', date: '2026-11-01' });
  assert.deepEqual(transferDayOld.map((row) => row.studentId), ['s2']);
  const transferDayNew = enrollmentsCoveringDate(enrollments, { classId: 'c2', date: '2026-11-01' });
  assert.deepEqual(transferDayNew.map((row) => row.studentId), ['s1']);
  const afterTransfer = enrollmentsCoveringDate(enrollments, { classId: 'c1', date: '2026-11-15' });
  assert.deepEqual(afterTransfer.map((row) => row.studentId), ['s2']);
});

test('unique name match stays blocked until an explicit confirmation; ambiguous can never be confirmed', () => {
  const unique = reconcileAttendanceRows(
    [{ rowNumber: 4, rawStudentName: 'Trần Thị B', rawClassCode: '6A1' }],
    { attendanceDate: '2026-09-01', classId: 'c1', classCode: '6A1', students },
  );
  assert.equal(unique.issues.some((item) => item.code === 'CAMERA_NAME_MATCH_UNCONFIRMED'), true);
  assert.deepEqual(unique.nameMatches, [
    {
      rowNumber: 4,
      sourceName: 'Trần Thị B',
      studentCode: 'HS003',
      fullName: 'Trần Thị B',
      classCode: '6A1',
    },
  ]);
  const unconfirmed = applyUnconfirmedNameMatchGate(unique, { confirmNameMatches: false });
  assert.equal(unconfirmed.ok, false);
  assert.equal(unconfirmed.issues.some((item) => item.code === 'CAMERA_NAME_MATCH_UNCONFIRMED'), true);
  const confirmed = applyUnconfirmedNameMatchGate(unique, { confirmNameMatches: true });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.rows[0].resolution, 'matched');

  const ambiguous = reconcileAttendanceRows(
    [{ rowNumber: 2, rawStudentName: 'Nguyễn Văn A', rawClassCode: '6A1' }],
    { attendanceDate: '2026-09-01', classId: 'c1', classCode: '6A1', students },
  );
  const stillBlocked = applyUnconfirmedNameMatchGate(ambiguous, { confirmNameMatches: true });
  assert.equal(stillBlocked.ok, false);
  assert.equal(stillBlocked.rows[0].resolution, 'ambiguous');
  assert.ok(stillBlocked.blockers.some((item) => item.code === 'CAMERA_NAME_AMBIGUOUS'));
  assert.deepEqual(stillBlocked.nameMatches, []);
});

test('frontend only retries unique name matches after an explicit confirmation action', () => {
  assert.deepEqual(buildAttendanceValidateArgs({ uploadId: 'up-1' }), { uploadId: 'up-1' });
  assert.deepEqual(buildConfirmedAttendanceValidateArgs({ uploadId: 'up-1' }), {
    uploadId: 'up-1',
    confirmNameMatches: true,
  });

  const pending = {
    ok: false,
    unconfirmedNameCount: 1,
    issues: [{ rowNumber: 4, code: 'CAMERA_NAME_MATCH_UNCONFIRMED', rejectedValue: 'Trần Thị B' }],
    nameMatches: [{ rowNumber: 4, sourceName: 'Trần Thị B', studentCode: 'HS003', fullName: 'Trần Thị B', classCode: '6A1' }],
  };
  assert.deepEqual(proposedUniqueNameMatches(pending), pending.nameMatches);
  assert.equal(canExplicitlyConfirmNameMatches(pending), true);
  assert.equal(canExplicitlyConfirmNameMatches({ ...pending, unconfirmedNameCount: 0 }), false);
  assert.equal(
    canExplicitlyConfirmNameMatches({
      ok: false,
      unconfirmedNameCount: 1,
      issues: [{ rowNumber: 2, code: 'CAMERA_NAME_AMBIGUOUS' }],
      nameMatches: [],
    }),
    false,
  );

  const firstValidate = importUiSource.slice(importUiSource.indexOf('const onFile = async'), importUiSource.indexOf('const confirmNames = async'));
  assert.match(firstValidate, /buildAttendanceValidateArgs\(\{ uploadId \}\)/);
  assert.doesNotMatch(firstValidate, /buildConfirmedAttendanceValidateArgs|confirmNameMatches:\s*true/);
  const confirmAction = importUiSource.slice(importUiSource.indexOf('const confirmNames = async'), importUiSource.indexOf('const publish = async'));
  assert.match(confirmAction, /buildConfirmedAttendanceValidateArgs\(\{/);
  assert.match(importUiSource, /canExplicitlyConfirmNameMatches\(preview\)/);
  assert.match(importUiSource, /Xác nhận khớp/);
});

test('publish never invents a replace mode; ATTENDANCE_REPLACE_MODE_REQUIRED exposes the backend choices', () => {
  assert.equal(UI_REPLACE_MODE_SUPPLEMENT, REPLACE_MODE_SUPPLEMENT);
  assert.equal(UI_REPLACE_MODE_REPLACE, REPLACE_MODE_REPLACE);
  assert.equal(UI_REPLACE_MODE_CANCEL, REPLACE_MODE_CANCEL);
  assert.deepEqual(buildAttendancePublishArgs({ uploadId: 'up-1' }), { uploadId: 'up-1' });
  assert.equal('replaceMode' in buildAttendancePublishArgs({ uploadId: 'up-1', replaceMode: undefined }), false);
  assert.equal('replaceMode' in buildAttendancePublishArgs({ uploadId: 'up-1', replaceMode: '' }), false);
  assert.equal('replaceMode' in buildAttendancePublishArgs({ uploadId: 'up-1', replaceMode: 'silent' }), false);
  for (const mode of [REPLACE_MODE_SUPPLEMENT, REPLACE_MODE_REPLACE, REPLACE_MODE_CANCEL]) {
    assert.deepEqual(buildAttendancePublishArgs({ uploadId: 'up-1', replaceMode: mode }), { uploadId: 'up-1', replaceMode: mode });
  }
  assert.deepEqual(
    attendanceReplaceModeChoices().map((item) => item.replaceMode),
    [REPLACE_MODE_SUPPLEMENT, REPLACE_MODE_REPLACE, REPLACE_MODE_CANCEL],
  );
  assert.equal(isAttendanceReplaceModeRequired(new Error(ATTENDANCE_REPLACE_MODE_REQUIRED)), true);
  assert.equal(isAttendanceReplaceModeRequired(new Error('IMPORT_ROWS_UNRESOLVED')), false);
  const [supplement, replace, cancel] = attendanceReplaceModeChoices();
  assert.match(supplement.label, /Bổ sung/);
  assert.match(supplement.description, /chưa có dữ liệu/i);
  assert.match(replace.label, /Ghi đè/);
  assert.match(replace.description, /phân loại/i);
  assert.match(cancel.label, /Bỏ qua/);
});

test('publish plan: conflicts need a mode, cancel only publishes fresh classes, broken classes are skipped', () => {
  const preview = {
    classes: [
      { classId: 'c1', code: '6A1', publishable: true, alreadyPublished: false, missingCount: 2, errorCount: 0, unconfirmedNameCount: 0 },
      { classId: 'c2', code: '6A2', publishable: true, alreadyPublished: true, missingCount: 1, errorCount: 0, unconfirmedNameCount: 0 },
      { classId: 'c3', code: '6A3', publishable: false, alreadyPublished: false, missingCount: 0, errorCount: 3, unconfirmedNameCount: 0 },
    ],
  };
  const noMode = publishPlan(preview, '');
  assert.equal(noMode.needsReplaceMode, true);
  assert.deepEqual(noMode.conflicts.map((row) => row.code), ['6A2']);
  assert.deepEqual(noMode.willPublish.map((row) => row.code), ['6A1', '6A2']);
  assert.deepEqual(noMode.skipped.map((row) => row.code), ['6A3']);
  assert.equal(noMode.missingStudents, 3);
  const cancel = publishPlan(preview, REPLACE_MODE_CANCEL);
  assert.deepEqual(cancel.willPublish.map((row) => row.code), ['6A1']);
  assert.equal(cancel.missingStudents, 2);
  assert.equal(publishPlan(null, '').willPublish.length, 0);

  assert.equal(classPreviewState(preview.classes[0]).key, 'ready');
  assert.equal(classPreviewState(preview.classes[1]).key, 'existing');
  assert.equal(classPreviewState(preview.classes[2]).key, 'error');
  assert.equal(classPreviewState({ errorCount: 0, unconfirmedNameCount: 2, publishable: false }).key, 'confirm');
  assert.equal(classPreviewState({ errorCount: 0, unconfirmedNameCount: 0, publishable: false }).key, 'error');
});

test('attendance import UI shows replace-mode choices only when a class already has data', () => {
  assert.match(importUiSource, /isAttendanceReplaceModeRequired\(err\)/);
  assert.match(importUiSource, /buildAttendancePublishArgs\(\{ uploadId: preview\.uploadId, replaceMode \}\)/);
  const choiceBlock = importUiSource.slice(importUiSource.indexOf('{plan.needsReplaceMode ? ('));
  assert.match(choiceBlock, /attendanceReplaceModeChoices\(\)\.map/);
  assert.match(choiceBlock, /setReplaceMode\(choice\.replaceMode\)/);
  assert.doesNotMatch(importUiSource, /replaceMode:\s*['"](supplement|replace_camera_observations)['"]/);
  assert.match(importUiSource, /useState\(''\)/);
  assert.match(importUiSource, /generateUploadUrl\(\{ schoolYearId: yearId, attendanceDate: date \}\)/);
  assert.match(importUiSource, /downloadAttendanceImportTemplate/);
});

test('attendance internal helpers are not public and cannot mutate another upload', () => {
  const source = readFileSync(new URL('../convex/attendanceImport.ts', import.meta.url), 'utf8');
  for (const name of ['getUploadInternal', 'loadSchoolRosterInternal', 'storePreviewInternal']) {
    assert.match(source, new RegExp(`export const ${name} = internal(Query|Mutation)`));
    assert.doesNotMatch(source, new RegExp(`export const ${name} = (query|mutation)\\(`));
  }
  assert.match(source, /internal\.attendanceImport\.(getUploadInternal|storePreviewInternal|loadSchoolRosterInternal)/);
  assert.throws(
    () =>
      assertImportUploadUsable(
        { uploadedBy: 'sup-1', status: 'uploaded', expiresAt: Date.now() + 1000 },
        { actorId: 'sup-2' },
      ),
    /FORBIDDEN/,
  );
});

test('supplement updates existing no_data, skips reviewed days, and inserts only absent pending per policy', () => {
  const incoming = applyPublicationPolicy({
    enrollments: students.map((row) => ({
      enrollmentId: row.enrollmentId,
      studentId: row.studentId,
      classId: row.classId,
      schoolYearId: 'y1',
    })),
    matchedRows: [
      { matchedStudentId: 's1', rawObservation: 'present', normalizedObservedAt: 15 },
      { matchedStudentId: 's2', rawObservation: 'late', normalizedObservedAt: 16 },
    ],
    presencePolicy: 'positive_presence',
    attendanceDate: '2026-09-01',
    sourceImportId: 'imp-2',
  }).days;
  const existing = [
    {
      studentId: 's1',
      rawObservation: 'unknown',
      disposition: 'none',
      effectiveStatus: 'no_data',
      note: 'Thiếu camera',
    },
    {
      studentId: 's2',
      rawObservation: 'absent',
      disposition: 'excused',
      effectiveStatus: 'absent_excused',
      reasonCode: 'leave',
      note: 'Có phép',
    },
  ];

  const plan = planAttendanceImportWrites({
    incomingDays: incoming,
    existingDays: existing,
    mode: 'supplement',
  });

  assert.equal(plan.changedCount, 2);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.inserts.length, 1);
  assert.deepEqual(plan.updates[0], {
    studentId: 's1',
    rawObservation: 'present',
    rawObservedAt: 15,
    disposition: 'none',
    effectiveStatus: 'present',
    note: 'Thiếu camera',
    overwritten: true,
  });
  assert.equal(plan.inserts[0].studentId, 's3');
  assert.equal(plan.inserts[0].rawObservation, 'absent');
  assert.equal(plan.inserts[0].disposition, 'pending');
  assert.equal(plan.inserts[0].effectiveStatus, 'absent_pending');
});

test('supplement that changes zero rows still publishes the upload with a truthful count', () => {
  const incoming = applyPublicationPolicy({
    enrollments: students.slice(0, 2).map((row) => ({
      enrollmentId: row.enrollmentId,
      studentId: row.studentId,
      classId: row.classId,
      schoolYearId: 'y1',
    })),
    matchedRows: [
      { matchedStudentId: 's1', rawObservation: 'present' },
      { matchedStudentId: 's2', rawObservation: 'late' },
    ],
    presencePolicy: 'positive_presence',
    attendanceDate: '2026-09-01',
    sourceImportId: 'imp-3',
  }).days;
  const existing = [
    { studentId: 's1', rawObservation: 'absent', disposition: 'unexcused', effectiveStatus: 'absent_unexcused' },
    { studentId: 's2', rawObservation: 'absent', disposition: 'pending', effectiveStatus: 'absent_pending' },
  ];

  const plan = planAttendanceImportWrites({
    incomingDays: incoming,
    existingDays: existing,
    mode: 'supplement',
  });
  assert.equal(incoming.length, 2);
  assert.equal(plan.changedCount, 0);
  assert.deepEqual(plan.updates, []);
  assert.deepEqual(plan.inserts, []);
  assert.deepEqual(attendanceImportPublishResult({ uploadId: 'imp-3', changedCount: plan.changedCount }), {
    importId: 'imp-3',
    published: true,
    count: 0,
  });

  const source = readFileSync(new URL('../convex/attendanceImport.ts', import.meta.url), 'utf8');
  const publishFn = source.slice(source.indexOf('async function publishStoredImport'));
  assert.match(publishFn, /planAttendanceImportWrites/);
  assert.match(publishFn, /attendanceImportPublishResult/);
  assert.match(publishFn, /status:\s*['"]published['"]/);
  assert.match(publishFn, /ATTENDANCE_REPLACE_MODE_REQUIRED/);
});

test('school attendance template round-trips through the server header detector and is not the roster template', async () => {
  const {
    ATTENDANCE_IMPORT_TEMPLATE_FILENAME,
    ATTENDANCE_IMPORT_TEMPLATE_HEADERS,
    attendanceImportTemplateMatrix,
  } = await import('../src/lib/attendanceImportExcel.js');
  const { ROSTER_IMPORT_HEADERS } = await import('../src/lib/rosterImportExcel.js');
  assert.equal(ATTENDANCE_IMPORT_TEMPLATE_FILENAME, 'mau_diem_danh_toan_truong.xlsx');
  assert.notDeepEqual(ATTENDANCE_IMPORT_TEMPLATE_HEADERS, ROSTER_IMPORT_HEADERS);
  assert.deepEqual(ATTENDANCE_IMPORT_TEMPLATE_HEADERS, TEMPLATE_HEADER);
  const parsed = rowsFromAttendanceMatrix(attendanceImportTemplateMatrix());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.headerRowIndex, 0);
  for (const row of parsed.rows) {
    assert.notEqual(parseSchoolCameraStatus(row.rawStatus), null);
  }
});
