import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';

import {
  ASSIGNMENT_BEFORE_START,
  assertSingleActiveEnrollment,
  DUPLICATE_ACTIVE_ENROLLMENT,
  enrollmentCoversDate,
  enrollmentsCoveringDate,
  findOverlappingActiveYear,
  findOverlappingHomeroomTeacher,
  planHomeroomTeacherReplacement,
  planStudentTransfer,
  TRANSFER_BEFORE_START,
  validateClassInput,
  validateSchoolYearInput,
} from '../convex/homeroomCatalog.ts';

test('school year rejects overlapping active ranges', () => {
  const existing = [
    { _id: 'y1', name: '2026-2027', startDate: '2026-08-01', endDate: '2027-05-31', active: true },
  ];
  assert.ok(
    findOverlappingActiveYear(existing, {
      startDate: '2027-01-01',
      endDate: '2027-12-31',
      active: true,
    }),
  );
  assert.equal(
    findOverlappingActiveYear(existing, {
      startDate: '2027-06-01',
      endDate: '2028-05-31',
      active: true,
    }),
    null,
  );
  const input = validateSchoolYearInput({
    name: ' 2026-2027 ',
    startDate: '2026-08-15',
    endDate: '2027-05-31',
    attendanceUploadDueTime: '08:30',
  });
  assert.equal(input.name, '2026-2027');
  assert.equal(input.attendanceUploadDueTime, '08:30');
});

test('class code and grade stay inside the current secondary range', () => {
  assert.deepEqual(validateClassInput({ code: '6a1', name: 'Lớp 6A1', gradeLevel: 6 }), {
    code: '6A1',
    name: 'Lớp 6A1',
    gradeLevel: 6,
  });
  assert.throws(() => validateClassInput({ code: '6 A1', name: 'Lớp', gradeLevel: 6 }), /INVALID_CLASS_CODE/);
  assert.throws(() => validateClassInput({ code: '6A1', name: 'Lớp', gradeLevel: 5 }), /INVALID_GRADE_LEVEL/);
});

test('student cannot have two active enrollments in one school year', () => {
  const enrollments = [
    {
      _id: 'e1',
      studentId: 'st-1',
      classId: 'class-6a1',
      schoolYearId: 'year-1',
      startDate: '2026-08-15',
      status: 'active',
    },
  ];
  assert.throws(
    () =>
      assertSingleActiveEnrollment(enrollments, { studentId: 'st-1', schoolYearId: 'year-1' }),
    new RegExp(DUPLICATE_ACTIVE_ENROLLMENT),
  );
  assert.doesNotThrow(() =>
    assertSingleActiveEnrollment(enrollments, { studentId: 'st-1', schoolYearId: 'year-2' }),
  );
});

test('transfer closes the old enrollment and opens a new row', () => {
  const plan = planStudentTransfer({
    enrollment: {
      _id: 'e1',
      studentId: 'st-1',
      classId: 'class-6a1',
      schoolYearId: 'year-1',
      startDate: '2026-08-15',
      status: 'active',
    },
    toClassId: 'class-6a2',
    date: '2026-11-01',
    reason: 'Chuyển lớp',
  });
  assert.equal(plan.close.status, 'transferred');
  assert.equal(plan.close.endDate, '2026-10-31');
  assert.equal(plan.open.classId, 'class-6a2');
  assert.equal(plan.open.studentId, 'st-1');
  assert.equal(plan.open.status, 'active');
  assert.equal(plan.open.startDate, '2026-11-01');
});

test('transfer is rejected before the current enrollment startDate', () => {
  const enrollment = {
    _id: 'e1',
    studentId: 'st-1',
    classId: 'class-6a1',
    schoolYearId: 'year-1',
    startDate: '2026-08-15',
    status: 'active',
  };
  assert.throws(
    () => planStudentTransfer({ enrollment, toClassId: 'class-6a2', date: '2026-08-14' }),
    new RegExp(TRANSFER_BEFORE_START),
  );
  assert.doesNotThrow(() =>
    planStudentTransfer({ enrollment, toClassId: 'class-6a2', date: '2026-08-15' }),
  );
});

