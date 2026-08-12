import assert from 'node:assert/strict';
import test from 'node:test';
import {
  USER_EXPORT_HEADERS,
  buildUserExportFileName,
  buildUserExportRows,
  formatExportDateStamp,
  nextUserExportSequence,
} from '../src/lib/userExport.js';

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
  };
}

test('buildUserExportRows exports active users only and labels admin/mod groups', () => {
  const rows = buildUserExportRows({
    users: [
      {
        _id: 'u1',
        name: 'Admin A',
        email: 'admin@school.vn',
        role: 'admin',
        status: 'active',
        departmentId: 'd1',
        positionId: 'p1',
      },
      {
        _id: 'u2',
        name: 'User B',
        email: 'user@school.vn',
        role: 'user',
        status: 'active',
        departmentId: 'd1',
        positionId: 'p1',
        permissionGroupId: 'g1',
      },
      {
        _id: 'u3',
        name: 'Disabled C',
        email: 'off@school.vn',
        role: 'user',
        status: 'disabled',
        departmentId: 'd1',
      },
    ],
    departments: [{ _id: 'd1', code: 'TOAN', name: 'Tổ Toán' }],
    positions: [{ _id: 'p1', code: 'GV', name: 'Giáo viên' }],
    permissionGroups: [{ _id: 'g1', code: 'GVCN', name: 'Giáo viên chủ nhiệm' }],
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(Object.keys(rows[0]), USER_EXPORT_HEADERS);
  assert.equal(rows[0]['Họ tên'], 'Admin A');
  assert.equal(rows[0]['Mã nhóm quyền'], '');
  assert.equal(rows[0]['Tên nhóm quyền'], 'Quản trị viên');
  assert.equal(rows[1]['Họ tên'], 'User B');
  assert.equal(rows[1]['Mã nhóm quyền'], 'GVCN');
  assert.equal(rows[1]['Tên nhóm quyền'], 'Giáo viên chủ nhiệm');
});

test('export filename sequence resets by day stamp', () => {
  const storage = memoryStorage();
  const stamp = formatExportDateStamp(new Date('2026-08-12T10:00:00'));
  assert.equal(nextUserExportSequence(stamp, storage), 1);
  assert.equal(nextUserExportSequence(stamp, storage), 2);
  assert.equal(buildUserExportFileName(new Date('2026-08-12T11:00:00'), storage), 'danh_sach_nguoi_dung_20260812_03.xlsx');
  assert.equal(buildUserExportFileName(new Date('2026-08-13T09:00:00'), storage), 'danh_sach_nguoi_dung_20260813_01.xlsx');
});
