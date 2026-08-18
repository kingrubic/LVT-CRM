import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MENU_PATHS,
  pathnameForMenu,
  pathnameForReportSection,
  REPORT_PATHS,
  routeForPathname,
} from '../src/navigationRoutes.js';
import {
  ACCOUNT_DELETION_CANONICAL_PATH,
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_ORGANIZATION_VI,
  PRIVACY_POLICY_CANONICAL_PATH,
  isPublicAccountDeletionPath,
  isPublicPrivacyPath,
} from '../src/privacy/privacyPolicy.js';

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

test('đường dẫn menu đã ẩn được chuyển về menu đang dùng', () => {
  assert.deepEqual(routeForPathname('/quan-ly-cong-tac'), { menu: 'duties', reportSection: undefined });
  assert.deepEqual(routeForPathname('/quan-ly-cong-viec'), { menu: 'work', reportSection: undefined });
  assert.deepEqual(routeForPathname('/bao-cao/ban-tru'), { menu: 'reports', reportSection: 'duties' });
  assert.deepEqual(routeForPathname('/thiet-lap-dia-diem'), { menu: 'departments', reportSection: undefined });
});

test('các tab báo cáo đang dùng có đường dẫn riêng', () => {
  for (const reportSection of ['duties', 'work']) {
    const pathname = REPORT_PATHS[reportSection];
    assert.equal(pathnameForReportSection(reportSection), pathname);
    assert.deepEqual(routeForPathname(pathname), { menu: 'reports', reportSection });
  }
});

test('trang chính sách bảo mật là đường dẫn công khai, không phải menu CRM', () => {
  assert.equal(isPublicPrivacyPath('/privacy'), true);
  assert.equal(isPublicPrivacyPath('/chinh-sach-bao-mat/'), true);
  assert.equal(isPublicPrivacyPath('/cong-tac'), false);
  assert.equal(routeForPathname(PRIVACY_POLICY_CANONICAL_PATH), null);
  assert.equal(PRIVACY_CONTACT_EMAIL, 'nnqbao@gmail.com');
  assert.equal(PRIVACY_ORGANIZATION_VI, 'THCS Lê Văn Tám');
});

test('trang xóa tài khoản là đường dẫn công khai cho Play Console', () => {
  assert.equal(isPublicAccountDeletionPath('/xoa-tai-khoan'), true);
  assert.equal(isPublicAccountDeletionPath('/account-deletion/'), true);
  assert.equal(isPublicPrivacyPath(ACCOUNT_DELETION_CANONICAL_PATH), false);
  assert.equal(routeForPathname(ACCOUNT_DELETION_CANONICAL_PATH), null);
});
