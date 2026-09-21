import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildChatNotificationItem,
  canRecallChatMessage,
  CHAT_RECALL_WINDOW_MS,
  CHAT_RECALLED_PLACEHOLDER,
  evaluateChatRecall,
  recallErrorCode,
  selectVisibleChatNotifications,
  shouldNotifyChatViewer,
} from '../convex/chatMessagePolicy.ts';

const schemaSource = readFileSync(new URL('../convex/schema.ts', import.meta.url), 'utf8');
const workMessagesSource = readFileSync(new URL('../convex/workMessages.ts', import.meta.url), 'utf8');
const dutyMessagesSource = readFileSync(new URL('../convex/dutyMessages.ts', import.meta.url), 'utf8');
const notificationsSource = readFileSync(new URL('../convex/notifications.ts', import.meta.url), 'utf8');
const modalSource = readFileSync(new URL('../src/lib/DiscussionModal.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/work/work.css', import.meta.url), 'utf8');
const focusSource = readFileSync(new URL('../src/notifications/useNotificationFocus.js', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

const now = 1_700_000_000_000;

test('only the author may recall within 15 minutes', () => {
  const base = {
    actorUserId: 'u1',
    authorUserId: 'u1',
    createdAt: now - 5 * 60 * 1000,
    now,
  };
  assert.equal(canRecallChatMessage(base), true);
  assert.equal(evaluateChatRecall({ ...base, actorUserId: 'u2' }).code, 'CHAT_RECALL_NOT_AUTHOR');
  assert.equal(
    evaluateChatRecall({ ...base, createdAt: now - CHAT_RECALL_WINDOW_MS - 1 }).code,
    'CHAT_RECALL_TOO_LATE',
  );
  assert.equal(evaluateChatRecall({ ...base, recalledAt: now - 1000 }).code, 'CHAT_RECALL_ALREADY');
  assert.equal(recallErrorCode('work', 'CHAT_RECALL_NOT_AUTHOR'), 'WORK_CHAT_RECALL_FORBIDDEN');
  assert.equal(recallErrorCode('duty', 'CHAT_RECALL_TOO_LATE'), 'DUTY_CHAT_RECALL_TOO_LATE');
});

test('chat notifications skip the sender, recalled rows, and people who cannot see the thread', () => {
  assert.equal(
    shouldNotifyChatViewer({
      viewerUserId: 'u2',
      authorUserId: 'u1',
      canSeeChat: true,
    }),
    true,
  );
  assert.equal(
    shouldNotifyChatViewer({
      viewerUserId: 'u1',
      authorUserId: 'u1',
      canSeeChat: true,
    }),
    false,
  );
  assert.equal(
    shouldNotifyChatViewer({
      viewerUserId: 'u2',
      authorUserId: 'u1',
      canSeeChat: false,
    }),
    false,
  );
  assert.equal(
    shouldNotifyChatViewer({
      viewerUserId: 'u2',
      authorUserId: 'u1',
      canSeeChat: true,
      recalledAt: now,
    }),
    false,
  );
  const item = buildChatNotificationItem({
    kind: 'work',
    messageId: 'm1',
    entityId: 'doc-1',
    entityTitle: 'Soạn báo cáo',
    authorName: 'Nguyễn Văn A',
    bodyText: 'Nội dung',
    createdAt: now,
  });
  assert.equal(item.sourceType, 'work_chat');
  assert.equal(item.sourceId, 'doc-1');
  assert.match(item.title, /Nguyễn Văn A đã trao đổi: Soạn báo cáo/);
  assert.equal(item.milestoneLabel, 'Tin nhắn mới');
  assert.equal(selectVisibleChatNotifications([{ createdAt: now - 20 * 24 * 60 * 60 * 1000 }], now).length, 0);
  assert.equal(selectVisibleChatNotifications([{ createdAt: now }], now).length, 1);
});

test('Convex recall and feed wiring stay server-side', () => {
  assert.match(schemaSource, /recalledAt:\s*v\.optional\(v\.number\(\)\)/);
  assert.match(workMessagesSource, /export const recall = mutation/);
  assert.match(workMessagesSource, /evaluateChatRecall/);
  assert.match(workMessagesSource, /WORK_CHAT_RECALL/);
  assert.match(workMessagesSource, /sourceType: "work_chat"/);
  assert.match(dutyMessagesSource, /export const recall = mutation/);
  assert.match(dutyMessagesSource, /DUTY_CHAT_RECALL/);
  assert.match(dutyMessagesSource, /sourceType: "duty_chat"/);
  assert.match(notificationsSource, /buildChatNotificationItem/);
  assert.match(notificationsSource, /shouldNotifyChatViewer/);
  assert.match(notificationsSource, /work_chat/);
  assert.match(notificationsSource, /duty_chat/);
});

test('shared modal shows recalled placeholder and author-only X', () => {
  assert.match(modalSource, /Tin nhắn đã được thu hồi/);
  assert.equal(CHAT_RECALLED_PLACEHOLDER, 'Tin nhắn đã được thu hồi');
  assert.match(modalSource, /Thu hồi tin nhắn/);
  assert.match(modalSource, /work-chat-recall/);
  assert.match(modalSource, /recallMutation/);
  assert.match(cssSource, /\.work-chat-recalled/);
  assert.match(cssSource, /font-style:\s*italic/);
  assert.match(cssSource, /\.work-chat-recall/);
  assert.match(focusSource, /work_chat/);
  assert.match(focusSource, /duty_chat/);
  assert.match(focusSource, /data-chat-entity/);
  assert.match(mainSource, /openChat:/);
  assert.match(mainSource, /ChatAutoOpenProvider/);
});
