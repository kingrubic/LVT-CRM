import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assignmentRecipientLabel,
  assignmentsFromDocument,
  buildWorkCreatePreview,
  emptyWorkAssignment,
  emptyWorkSearch,
  filterWorksBySearch,
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

test('tìm kiếm realtime theo tên hoặc nội dung công việc, không dấu', () => {
  const mine = {
    _id: 'a',
    documentTitle: 'Họp tổ chuyên môn',
    content: 'Soạn báo cáo tuần',
    departmentName: 'Tổ Toán',
    deadline: '2026-08-20',
    members: [{ name: 'Trần Anh Vũ' }],
  };
  const created = {
    _id: 'b',
    title: 'Đi thực tế',
    content: 'Chuẩn bị hồ sơ',
    assignments: [
      {
        type: 'department',
        departmentName: 'Phòng Tổ chức',
        content: 'Chuẩn bị hồ sơ',
        deadline: '2026-08-22',
        members: [{ name: 'Admin' }],
      },
    ],
  };
  assert.deepEqual(filterWorksBySearch([mine, created], { ...emptyWorkSearch(), query: 'hop to' }).map((item) => item._id), ['a']);
  assert.deepEqual(filterWorksBySearch([mine, created], { ...emptyWorkSearch(), query: 'bao cao' }).map((item) => item._id), ['a']);
  assert.deepEqual(filterWorksBySearch([mine, created], { ...emptyWorkSearch(), query: 'thực tế' }).map((item) => item._id), ['b']);
});

test('tìm kiếm nâng cao công việc theo phòng ban, cá nhân và hạn chót', () => {
  const mine = {
    _id: 'a',
    documentTitle: 'Họp tổ',
    content: 'Soạn báo cáo',
    departmentName: 'Tổ Toán',
    deadline: '2026-08-20',
    members: [{ name: 'Trần Anh Vũ' }],
  };
  const created = {
    _id: 'b',
    title: 'Đi thực tế',
    assignments: [
      {
        type: 'department',
        departmentName: 'Phòng Tổ chức',
        content: 'Chuẩn bị',
        deadline: '2026-08-22',
        members: [{ name: 'Admin' }],
      },
    ],
  };
  const base = emptyWorkSearch();
  assert.deepEqual(filterWorksBySearch([mine, created], { ...base, department: 'to toan' }).map((item) => item._id), ['a']);
  assert.deepEqual(filterWorksBySearch([mine, created], { ...base, person: 'anh vu' }).map((item) => item._id), ['a']);
  assert.deepEqual(filterWorksBySearch([mine, created], { ...base, dateFrom: '2026-08-22', dateTo: '2026-08-22' }).map((item) => item._id), ['b']);
  assert.deepEqual(filterWorksBySearch([mine, created], { ...base, query: 'hop', department: 'to chuc' }).map((item) => item._id), []);
});
