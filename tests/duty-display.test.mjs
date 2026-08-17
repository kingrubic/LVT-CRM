import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyDutyEndDateTime,
  applyDutyFormField,
  applyDutyStartDateTime,
  dutyDisplayTitle,
  dutyFormFromItem,
  dutyPayloadFromForm,
  emptyDutyForm,
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