test('transfer date belongs only to the new class roster', () => {
  const oldRow = {
    classId: 'class-6a1',
    studentId: 'st-1',
    startDate: '2026-08-15',
    endDate: '2026-10-31',
    status: 'transferred',
  };
  const newRow = {
    classId: 'class-6a2',
    studentId: 'st-1',
    startDate: '2026-11-01',
    status: 'active',
  };
  assert.equal(enrollmentCoversDate(oldRow, '2026-10-31'), true);
  assert.equal(enrollmentCoversDate(oldRow, '2026-11-01'), false);
  assert.equal(enrollmentCoversDate(newRow, '2026-10-31'), false);
  assert.equal(enrollmentCoversDate(newRow, '2026-11-01'), true);
  assert.deepEqual(
    enrollmentsCoveringDate([oldRow, newRow], { classId: 'class-6a1', date: '2026-11-01' }),
    [],
  );
  assert.deepEqual(
    enrollmentsCoveringDate([oldRow, newRow], { classId: 'class-6a2', date: '2026-11-01' }).map(
      (row) => row.studentId,
    ),
    ['st-1'],
  );
  assert.equal(enrollmentsCoveringDate([oldRow, newRow], { classId: 'class-6a1', date: '2026-10-15' }).length, 1);
  assert.equal(enrollmentsCoveringDate([oldRow, newRow], { classId: 'class-6a1', date: '2026-11-15' }).length, 0);
});

test('overlapping active GVCN assignments are rejected', () => {
  const overlap = findOverlappingHomeroomTeacher(
    [
      {
        classId: 'class-6a1',
        assignmentType: 'homeroom_teacher',
        active: true,
        effectiveFrom: '2026-08-01',
        userId: 't1',
      },
    ],
    { classId: 'class-6a1', effectiveFrom: '2026-09-01', userId: 't2' },
  );
  assert.ok(overlap);
  assert.equal(
    findOverlappingHomeroomTeacher(
      [
        {
          classId: 'class-6a1',
          assignmentType: 'homeroom_teacher',
          active: false,
          effectiveFrom: '2026-08-01',
          effectiveTo: '2026-08-31',
          userId: 't1',
        },
      ],
      { classId: 'class-6a1', effectiveFrom: '2026-09-01', userId: 't2' },
    ),
    undefined,
  );
});

test('replacement date belongs only to the new homeroom teacher', () => {
  const plan = planHomeroomTeacherReplacement({
    assignment: { effectiveFrom: '2026-08-01' },
    date: '2026-11-01',
  });
  assert.equal(plan.close.effectiveTo, '2026-10-31');
  assert.equal(plan.close.active, true);
  assert.throws(
    () =>
      planHomeroomTeacherReplacement({
        assignment: { effectiveFrom: '2026-08-01' },
        date: '2026-07-31',
      }),
    new RegExp(ASSIGNMENT_BEFORE_START),
  );
  const closed = {
    classId: 'class-6a1',
    assignmentType: 'homeroom_teacher',
    ...plan.close,
    effectiveFrom: '2026-08-01',
    userId: 't1',
  };
  assert.equal(closed.active, true);
  assert.equal(
    findOverlappingHomeroomTeacher([closed], { classId: 'class-6a1', effectiveFrom: '2026-11-01', userId: 't2' }),
    undefined,
  );
  assert.ok(
    findOverlappingHomeroomTeacher([closed], { classId: 'class-6a1', effectiveFrom: '2026-10-31', userId: 't2' }),
  );
});

test('assignUser replacement closes the outgoing GVCN row by date and leaves it active', () => {
  const source = readFileSync(new URL('../convex/homeroomClasses.ts', import.meta.url), 'utf8');
  const assign = source.slice(source.indexOf('export const assignUser'), source.indexOf('export const transferStudent'));
  assert.match(assign, /planHomeroomTeacherReplacement/);
  assert.match(assign, /\.\.\.plan\.close/);
  assert.match(assign, /assertHomeroomTeacherAssignmentInput/);
  assert.doesNotMatch(assign, /active:\s*false/);
  assert.doesNotMatch(assign, /assignmentType === ["']supervisor["']/);
  assert.doesNotMatch(assign, /args\.assignmentType === ["']supervisor["'] \? ["']supervisor["']/);
});
