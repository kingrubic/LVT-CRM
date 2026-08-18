import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyDutyEndDateTime,
  applyDutyFormField,
  applyDutyStartDateTime,
  buildDutyCreatePreview,
  dutyDisplayTitle,
  dutyFormFromItem,
  dutyFormHasParticipants,
  dutyPayloadFromForm,
  DUTY_LIST_TAB_PAST,
  DUTY_LIST_TAB_UPCOMING,
  emptyDutyForm,
  emptyDutySearch,
  filterDutiesBySearch,
  filterDutiesByTab,
  countDutyAdvancedFilters,
  formatDutyDateTimeLine,
  formatViDate,
  fromDateTimeLocalValue,
  isDutyAssignedTo,
  isDutyCreatedBy,
  splitDutyLists,
  toDateTimeLocalValue,
} from '../src/duties/dutyDisplay.js';

test('format datetime công tác thành 2 hàng ngày-giờ', () => {
  assert.equal(formatViDate('2024-08-15'), '15/08/2024');
  assert.equal(formatDutyDateTimeLine('2024-08-15', '08:00'), '15/08/2024 - 08:00');
  assert.equal(formatDutyDateTimeLine('2026-08-17', '17:00'), '17/08/2026 - 17:00');
  assert.equal(formatDutyDateTimeLine('2024-08-15', '08:00', { allDay: true }), '15/08/2024');
});

test('datetime-local gộp ngày và giờ trên một ô', () => {
  assert.equal(toDateTimeLocalValue('2024-08-15', '08:00'), '2024-08-15T08:00');
  assert.deepEqual(fromDateTimeLocalValue('2026-08-17T17:00'), { date: '2026-08-17', time: '17:00' });
  assert.deepEqual(fromDateTimeLocalValue('2026-08-19T08:08:00'), { date: '2026-08-19', time: '08:08' });
  assert.equal(toDateTimeLocalValue('', '08:00'), '');
});

test('form công tác giữ title và đồng bộ cả ngày', () => {
  const form = emptyDutyForm();
  assert.equal(form.title, '');
  assert.equal(form.startTime, '08:00');
  const started = applyDutyStartDateTime(form, '2024-08-15', '08:00');
  const allDay = applyDutyFormField(started, 'allDay', true);
  assert.equal(allDay.endDate, '2024-08-15');
  const ended = applyDutyEndDateTime(allDay, '2026-08-17', '17:00');
  assert.equal(ended.endDate, '2026-08-17');
  assert.equal(ended.endTime, '17:00');
});

test('payload và title hiển thị ưu tiên tên công tác', () => {
  const item = dutyFormFromItem({
    title: 'Đi thực tế',
    content: 'Làm việc với UBND',
    startDate: '2024-08-15',
    endDate: '2026-08-17',
    startTime: '08:00',
    endTime: '17:00',
    allDay: false,
    locationText: 'HCM',
    departmentIds: ['d1'],
    participantUserIds: ['u1'],
  });
  assert.equal(item.title, 'Đi thực tế');
  assert.equal(dutyDisplayTitle({ content: 'Nội dung cũ' }), 'Nội dung cũ');
  assert.equal(dutyDisplayTitle({ title: 'Đi thực tế', content: 'Nội dung cũ' }), 'Đi thực tế');
  const payload = dutyPayloadFromForm({ ...item, allDay: true });
  assert.equal(payload.endDate, payload.startDate);
  assert.equal(payload.title, 'Đi thực tế');
});

