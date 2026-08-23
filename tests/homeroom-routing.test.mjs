import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';

import {
  homeroomPathname,
  pathnameForMenu,
  routeForPathname,
} from '../src/navigationRoutes.js';
import { vietnamTodayYmd } from '../src/homeroom/homeroomTime.js';

test('homeroom keeps /lop-chu-nhiem and supports deep subroutes for back/forward', () => {
  assert.equal(pathnameForMenu('homeroom'), '/lop-chu-nhiem');
  assert.deepEqual(routeForPathname('/lop-chu-nhiem'), {
    menu: 'homeroom',
    reportSection: undefined,
    homeroomPath: '/lop-chu-nhiem',
  });
  assert.equal(homeroomPathname({ classId: 'c1', tab: 'diem-danh' }), '/lop-chu-nhiem/lop/c1/diem-danh');
  const nested = routeForPathname('/lop-chu-nhiem/lop/c1/bao-cao');
  assert.equal(nested?.menu, 'homeroom');
  assert.equal(nested?.homeroomPath, '/lop-chu-nhiem/lop/c1/bao-cao');
  assert.equal(routeForPathname('/lop-chu-nhiem/hoc-sinh/st1')?.menu, 'homeroom');
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
});
