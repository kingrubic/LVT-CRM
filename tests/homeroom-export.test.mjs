import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AttendanceReportsTable } from '../src/homeroom/AttendanceReportsTable.js';
import {
  buildAttendancePdfLines,
  buildAttendanceReportVisibleMatrix,
  buildAttendanceXlsxMatrix,
  formatAttendanceStudentLabel,
} from '../src/homeroom/homeroomExport.js';

const INTERNAL_STUDENT_ID = 'qn7abcinternalstudent01';

const uatPayload = {
  title: 'Báo cáo điểm danh lớp chủ nhiệm',
  schoolName: 'THCS Lê Văn Tám',
  className: '6A1',
  schoolYearName: '2026-2027',
  from: '2026-09-01',
  to: '2026-09-02',
  generatedAt: 1,
  generatedByUserId: 'u1',
  generatedByName: 'Giám thị',
  attendanceRate: 0.5,
  ratedRows: 2,
  rows: [
    {
      classId: 'class-6a1',
      studentId: INTERNAL_STUDENT_ID,
      studentCode: 'QA-HS001',
      fullName: 'Nguyễn An',
      attendanceDate: '2026-09-01',
      effectiveStatus: 'present',
      rawObservation: 'present',
    },
    {
      classId: 'class-6a1',
      studentId: INTERNAL_STUDENT_ID,
      studentCode: 'QA-HS001',
      fullName: 'Nguyễn An',
      attendanceDate: '2026-09-02',
      effectiveStatus: 'absent_unexcused',
      rawObservation: 'absent',
    },
  ],
};

function assertNoInternalIdentity(text) {
  assert.doesNotMatch(String(text), /qn7|qn[a-z0-9]+internal/i);
  assert.equal(String(text).includes(INTERNAL_STUDENT_ID), false);
}

test('report UI shows QA-HS001 / Nguyễn An and never the internal student id', () => {
  assert.equal(formatAttendanceStudentLabel(uatPayload.rows[0]), 'QA-HS001 Nguyễn An');
  assertNoInternalIdentity(formatAttendanceStudentLabel({
    studentId: INTERNAL_STUDENT_ID,
    studentCode: 'QA-HS001',
    fullName: 'Nguyễn An',
  }));
  assert.doesNotMatch(formatAttendanceStudentLabel({ studentId: INTERNAL_STUDENT_ID }), /qn7/);

  const matrix = buildAttendanceReportVisibleMatrix(uatPayload.rows);
  assert.deepEqual(matrix[0], ['Ngày', 'Học sinh', 'Trạng thái']);
  assert.deepEqual(matrix[1], ['2026-09-01', 'QA-HS001 Nguyễn An', 'Có mặt']);
  assert.deepEqual(matrix[2], ['2026-09-02', 'QA-HS001 Nguyễn An', 'Vắng không phép']);
  for (const row of matrix) {
    assertNoInternalIdentity(row.join(' '));
  }

  const html = renderToStaticMarkup(React.createElement(AttendanceReportsTable, { days: uatPayload.rows }));
  assert.match(html, /QA-HS001/);
  assert.match(html, /Nguyễn An/);
  assert.match(html, /Có mặt/);
  assert.match(html, /Vắng không phép/);
  assertNoInternalIdentity(html);

  const routerSource = readFileSync(new URL('../src/homeroom/HomeroomRouter.jsx', import.meta.url), 'utf8');
  const reportsFn = routerSource.slice(
    routerSource.indexOf('function AttendanceReports'),
    routerSource.indexOf('function AttendanceImportView'),
  );
  assert.match(reportsFn, /AttendanceReportsTable/);
  assert.match(reportsFn, /report\.summary\.days/);
  assert.doesNotMatch(reportsFn, /<td>\{row\.studentId\}<\/td>/);
});

test('XLSX and PDF export matrices use code, name, class/year titles, and keep 50.0%', () => {
  const xlsx = buildAttendanceXlsxMatrix(uatPayload);
  const banner = xlsx[0][0];
  assert.match(banner, /6A1/);
  assert.match(banner, /2026-2027/);
  assert.doesNotMatch(banner, /Lớp ngoài phạm vi|Năm học rò rỉ/);
  assert.deepEqual(xlsx[1], ['Ngày', 'Mã HS', 'Học sinh', 'Trạng thái hiệu lực', 'Quan sát camera']);
  assert.deepEqual(xlsx[2], ['2026-09-01', 'QA-HS001', 'Nguyễn An', 'Có mặt', 'present']);
  assert.deepEqual(xlsx[3], ['2026-09-02', 'QA-HS001', 'Nguyễn An', 'Vắng không phép', 'absent']);
  for (const row of xlsx) {
    assertNoInternalIdentity(Array.isArray(row) ? row.join(' | ') : row);
  }

  const pdf = buildAttendancePdfLines(uatPayload);
  assert.match(pdf[0], /điểm danh/);
  assert.match(pdf.join('\n'), /6A1/);
  assert.match(pdf.join('\n'), /2026-2027/);
  assert.match(pdf.join('\n'), /50\.0%/);
  assert.match(pdf.join('\n'), /QA-HS001/);
  assert.match(pdf.join('\n'), /Nguyễn An/);
  assert.match(pdf.join('\n'), /Có mặt/);
  assert.match(pdf.join('\n'), /Vắng không phép/);
  assert.ok(pdf.some((line) => line.includes('QA-HS001') && line.includes('Nguyễn An') && line.includes('Có mặt')));
  assert.ok(pdf.some((line) => line.includes('QA-HS001') && line.includes('Nguyễn An') && line.includes('Vắng không phép')));
  for (const line of pdf) {
    assertNoInternalIdentity(line);
  }
});
