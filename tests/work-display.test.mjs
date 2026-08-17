import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assignmentRecipientLabel,
  assignmentsFromDocument,
  buildWorkCreatePreview,
  emptyWorkAssignment,
  filterWorksByTab,
  formatWorkDate,
  isWorkPast,
  workAssignmentPayload,
  workContentSummary,
  workDeadlineKey,
  WORK_LIST_TAB_PAST,
  WORK_LIST_TAB_UPCOMING,
  workListTitle,
} from '../src/work/workDisplay.js';

test('format và row phân công công việc', () => {
  assert.equal(formatWorkDate('2026-08-18'), '18/08/2026');
  assert.equal(formatWorkDate(''), '—');
  const row = emptyWorkAssignment('individual');
  assert.equal(row.type, 'individual');
  assert.deepEqual(row.userIds, []);
  assert.equal(emptyWorkAssignment('department').type, 'department');
});

test('sửa công việc tách cá nhân thành một người mỗi row', () => {
  const rows = assignmentsFromDocument({
    assignments: [
      { type: 'department', departmentId: 'd1', content: 'Báo cáo', deadline: '2026-08-20' },
      { type: 'individual', userIds: ['u1', 'u2'], content: 'Soạn', deadline: '2026-08-21' },
    ],
  });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1].userIds, ['u1']);
  assert.deepEqual(rows[2].userIds, ['u2']);
  assert.deepEqual(workAssignmentPayload(rows)[0], {
    type: 'department',
    departmentId: 'd1',
    content: 'Báo cáo',
    deadline: '2026-08-20',
  });
});

test('tab chưa diễn ra loại việc đã xong hoặc hết hạn', () => {
  const today = '2026-08-17';
  const upcoming = {
    _id: 'a',
    title: 'Sắp tới',
    deadline: '2026-08-20',
    status: 'in_progress',
  };
  const overdue = { _id: 'b', title: 'Hết hạn', deadline: '2026-08-10', status: 'overdue' };
  const done = { _id: 'c', title: 'Xong', deadline: '2026-08-30', workStatus: 'completed' };
  const later = {
    _id: 'd',
    title: 'Nhiều hạn',
    assignments: [
      { deadline: '2026-08-25' },
      { deadline: '2026-08-19' },
    ],
    status: 'in_progress',
  };
  assert.equal(isWorkPast(overdue, today), true);
  assert.equal(isWorkPast(done, today), true);
  assert.equal(isWorkPast(upcoming, today), false);
  assert.equal(workDeadlineKey(later), '2026-08-19');
  const open = filterWorksByTab([later, overdue, done, upcoming], WORK_LIST_TAB_UPCOMING, today);
  assert.deepEqual(open.map((item) => item._id), ['d', 'a']);
  const past = filterWorksByTab([later, overdue, done, upcoming], WORK_LIST_TAB_PAST, today);
  assert.deepEqual(past.map((item) => item._id), ['b', 'c']);
});

test('preview tạo công việc gom nhãn đối tượng', () => {
  const preview = buildWorkCreatePreview(
    {
      title: 'Họp tổ',
      fileName: 'ke-hoach.pdf',
      assignments: [
        { type: 'department', departmentId: 'd1', content: 'Chuẩn bị', deadline: '2026-08-18' },
        { type: 'individual', userIds: ['u2'], content: '', deadline: '2026-08-19' },
      ],
    },
    {
      departments: [{ _id: 'd1', name: 'Tổ Toán' }],
      users: [{ _id: 'u2', name: 'Bình' }],
    },
  );
  assert.equal(preview.title, 'Họp tổ');
  assert.equal(preview.fileName, 'ke-hoach.pdf');
  assert.equal(preview.rows[0].recipient, 'Tổ Toán');
  assert.equal(preview.rows[0].deadline, '18/08/2026');
  assert.equal(preview.rows[1].recipient, 'Bình');
  assert.equal(preview.rows[1].content, '—');
  assert.equal(assignmentRecipientLabel({ type: 'individual', userIds: [] }), 'Chưa chọn người');
  assert.equal(workListTitle({ fileName: 'a.pdf' }), 'a.pdf');
  assert.equal(workContentSummary({ assignments: [{ content: 'Một' }, { content: 'Hai' }] }), 'Một (+1)');
});
