import assert from 'node:assert/strict';
import test from 'node:test';
import { openNotification } from '../src/notifications/openNotification.js';
import { DUTY_NOTIFICATION_FOCUS_TYPES, menuForNotification, WORK_NOTIFICATION_FOCUS_TYPES } from '../src/notifications/useNotificationFocus.js';
import { buildFcmMessage, buildApnsPayload, apnsHosts, isApnsDeviceToken } from '../convex/pushPayload.ts';

test('an unread notification opens exactly once even when mark-read fails', async () => {
  const opened = [];
  const item = { key: 'work:1', read: false };
  const error = await openNotification(
    item,
    async () => { throw new Error('offline'); },
    (openedItem) => opened.push(openedItem.key),
  );

  assert.deepEqual(opened, ['work:1']);
  assert.equal(error.message, 'offline');
});

test('new duty assignment notifications focus the same duty card as deadline reminders', () => {
  assert.deepEqual(DUTY_NOTIFICATION_FOCUS_TYPES, ['duty', 'duty_assigned']);
  assert.equal(menuForNotification({ kind: 'duty', sourceType: 'duty_assigned' }), 'duties');
  assert.equal(DUTY_NOTIFICATION_FOCUS_TYPES.includes('duty_assigned'), true);
});

test('new work assignment notifications open the work list like other work alerts', () => {
  assert.equal(WORK_NOTIFICATION_FOCUS_TYPES.includes('work_assigned'), true);
  assert.equal(menuForNotification({ kind: 'work', sourceType: 'work_assigned' }), 'work');
});

test('FCM work alerts stay data-only so Android can show the local feed banner', () => {
  const message = buildFcmMessage({
    token: 'fcm-registration-token',
    title: 'Công việc mới',
    body: 'Soạn báo cáo',
    kind: 'work',
    sourceType: 'department_work',
    sourceId: 'doc-1',
  });
  assert.equal(message.android.priority, 'high');
  assert.equal('notification' in message.android, false);
  assert.equal('notification' in message, false);
  assert.equal(message.data.title, 'Công việc mới');
  assert.equal(isApnsDeviceToken('a'.repeat(64)), true);
  assert.equal(isApnsDeviceToken('fcm-registration-token'), false);
});

test('iOS lock-screen alerts use an APNs alert payload, not data-only FCM', () => {
  const payload = buildApnsPayload({
    title: 'Công việc mới',
    body: 'Soạn báo cáo',
    kind: 'work',
    sourceType: 'department_work',
    sourceId: 'doc-1',
  });
  assert.equal(payload.aps.alert.title, 'Công việc mới');
  assert.equal(payload.aps.alert.body, 'Soạn báo cáo');
  assert.equal(payload.aps.sound, 'default');
  assert.deepEqual(apnsHosts(false), ['api.sandbox.push.apple.com', 'api.push.apple.com']);
  assert.deepEqual(apnsHosts(true)[0], 'api.push.apple.com');
});
