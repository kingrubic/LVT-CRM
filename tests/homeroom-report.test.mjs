import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assertExportWithinScope,
  authorizeAttendanceSummaryRows,
  buildAttendanceExportPayload,
  summarizeAttendanceDays,
} from '../convex/homeroomReportPolicy.ts';
import { HOMEROOM_SCOPE_FORBIDDEN } from '../convex/homeroomPolicy.ts';

const days = [
  { classId: 'c1', studentId: 's1', attendanceDate: '2026-09-01', effectiveStatus: 'present', rawObservation: 'present' },
  { classId: 'c1', studentId: 's2', attendanceDate: '2026-09-01', effectiveStatus: 'late', rawObservation: 'late' },
  { classId: 'c1', studentId: 's3', attendanceDate: '2026-09-01', effectiveStatus: 'absent_excused', rawObservation: 'absent' },
  { classId: 'c1', studentId: 's4', attendanceDate: '2026-09-01', effectiveStatus: 'exempt', rawObservation: 'unknown' },
  { classId: 'c1', studentId: 's5', attendanceDate: '2026-09-01', effectiveStatus: 'no_data', rawObservation: 'unknown' },
  { classId: 'c2', studentId: 's9', attendanceDate: '2026-09-01', effectiveStatus: 'absent_pending', rawObservation: 'absent' },
];

test('weekly and monthly totals reconcile to daily rows and exclude exempt/no_data from the rate', () => {
  const summary = summarizeAttendanceDays(days, { classIds: ['c1'], from: '2026-09-01', to: '2026-09-07' });
  assert.equal(summary.counts.present, 1);
  assert.equal(summary.counts.late, 1);
  assert.equal(summary.counts.absent_excused, 1);
  assert.equal(summary.counts.exempt, 1);
  assert.equal(summary.counts.no_data, 1);
  assert.equal(summary.ratedRows, 3);
  assert.equal(summary.attendanceRate, 2 / 3);
  assert.equal(summary.days.length, 5);
});

test('export cannot exceed actor scope and remains drillable to source days', () => {
  assert.throws(() => assertExportWithinScope(['c2'], { kind: 'ids', classIds: ['c1'] }), /HOMEROOM_SCOPE_FORBIDDEN/);
  const scoped = assertExportWithinScope(['c1'], { kind: 'ids', classIds: ['c1'] });
  assert.deepEqual(scoped, ['c1']);
  assert.deepEqual(assertExportWithinScope(undefined, { kind: 'none' }), []);
  assert.throws(() => assertExportWithinScope(['c1'], { kind: 'none' }), /HOMEROOM_SCOPE_FORBIDDEN/);
  assert.deepEqual(assertExportWithinScope(undefined, { kind: 'all' }), []);
  assert.deepEqual(assertExportWithinScope(['c2'], { kind: 'all' }), ['c2']);
  const payload = buildAttendanceExportPayload({
    summary: summarizeAttendanceDays(days, { classIds: ['c1'], from: '2026-09-01', to: '2026-09-01' }),
    className: '6A1',
    schoolYearName: '2026-2027',
    from: '2026-09-01',
    to: '2026-09-01',
    generatedAt: 1,
    generatedByUserId: 'u1',
    generatedByName: 'Giám thị',
  });
  assert.equal(payload.rows.every((row) => row.classId === 'c1'), true);
  assert.ok(payload.rows[0].attendanceDate);
  assert.equal(payload.title.includes('điểm danh'), true);
});

const teacher = {
  userId: 'teacher-1',
  role: 'user',
  status: 'active',
  menuAccess: { homeroom: 'view' },
};

const viewAll = {
  userId: 'viewer-1',
  role: 'user',
  status: 'active',
  menuAccess: { homeroom: 'view_all' },
};

const admin = {
  userId: 'admin-1',
  role: 'admin',
  status: 'active',
  menuAccess: {},
};

const augustOnlyAssignment = {
  classId: 'c1',
  schoolYearId: 'year-1',
  userId: 'teacher-1',
  assignmentType: 'homeroom_teacher',
  scopeKind: 'class',
  effectiveFrom: '2026-08-01',
  effectiveTo: '2026-08-31',
  active: true,
};