test('tab chưa diễn ra mặc định, sự kiện gần nhất lên đầu', () => {
  const later = { _id: 'b', startDate: '2026-08-20', startTime: '08:00', endDate: '2026-08-20', endTime: '17:00', timing: { isUpcoming: true, isOverdue: false } };
  const sooner = { _id: 'a', startDate: '2026-08-18', startTime: '09:00', endDate: '2026-08-18', endTime: '11:00', timing: { isUpcoming: true, isOverdue: false } };
  const olderPast = { _id: 'c', startDate: '2026-07-26', startTime: '08:00', endDate: '2026-07-26', endTime: '17:00', timing: { isOverdue: true } };
  const newerPast = { _id: 'd', startDate: '2026-07-31', startTime: '08:00', endDate: '2026-08-06', endTime: '17:00', timing: { isOverdue: true } };
  const upcoming = filterDutiesByTab([later, newerPast, olderPast, sooner], DUTY_LIST_TAB_UPCOMING);
  assert.deepEqual(upcoming.map((item) => item._id), ['a', 'b']);
  const finished = filterDutiesByTab([later, newerPast, olderPast, sooner], DUTY_LIST_TAB_PAST);
  assert.deepEqual(finished.map((item) => item._id), ['c', 'd']);
});

test('tạo công tác cần ít nhất một phòng ban hoặc người tham gia', () => {
  const form = {
    ...emptyDutyForm(),
    title: 'Họp khối',
    content: 'Nội dung họp',
    startDate: '2026-08-18',
    endDate: '2026-08-18',
    locationText: 'Phòng họp A',
  };
  assert.equal(dutyFormHasParticipants(form), false);
  assert.equal(dutyFormHasParticipants({ ...form, participantUserIds: ['u1'] }), true);
  assert.equal(dutyFormHasParticipants({ ...form, departmentIds: ['d1'] }), true);
  assert.equal(dutyFormHasParticipants({ ...form, departmentIds: ['d1'] }, { includeDepartments: false }), false);
});

test('preview tạo công tác gom nhãn phòng ban và người tham gia', () => {
  const preview = buildDutyCreatePreview(
    {
      title: 'Đi thực tế',
      content: 'Làm việc với UBND',
      startDate: '2026-08-18',
      endDate: '2026-08-18',
      startTime: '08:00',
      endTime: '17:00',
      allDay: false,
      locationText: 'HCM',
      departmentIds: ['d1'],
      participantUserIds: ['u2'],
    },
    {
      departments: [{ _id: 'd1', name: 'Phòng Tổ chức' }, { _id: 'd2', name: 'Khác' }],
      users: [{ _id: 'u1', name: 'An' }, { _id: 'u2', name: 'Bình' }],
    },
  );
  assert.equal(preview.title, 'Đi thực tế');
  assert.equal(preview.content, 'Làm việc với UBND');
  assert.equal(preview.timeStart, '18/08/2026 - 08:00');
  assert.equal(preview.timeEnd, '18/08/2026 - 17:00');
  assert.equal(preview.location, 'HCM');
  assert.equal(preview.showDepartments, true);
  assert.equal(preview.departments, 'Phòng Tổ chức');
  assert.equal(preview.participants, 'Bình');

  const userPreview = buildDutyCreatePreview(
    {
      title: 'Họp khối',
      content: '',
      startDate: '2026-08-18',
      endDate: '2026-08-19',
      startTime: '08:00',
      endTime: '17:00',
      allDay: true,
      locationText: '',
      departmentIds: ['d1'],
      participantUserIds: [],
    },
    { includeDepartments: false, departments: [{ _id: 'd1', name: 'Phòng Tổ chức' }], users: [] },
  );
  assert.equal(userPreview.timeEnd, 'Cả ngày');
  assert.equal(userPreview.location, '—');
  assert.equal(userPreview.showDepartments, false);
  assert.equal(userPreview.departments, '—');
  assert.equal(userPreview.participants, '—');
});

