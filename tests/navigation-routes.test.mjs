import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MENU_PATHS,
  isSidebarPrimaryMenu,
  pathnameForMenu,
  pathnameForReportSection,
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
  assert.equal(pathnameForMenu('positions'), '/thiet-lap-chuc-vu');
  assert.equal(pathnameForMenu('document-types'), '/thiet-lap-loai-van-ban');
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
  assert.deepEqual(routeForPathname('/bao-cao/ban-tru'), { menu: 'reports', reportSection: 'work' });
  assert.deepEqual(routeForPathname('/thiet-lap-dia-diem'), { menu: 'departments', reportSection: undefined });
});

test('các tab báo cáo đang dùng có đường dẫn riêng', () => {
  assert.equal(pathnameForReportSection('work'), '/bao-cao/cong-viec');
  assert.deepEqual(routeForPathname('/bao-cao/cong-viec'), { menu: 'reports', reportSection: 'work' });
  assert.equal(pathnameForMenu('reports'), '/bao-cao/cong-viec');
});

test('Báo cáo Công tác cũ chuyển vào Lịch công tác chung', () => {
  assert.deepEqual(routeForPathname('/bao-cao/cong-tac'), {
    menu: 'duties',
    reportSection: undefined,
    dutyPath: '/cong-tac/chung',
  });
  assert.deepEqual(routeForPathname('/cong-tac/chung'), {
    menu: 'duties',
    reportSection: undefined,
    dutyPath: '/cong-tac/chung',
  });
  assert.deepEqual(routeForPathname('/cong-tac/tao'), {
    menu: 'duties',
    reportSection: undefined,
    dutyPath: '/cong-tac/tao',
  });
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

test('Thông báo vẫn có đường dẫn nhưng không nằm trên sidebar', () => {
  assert.equal(pathnameForMenu('notifications'), '/thong-bao');
  assert.deepEqual(routeForPathname('/thong-bao'), { menu: 'notifications', reportSection: undefined });
  assert.equal(isSidebarPrimaryMenu('notifications'), false);
  assert.equal(isSidebarPrimaryMenu('work'), true);
  assert.equal(isSidebarPrimaryMenu('reports'), true);
});

test('Ghi nhận lỗi có đường dẫn riêng trên sidebar', () => {
  assert.equal(pathnameForMenu('staff-faults'), '/ghi-nhan-loi');
  assert.deepEqual(routeForPathname('/ghi-nhan-loi'), { menu: 'staff-faults', reportSection: undefined });
  assert.equal(isSidebarPrimaryMenu('staff-faults'), true);
});