const rangeDays = [
  { classId: 'c1', studentId: 's1', attendanceDate: '2026-08-20', effectiveStatus: 'present' },
  { classId: 'c1', studentId: 's1', attendanceDate: '2026-09-01', effectiveStatus: 'absent_pending' },
  { classId: 'c2', studentId: 's9', attendanceDate: '2026-08-20', effectiveStatus: 'present' },
];

test('attendance summary authorizes every row by class and attendanceDate, not only range.from', () => {
  const authorized = authorizeAttendanceSummaryRows({
    actor: teacher,
    assignments: [augustOnlyAssignment],
    days: rangeDays,
    classId: 'c1',
    from: '2026-08-01',
    to: '2026-09-30',
    schoolYearId: 'year-1',
  });
  assert.deepEqual(authorized.map((row) => row.attendanceDate), ['2026-08-20']);

  const noClassFilter = authorizeAttendanceSummaryRows({
    actor: teacher,
    assignments: [augustOnlyAssignment],
    days: rangeDays,
    from: '2026-08-01',
    to: '2026-09-30',
    schoolYearId: 'year-1',
  });
  assert.deepEqual(noClassFilter.map((row) => `${row.classId}:${row.attendanceDate}`), ['c1:2026-08-20']);

  assert.throws(
    () =>
      authorizeAttendanceSummaryRows({
        actor: teacher,
        assignments: [{ ...augustOnlyAssignment, active: false }],
        days: rangeDays,
        classId: 'c1',
        from: '2026-08-01',
        to: '2026-09-30',
        schoolYearId: 'year-1',
      }),
    new RegExp(HOMEROOM_SCOPE_FORBIDDEN),
  );
  assert.throws(
    () =>
      authorizeAttendanceSummaryRows({
        actor: teacher,
        assignments: [],
        days: rangeDays,
        from: '2026-08-01',
        to: '2026-09-30',
        schoolYearId: 'year-1',
      }),
    new RegExp(HOMEROOM_SCOPE_FORBIDDEN),
  );
  assert.throws(
    () =>
      authorizeAttendanceSummaryRows({
        actor: teacher,
        assignments: [augustOnlyAssignment],
        days: rangeDays,
        classId: 'c2',
        from: '2026-08-01',
        to: '2026-09-30',
        schoolYearId: 'year-1',
      }),
    new RegExp(HOMEROOM_SCOPE_FORBIDDEN),
  );

  const managerRows = authorizeAttendanceSummaryRows({
    actor: admin,
    assignments: [],
    days: rangeDays,
    from: '2026-08-01',
    to: '2026-09-30',
  });
  assert.equal(managerRows.length, 3);
  const viewAllRows = authorizeAttendanceSummaryRows({
    actor: viewAll,
    assignments: [],
    days: rangeDays,
    classId: 'c1',
    from: '2026-08-01',
    to: '2026-09-30',
  });
  assert.deepEqual(viewAllRows.map((row) => row.attendanceDate), ['2026-08-20', '2026-09-01']);

  const supervisor = {
    userId: 'sup-1',
    role: 'user',
    status: 'active',
    menuAccess: { homeroom: 'supervisor' },
  };
  const wholeSchool = {
    classId: '',
    schoolYearId: 'year-1',
    userId: 'sup-1',
    assignmentType: 'supervisor',
    scopeKind: 'whole_school',
    effectiveFrom: '2026-08-01',
    active: true,
  };
  assert.equal(
    authorizeAttendanceSummaryRows({
      actor: supervisor,
      assignments: [wholeSchool],
      days: rangeDays,
      from: '2026-08-01',
      to: '2026-09-30',
      schoolYearId: 'year-1',
    }).length,
    3,
  );
  assert.deepEqual(
    authorizeAttendanceSummaryRows({
      actor: supervisor,
      assignments: [{ ...wholeSchool, effectiveTo: '2026-08-31' }],
      days: rangeDays,
      from: '2026-08-01',
      to: '2026-09-30',
      schoolYearId: 'year-1',
    }).map((row) => `${row.classId}:${row.attendanceDate}`),
    ['c1:2026-08-20', 'c2:2026-08-20'],
  );

  const source = readFileSync(new URL('../convex/homeroomReports.ts', import.meta.url), 'utf8');
  assert.match(source, /authorizeAttendanceSummaryRows/);
  assert.doesNotMatch(source, /assertClassReadable/);
  assert.doesNotMatch(source, /evaluateMissingUploadAlert\(/);
  assert.match(source, /evaluateScopedMissingUploadAlerts/);
});