test('tách danh sách công tác: việc của tôi và việc tôi tạo', () => {
  const mineOnly = { _id: 'a', createdBy: 'boss', isMine: true, participantUserIds: ['me'] };
  const createdOnly = { _id: 'b', createdBy: 'me', participants: [{ _id: 'other' }] };
  const both = { _id: 'c', createdBy: 'me', isMine: true };
  const leftover = { _id: 'd', createdBy: 'other', participantUserIds: ['x'] };

  assert.equal(isDutyAssignedTo(mineOnly, 'me'), true);
  assert.equal(isDutyCreatedBy(createdOnly, 'me'), true);
  assert.equal(isDutyAssignedTo(createdOnly, 'me'), false);

  const userSplit = splitDutyLists([mineOnly, createdOnly, both, leftover], 'me');
  assert.deepEqual(userSplit.mine.map((item) => item._id), ['a', 'c']);
  assert.deepEqual(userSplit.created.map((item) => item._id), ['b', 'c']);

  const adminSplit = splitDutyLists([mineOnly, createdOnly, both, leftover], 'me', { includeManagedOthers: true });
  assert.deepEqual(adminSplit.created.map((item) => item._id), ['b', 'c', 'd']);

  const leadSplit = splitDutyLists([mineOnly, leftover], 'me', {
    includeManagedOthers: true,
    leftoverBucket: 'mine',
  });
  assert.deepEqual(leadSplit.mine.map((item) => item._id), ['a', 'd']);
  assert.deepEqual(leadSplit.created.map((item) => item._id), []);
});

test('tìm kiếm realtime theo tên hoặc nội dung công tác, không dấu', () => {
  const trip = {
    _id: 'a',
    title: 'Họp khối chuyên môn',
    content: 'Làm việc với UBND',
    departmentNames: ['Phòng Giáo viên'],
    participantNames: ['Trần Anh Vũ'],
    locationText: 'Phòng họp A',
    startDate: '2026-08-18',
    endDate: '2026-08-18',
  };
  const other = {
    _id: 'b',
    title: 'Đi thực tế',
    content: 'Tham quan trường bạn',
    departmentNames: ['Phòng Tổ chức'],
    participantNames: ['Admin'],
    locationNames: ['Sân trường'],
    startDate: '2026-08-20',
    endDate: '2026-08-21',
  };
  assert.deepEqual(filterDutiesBySearch([trip, other], { ...emptyDutySearch(), query: 'hop khoi' }).map((item) => item._id), ['a']);
  assert.deepEqual(filterDutiesBySearch([trip, other], { ...emptyDutySearch(), query: 'UBND' }).map((item) => item._id), ['a']);
  assert.deepEqual(filterDutiesBySearch([trip, other], { ...emptyDutySearch(), query: 'thực tế' }).map((item) => item._id), ['b']);
});

test('tìm kiếm nâng cao theo phòng ban, cá nhân, địa điểm và khoảng thời gian', () => {
  const trip = {
    _id: 'a',
    title: 'Họp khối',
    content: 'Nội dung họp',
    departmentNames: ['Phòng Giáo viên'],
    participantNames: ['Trần Anh Vũ'],
    participants: [{ _id: 'u1', name: 'Trần Anh Vũ', email: 'vu@lvt.edu.vn' }],
    locationText: 'Phòng họp A',
    startDate: '2026-08-18',
    endDate: '2026-08-18',
  };
  const other = {
    _id: 'b',
    title: 'Đi thực tế',
    content: 'Tham quan',
    departmentNames: ['Phòng Tổ chức'],
    participantNames: ['Admin'],
    locationNames: ['Sân trường'],
    startDate: '2026-08-20',
    endDate: '2026-08-21',
  };
  const base = emptyDutySearch();
  assert.deepEqual(filterDutiesBySearch([trip, other], { ...base, department: 'giao vien' }).map((item) => item._id), ['a']);
  assert.deepEqual(filterDutiesBySearch([trip, other], { ...base, person: 'anh vu' }).map((item) => item._id), ['a']);
  assert.deepEqual(filterDutiesBySearch([trip, other], { ...base, location: 'san truong' }).map((item) => item._id), ['b']);
  assert.deepEqual(filterDutiesBySearch([trip, other], { ...base, dateFrom: '2026-08-20', dateTo: '2026-08-20' }).map((item) => item._id), ['b']);
  assert.deepEqual(filterDutiesBySearch([trip, other], { ...base, query: 'hop', department: 'to chuc' }).map((item) => item._id), []);
  assert.equal(countDutyAdvancedFilters({ ...base, department: 'A', dateFrom: '2026-08-18' }), 2);
});
