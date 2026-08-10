import assert from 'node:assert/strict';
import test from 'node:test';
import { openNotification } from '../src/notifications/openNotification.js';

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
