import assert from 'node:assert/strict';
import test from 'node:test';

import { canOperateMenu, defaultMenuAccess, normalizeMenuAccess } from '../convex/menuAccess.ts';

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
});

test('canOperateMenu true cho view, view_all và legacy edit; false cho hidden', () => {
  assert.equal(canOperateMenu('view'), true);
  assert.equal(canOperateMenu('view_all'), true);
  assert.equal(canOperateMenu('edit'), true);
  assert.equal(canOperateMenu('hidden'), false);
  assert.equal(canOperateMenu(undefined), false);
});
