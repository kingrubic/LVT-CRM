import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assertValidMenuAccessEntries,
  canonicalizeMenuAccessLevel,
  canOperateMenu,
  cleanPermissionGroupMenuAccess,
  defaultMenuAccess,
  isHomeroomSupervisorAccess,
  isMenuVisible,
  isViewAllAccess,
  normalizeMenuAccess,
} from '../convex/menuAccess.ts';

test('normalizeMenuAccess map legacy edit thành view', () => {
  const normalized = Object.fromEntries(
    normalizeMenuAccess([
      { menu: 'duties', access: 'edit' },
      { menu: 'notifications', access: 'edit' },
    ]).map((entry) => [entry.menu, entry.access]),
  );
  assert.equal(normalized.duties, 'view');
  assert.equal(normalized.notifications, 'view');
  assert.equal(normalized.reports, 'hidden');
});

test('normalizeMenuAccess điền menu thiếu: Thông báo view, còn lại hidden', () => {
  const normalized = Object.fromEntries(
    normalizeMenuAccess([]).map((entry) => [entry.menu, entry.access]),
  );
  const defaults = Object.fromEntries(defaultMenuAccess().map((entry) => [entry.menu, entry.access]));
  assert.deepEqual(normalized, defaults);
  assert.equal(normalized.notifications, 'view');
  assert.equal(normalized.work, 'hidden');
  assert.equal(normalized.homeroom, 'hidden');
  assert.equal(normalized['staff-faults'], 'hidden');
});

test('canOperateMenu true cho view, view_all và legacy edit; false cho hidden và supervisor', () => {
  assert.equal(canOperateMenu('view'), true);
  assert.equal(canOperateMenu('view_all'), true);
  assert.equal(canOperateMenu('edit'), true);
  assert.equal(canOperateMenu('hidden'), false);
  assert.equal(canOperateMenu('supervisor'), false);
  assert.equal(canOperateMenu(undefined), false);
});

test('homeroom=supervisor is canonical and remains supervisor', () => {
  const normalized = normalizeMenuAccess([{ menu: 'homeroom', access: 'supervisor' }]);
  const homeroom = normalized.find((entry) => entry.menu === 'homeroom');
  assert.equal(homeroom?.access, 'supervisor');
  assert.equal(isHomeroomSupervisorAccess(homeroom?.access), true);
  assert.equal(isMenuVisible(homeroom?.access), true);
  assert.equal(isViewAllAccess(homeroom?.access), false);
});

test('supervisor on any menu other than homeroom is rejected', () => {
  assert.throws(
    () => assertValidMenuAccessEntries([{ menu: 'duties', access: 'supervisor' }]),
    /INVALID_MENU_ACCESS/,
  );
  assert.throws(
    () => assertValidMenuAccessEntries([{ menu: 'work', access: 'supervisor' }]),
    /INVALID_MENU_ACCESS/,
  );
  assert.throws(
    () =>
      cleanPermissionGroupMenuAccess([
        { menu: 'reports', access: 'view' },
        { menu: 'notifications', access: 'view' },
        { menu: 'duties', access: 'supervisor' },
        { menu: 'work', access: 'hidden' },
        { menu: 'homeroom', access: 'view' },
        { menu: 'people-review', access: 'hidden' },
      ]),
    /INVALID_MENU_ACCESS/,
  );
});

test('legacy edit normalizes to view and is never promoted to supervisor', () => {
  assert.equal(canonicalizeMenuAccessLevel('edit'), 'view');
  const normalized = normalizeMenuAccess([
    { menu: 'homeroom', access: 'edit' },
    { menu: 'duties', access: 'edit' },
    { menu: 'work', access: 'view_all' },
  ]);
  assert.equal(normalized.find((entry) => entry.menu === 'homeroom')?.access, 'view');
  assert.equal(normalized.find((entry) => entry.menu === 'duties')?.access, 'view');
  assert.equal(normalized.find((entry) => entry.menu === 'work')?.access, 'view_all');
  assert.ok(normalized.every((entry) => entry.access !== 'supervisor'));
});

test('unknown access never grants visibility or view_all', () => {
  assert.equal(canonicalizeMenuAccessLevel('superuser'), 'hidden');
  assert.equal(isMenuVisible(canonicalizeMenuAccessLevel('')), false);
  assert.equal(isViewAllAccess(canonicalizeMenuAccessLevel('edit')), false);
});

test('supervisor is not view_all and does not broaden another menu', () => {
  const normalized = normalizeMenuAccess([
    { menu: 'homeroom', access: 'supervisor' },
    { menu: 'reports', access: 'hidden' },
  ]);
  const reports = normalized.find((entry) => entry.menu === 'reports');
  const homeroom = normalized.find((entry) => entry.menu === 'homeroom');
  assert.equal(isViewAllAccess(homeroom?.access), false);
  assert.equal(isMenuVisible(reports?.access), false);
  assert.equal(isHomeroomSupervisorAccess(reports?.access), false);
});

test('create and update shared helper reject a crafted non-homeroom supervisor payload', () => {
  const crafted = [
    { menu: 'reports', access: 'supervisor' },
    { menu: 'homeroom', access: 'view' },
  ];
  assert.throws(() => cleanPermissionGroupMenuAccess(crafted), /INVALID_MENU_ACCESS/);
  assert.doesNotThrow(() =>
    cleanPermissionGroupMenuAccess([{ menu: 'homeroom', access: 'supervisor' }]),
  );
});

test('permission matrix source shows Giám thị after Xem tối cao and only for homeroom', () => {
  const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const headStart = source.indexOf('perm-matrix-head');
  assert.ok(headStart > 0);
  const headBlock = source.slice(headStart, headStart + 500);
  const hiddenAt = headBlock.indexOf('Ẩn');
  const viewAt = headBlock.indexOf('Xem</span>');
  const viewAllAt = headBlock.indexOf('Xem tối cao');
  const supervisorAt = headBlock.indexOf('Giám thị');
  const editAt = headBlock.indexOf('Sửa');
  assert.ok(hiddenAt >= 0 && viewAt > hiddenAt && viewAllAt > viewAt && supervisorAt > viewAllAt);
  assert.equal(editAt, -1, 'Sửa must not remain a visible matrix column');

  assert.match(source, /menu\.id !== ['"]homeroom['"]/);
  assert.match(source, /radio-cell-unavailable|—/);
  assert.match(source, /Giám thị chỉ dành cho menu Lớp chủ nhiệm/);
});
