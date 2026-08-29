import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  homeroomPathname,
  pathnameForMenu,
  routeForPathname,
} from '../src/navigationRoutes.js';
import { vietnamTodayYmd } from '../src/homeroom/homeroomTime.js';
import { BACK_TO_OVERVIEW } from '../src/homeroom/classCatalog.js';
import {
  HomeroomStudentQueryErrorBoundary,
  HomeroomStudentQueryErrorFallback,
  STUDENT_QUERY_ERROR_TITLE,
  isHomeroomAuthFailure,
  studentQueryErrorBoundaryState,
} from '../src/homeroom/studentQueryErrorBoundary.js';

test('homeroom keeps /lop-chu-nhiem and supports deep subroutes for back/forward', () => {
  assert.equal(pathnameForMenu('homeroom'), '/lop-chu-nhiem');
  assert.deepEqual(routeForPathname('/lop-chu-nhiem'), {
    menu: 'homeroom',
    reportSection: undefined,
    homeroomPath: '/lop-chu-nhiem',
  });
  assert.equal(homeroomPathname({ classId: 'c1', tab: 'diem-danh' }), '/lop-chu-nhiem/lop/c1/diem-danh');
  assert.equal(homeroomPathname({ manageClasses: true }), '/lop-chu-nhiem/quan-ly-lop');
  assert.equal(homeroomPathname({ importAttendance: true }), '/lop-chu-nhiem/import-diem-danh');
  assert.equal(homeroomPathname({ importAttendance: true, classId: 'c1' }), '/lop-chu-nhiem/import-diem-danh/c1');
  const nested = routeForPathname('/lop-chu-nhiem/lop/c1/bao-cao');
  assert.equal(nested?.menu, 'homeroom');
  assert.equal(nested?.homeroomPath, '/lop-chu-nhiem/lop/c1/bao-cao');
  assert.equal(routeForPathname('/lop-chu-nhiem/hoc-sinh/st1')?.menu, 'homeroom');
  assert.equal(routeForPathname('/lop-chu-nhiem/quan-ly-lop')?.menu, 'homeroom');
  assert.equal(routeForPathname('/lop-chu-nhiem/import-diem-danh/c1')?.menu, 'homeroom');
});

test('homeroom frontend date defaults use Vietnam calendar, including UTC 18:00', () => {
  assert.equal(vietnamTodayYmd(Date.parse('2026-09-01T16:30:00.000Z')), '2026-09-01');
  assert.equal(vietnamTodayYmd(Date.parse('2026-09-01T17:00:00.000Z')), '2026-09-02');
  assert.equal(vietnamTodayYmd(Date.parse('2026-09-01T18:00:00.000Z')), '2026-09-02');
  const source = readFileSync(new URL('../src/homeroom/HomeroomRouter.jsx', import.meta.url), 'utf8');
  assert.match(source, /vietnamTodayYmd/);
  assert.doesNotMatch(source, /toISOString\(\)\.slice\(0,\s*10\)/);
});

test('empty school-year state is actionable and never renders an infinite overview loader', () => {
  const source = readFileSync(new URL('../src/homeroom/HomeroomRouter.jsx', import.meta.url), 'utf8');
  assert.match(source, /Chưa cấu hình năm học/);
  assert.match(source, /Thiết lập năm học đầu tiên/);
  assert.match(source, /createSchoolYear/);
  assert.match(source, /disabled=\{!years\?\.length\}/);
  assert.match(source, /!selectedYearId \? \(/);
  assert.match(source, /selectedYearId && \(session\?\.isOperationalManager/);
  assert.match(source, /quan-ly-lop/);
  assert.match(source, /view: 'manage'/);
});

test('student detail recovers from query errors without blanking the CRM', () => {
  const source = readFileSync(new URL('../src/homeroom/HomeroomRouter.jsx', import.meta.url), 'utf8');
  const boundarySource = readFileSync(new URL('../src/homeroom/studentQueryErrorBoundary.js', import.meta.url), 'utf8');
  const studentView = source.slice(source.indexOf("route.view === 'student'"), source.indexOf("route.view === 'import'"));
  assert.match(studentView, /HomeroomStudentQueryErrorBoundary/);
  assert.match(studentView, /<StudentDetail studentId=\{route\.studentId\} \/>/);
  assert.match(boundarySource, /getDerivedStateFromError/);
  assert.match(boundarySource, /studentQueryErrorBoundaryState/);
  assert.doesNotMatch(studentView, /if\s*\(\s*!history\s*\)/);

  const queryError = new Error('HOMEROOM_SCOPE_FORBIDDEN');
  assert.equal(isHomeroomAuthFailure(queryError), false);
  assert.deepEqual(studentQueryErrorBoundaryState(queryError), { error: queryError });
  for (const code of ['UNAUTHENTICATED', 'ACCOUNT_LOCKED', 'USER_NOT_ACTIVE', 'PASSWORD_CHANGE_REQUIRED']) {
    const authError = new Error(code);
    assert.equal(isHomeroomAuthFailure(authError), true);
    assert.throws(() => studentQueryErrorBoundaryState(authError), new RegExp(code));
    assert.throws(
      () => HomeroomStudentQueryErrorBoundary.getDerivedStateFromError(authError),
      new RegExp(code),
    );
  }
  assert.deepEqual(
    HomeroomStudentQueryErrorBoundary.getDerivedStateFromError(queryError),
    { error: queryError },
  );

  const html = renderToStaticMarkup(
    React.createElement(HomeroomStudentQueryErrorFallback, {
      error: queryError,
      onBack() {},
    }),
  );
  assert.match(html, new RegExp(STUDENT_QUERY_ERROR_TITLE));
  assert.match(html, /Về tổng quan/);
  assert.match(html, /role="alert"/);
  assert.equal(BACK_TO_OVERVIEW, 'Về tổng quan');
});
