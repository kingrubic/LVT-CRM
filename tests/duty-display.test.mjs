import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyDutyEndDateTime,
  applyDutyFormField,
  applyDutyStartDateTime,
  dutyDisplayTitle,
  dutyFormFromItem,
  dutyPayloadFromForm,
  DUTY_LIST_TAB_PAST,
  DUTY_LIST_TAB_UPCOMING,
  emptyDutyForm,
  filterDutiesByTab,
  formatDutyDateTimeLine,
  formatViDate,
  fromDateTimeLocalValue,
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
