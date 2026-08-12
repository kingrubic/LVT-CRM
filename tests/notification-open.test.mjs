import assert from 'node:assert/strict';
import test from 'node:test';
import { openNotification } from '../src/notifications/openNotification.js';
import { DUTY_NOTIFICATION_FOCUS_TYPES, menuForNotification } from '../src/notifications/useNotificationFocus.js';

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
