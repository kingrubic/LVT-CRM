import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';

import {
  inspectAttendanceWorkbook,
  rowsFromMappedAttendanceMatrix,
} from '../convex/attendanceImportSheet.ts';
import {
  applyUnconfirmedNameMatchGate,
  decidePublishedDateAction,
  reconcileAttendanceRows,
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
  isAttendanceReplaceModeRequired,
  proposedUniqueNameMatches,
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

const students = [
  { studentId: 's1', studentCode: 'HS001', fullName: 'Nguyễn Văn A', classId: 'c1', classCode: '6A1', enrollmentId: 'e1' },
  { studentId: 's2', studentCode: 'HS002', fullName: 'Nguyễn Văn A', classId: 'c1', classCode: '6A1', enrollmentId: 'e2' },
  { studentId: 's3', studentCode: 'HS003', fullName: 'Trần Thị B', classId: 'c1', classCode: '6A1', enrollmentId: 'e3' },
];

test('inspect stays bounded and does not invent a confirmed camera mapping', () => {
  const inspected = inspectAttendanceWorkbook({
    sheetNames: ['Sheet1'],
    sheets: {
      Sheet1: [
        ['ma_hoc_sinh', 'ho_ten', 'gio'],
        ['HS001', 'Nguyễn Văn A', '07:15'],
      ],
    },
  });
  assert.deepEqual(inspected.sheetNames, ['Sheet1']);
  assert.equal(inspected.mappingConfirmed, false);
  assert.equal(inspected.suggestedMapping.studentCode, 'ma_hoc_sinh');
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
  assert.equal(
    decidePublishedDateAction({
      existingPublished: existing,
      nextChecksum: 'def',
      attendanceDate: '2026-09-01',
      requestedMode: REPLACE_MODE_SUPPLEMENT,
    }).action,
    'supplement',
  );
  assert.equal(
    decidePublishedDateAction({
      existingPublished: existing,
      nextChecksum: 'def',
      attendanceDate: '2026-09-01',
      requestedMode: REPLACE_MODE_REPLACE,
    }).action,
    'replace',
  );
  assert.equal(
    decidePublishedDateAction({
      existingPublished: existing,
      nextChecksum: 'def',
      attendanceDate: '2026-09-01',
      requestedMode: REPLACE_MODE_CANCEL,
    }).action,
    'cancel',
  );
});

test('positive_presence publication creates one day per enrollment and missing students become absent pending', () => {
  const mapped = rowsFromMappedAttendanceMatrix(
    [
      ['ma_hoc_sinh', 'ho_ten'],
      ['HS001', 'Nguyễn Văn A'],
    ],
    { headerRowIndex: 0, mapping: { studentCode: 'ma_hoc_sinh', studentName: 'ho_ten' } },
  );
  const reconciled = reconcileAttendanceRows(mapped, {
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
  const first = buildAttendanceValidateArgs({
    uploadId: 'up-1',
    sheetName: 'Sheet1',
    headerRowIndex: 0,
    mapping: { studentName: 'ho_ten' },
  });
  assert.equal('confirmNameMatches' in first, false);
  assert.deepEqual(
    buildConfirmedAttendanceValidateArgs({
      uploadId: 'up-1',
      sheetName: 'Sheet1',
      headerRowIndex: 0,
      mapping: { studentName: 'ho_ten' },
    }),
    {
      uploadId: 'up-1',
      sheetName: 'Sheet1',
      headerRowIndex: 0,
      mapping: { studentName: 'ho_ten' },
      confirmNameMatches: true,
    },
  );

  const pending = {
    ok: false,
    issues: [
      {
        rowNumber: 4,
        code: 'CAMERA_NAME_MATCH_UNCONFIRMED',
        rejectedValue: 'Trần Thị B',
      },
    ],
    nameMatches: [
      {
        rowNumber: 4,
        sourceName: 'Trần Thị B',
        studentCode: 'HS003',
        fullName: 'Trần Thị B',
        classCode: '6A1',
      },
    ],
  };
  assert.deepEqual(proposedUniqueNameMatches(pending), pending.nameMatches);
  assert.equal(canExplicitlyConfirmNameMatches(pending), true);
  assert.equal(
    canExplicitlyConfirmNameMatches({
      ok: false,
      issues: [{ rowNumber: 2, code: 'CAMERA_NAME_AMBIGUOUS' }],
      nameMatches: [],
    }),
    false,
  );

  const source = readFileSync(new URL('../src/homeroom/HomeroomRouter.jsx', import.meta.url), 'utf8');
  assert.match(source, /buildAttendanceValidateArgs/);
  assert.match(source, /buildConfirmedAttendanceValidateArgs/);
  assert.match(source, /proposedUniqueNameMatches/);
  assert.match(source, /canExplicitlyConfirmNameMatches/);
  assert.match(source, /Xác nhận khớp họ tên/);
  assert.doesNotMatch(source, /confirmNameMatches:\s*true/);
  const firstValidate = source.slice(source.indexOf('onValidate={async () =>'), source.indexOf('onConfirmNameMatches={async'));
  assert.match(firstValidate, /buildAttendanceValidateArgs\(\{/);
  assert.doesNotMatch(firstValidate, /buildConfirmedAttendanceValidateArgs/);
  assert.doesNotMatch(firstValidate, /confirmNameMatches:\s*true/);
  const confirmAction = source.slice(source.indexOf('onConfirmNameMatches={async'), source.indexOf('onPublish={async'));
  assert.match(confirmAction, /buildConfirmedAttendanceValidateArgs\(\{/);
});

test('publish never invents a replace mode; ATTENDANCE_REPLACE_MODE_REQUIRED exposes the backend choices', () => {
  assert.equal(UI_REPLACE_MODE_SUPPLEMENT, REPLACE_MODE_SUPPLEMENT);
  assert.equal(UI_REPLACE_MODE_REPLACE, REPLACE_MODE_REPLACE);
  assert.equal(UI_REPLACE_MODE_CANCEL, REPLACE_MODE_CANCEL);
  assert.deepEqual(buildAttendancePublishArgs({ uploadId: 'up-1' }), { uploadId: 'up-1' });
  assert.equal('replaceMode' in buildAttendancePublishArgs({ uploadId: 'up-1', replaceMode: undefined }), false);
  assert.equal('replaceMode' in buildAttendancePublishArgs({ uploadId: 'up-1', replaceMode: 'silent' }), false);
  assert.deepEqual(buildAttendancePublishArgs({ uploadId: 'up-1', replaceMode: REPLACE_MODE_SUPPLEMENT }), {
    uploadId: 'up-1',
    replaceMode: 'supplement',
  });
  assert.deepEqual(buildAttendancePublishArgs({ uploadId: 'up-1', replaceMode: REPLACE_MODE_REPLACE }), {
    uploadId: 'up-1',
    replaceMode: 'replace_camera_observations',
  });
  assert.deepEqual(buildAttendancePublishArgs({ uploadId: 'up-1', replaceMode: REPLACE_MODE_CANCEL }), {
    uploadId: 'up-1',
    replaceMode: 'cancel',
  });
  assert.deepEqual(
    attendanceReplaceModeChoices().map((item) => item.replaceMode),
    [REPLACE_MODE_SUPPLEMENT, REPLACE_MODE_REPLACE, REPLACE_MODE_CANCEL],
  );
  assert.equal(isAttendanceReplaceModeRequired(new Error(ATTENDANCE_REPLACE_MODE_REQUIRED)), true);
  assert.equal(isAttendanceReplaceModeRequired(new Error('IMPORT_ROWS_UNRESOLVED')), false);
  const supplement = attendanceReplaceModeChoices().find((item) => item.replaceMode === REPLACE_MODE_SUPPLEMENT);
  const replace = attendanceReplaceModeChoices().find((item) => item.replaceMode === REPLACE_MODE_REPLACE);
  const cancel = attendanceReplaceModeChoices().find((item) => item.replaceMode === REPLACE_MODE_CANCEL);
  assert.match(supplement.label, /Bổ sung/);
  assert.match(supplement.description, /chưa xử lý|chưa có dữ liệu/i);
  assert.match(replace.label, /Thay quan sát camera/);
  assert.match(replace.description, /phân loại|chỉnh sửa/i);
  assert.match(cancel.label, /Hủy/);
});

test('attendance import UI shows replace-mode choices only after the server requires them', () => {
  const source = readFileSync(new URL('../src/homeroom/HomeroomRouter.jsx', import.meta.url), 'utf8');
  assert.match(source, /isAttendanceReplaceModeRequired/);
  assert.match(source, /attendanceReplaceModeChoices/);
  assert.match(source, /buildAttendancePublishArgs/);
  const firstPublish = source.slice(source.indexOf('Công bố điểm danh') - 180, source.indexOf('Công bố điểm danh') + 40);
  assert.match(firstPublish, /onPublish\(\)/);
  assert.doesNotMatch(firstPublish, /REPLACE_MODE_SUPPLEMENT|REPLACE_MODE_REPLACE|replaceMode:/);
  const publishStart = source.indexOf('onPublish={async');
  const publishHandler = source.slice(publishStart, source.indexOf('/>', publishStart));
  assert.match(publishHandler, /buildAttendancePublishArgs\(\{/);
  assert.match(publishHandler, /isAttendanceReplaceModeRequired/);
  assert.doesNotMatch(publishHandler, /replaceMode:\s*['"]supplement['"]/);
  assert.doesNotMatch(publishHandler, /replaceMode:\s*['"]replace_camera_observations['"]/);
  const previewFn = source.slice(source.indexOf('function AttendanceImportPreview'));
  const choiceBlock = previewFn.slice(previewFn.indexOf('attendanceReplaceModeChoices()'));
  assert.match(choiceBlock, /onPublish\(choice\.replaceMode\)/);
});

test('attendance internal helpers are not public and cannot mutate another upload', () => {
  const source = readFileSync(new URL('../convex/attendanceImport.ts', import.meta.url), 'utf8');
  for (const name of [
    'getUploadInternal',
    'listClassRosterInternal',
    'patchChecksumInternal',
    'storePreviewInternal',
  ]) {
    assert.match(source, new RegExp(`export const ${name} = internal(Query|Mutation)`));
    assert.doesNotMatch(source, new RegExp(`export const ${name} = (query|mutation)\\(`));
  }
  assert.match(source, /internal\.attendanceImport\.(getUploadInternal|storePreviewInternal|patchChecksumInternal)/);
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
    {
      studentId: 's1',
      rawObservation: 'absent',
      disposition: 'unexcused',
      effectiveStatus: 'absent_unexcused',
    },
    {
      studentId: 's2',
      rawObservation: 'absent',
      disposition: 'pending',
      effectiveStatus: 'absent_pending',
    },
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
  assert.notEqual(attendanceImportPublishResult({ uploadId: 'imp-3', changedCount: plan.changedCount }).count, incoming.length);

  const source = readFileSync(new URL('../convex/attendanceImport.ts', import.meta.url), 'utf8');
  const publishFn = source.slice(source.indexOf('async function publishStoredImport'));
  assert.match(publishFn, /planAttendanceImportWrites/);
  assert.match(publishFn, /attendanceImportPublishResult/);
  assert.match(publishFn, /status:\s*['"]published['"]/);
  assert.doesNotMatch(publishFn, /count:\s*publishedDays\.days\.length/);
});
