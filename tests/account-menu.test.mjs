import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('header account menu is Facebook-style and lists the four account actions', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const menu = readFileSync(new URL('../src/profile/AccountMenu.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/profile/accountMenu.css', import.meta.url), 'utf8');

  assert.doesNotMatch(main, /<NavButton id="profile" label="Thông tin cá nhân"/);
  assert.doesNotMatch(main, /className="user-greeting"/);
  assert.match(main, /<AccountMenu onChoose=\{choose\} onSignOut=/);
  assert.match(main, /<OwnAvatarProvider user=\{user\}>/);

  assert.match(menu, /account-menu-trigger/);
  assert.match(menu, /go\('profile'\)/);
  assert.match(menu, /Đổi mật khẩu/);
  assert.match(menu, /Quản lý thiết bị đăng nhập/);
  assert.match(menu, /Đăng xuất/);
  assert.match(menu, /go\('change-password'\)/);
  assert.match(menu, /go\('devices'\)/);
  assert.match(menu, /onSignOut\(\)/);
  assert.match(css, /border-radius: 50%/);
  assert.match(css, /\.account-menu-logout/);
});

test('combined profile view is split into three page modules', () => {
  const pages = readFileSync(new URL('../src/profile/ProfilePages.jsx', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  assert.match(pages, /InternalProfilePanel/);
  assert.match(pages, /ChangePasswordPanel/);
  assert.match(pages, /DevicesPanel mode="self"/);
  assert.match(main, /active === 'change-password'/);
  assert.match(main, /<ChangePasswordView \/>/);
  assert.match(main, /active === 'devices'/);
  assert.match(main, /<DevicesView \/>/);
});
