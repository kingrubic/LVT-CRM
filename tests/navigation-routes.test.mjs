import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MENU_PATHS,
  pathnameForMenu,
  pathnameForReportSection,
  REPORT_PATHS,
  routeForPathname,
} from '../src/navigationRoutes.js';

test('mỗi menu CRM có một đường dẫn con duy nhất', () => {
  const paths = Object.values(MENU_PATHS);
  assert.equal(new Set(paths).size, paths.length);
  assert.equal(pathnameForMenu('users'), '/thiet-lap-nguoi-dung');
  assert.equal(pathnameForMenu('roles'), '/thiet-lap-nhom-quyen');
  assert.equal(pathnameForMenu('profile'), '/thong-tin-ca-nhan');
});

test('đường dẫn con mở đúng menu và chuẩn hóa dấu gạch cuối', () => {
  assert.deepEqual(routeForPathname('/thiet-lap-nguoi-dung'), { menu: 'users', reportSection: undefined });
  assert.deepEqual(routeForPathname('/thiet-lap-nguoi-dung/'), { menu: 'users', reportSection: undefined });
  assert.deepEqual(routeForPathname('/cong-viec?from=notification'), { menu: 'work', reportSection: undefined });
  assert.equal(routeForPathname('/khong-ton-tai'), null);
  assert.equal(routeForPathname('/'), null);
});

test('các tab báo cáo có đường dẫn riêng và khôi phục đúng tab', () => {
  for (const [reportSection, pathname] of Object.entries(REPORT_PATHS)) {
    assert.equal(pathnameForReportSection(reportSection), pathname);
    assert.deepEqual(routeForPathname(pathname), { menu: 'reports', reportSection });
  }
});
