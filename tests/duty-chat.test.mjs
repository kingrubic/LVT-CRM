import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { canAccessDutyChat, prepareDutyMessageBody } from '../convex/dutyMessagePolicy.ts';
import { sanitizeWorkMessageHtml } from '../convex/workMessagePolicy.ts';

const schemaSource = readFileSync(new URL('../convex/schema.ts', import.meta.url), 'utf8');
const messagesSource = readFileSync(new URL('../convex/dutyMessages.ts', import.meta.url), 'utf8');
const dutiesSource = readFileSync(new URL('../convex/duties.ts', import.meta.url), 'utf8');
const personalSource = readFileSync(new URL('../src/reports/DutyReportsView.jsx', import.meta.url), 'utf8');
const tableSource = readFileSync(new URL('../src/duties/DutyScheduleTable.jsx', import.meta.url), 'utf8');
const chatButtonSource = readFileSync(new URL('../src/duties/DutyChatButton.jsx', import.meta.url), 'utf8');
const modalSource = readFileSync(new URL('../src/lib/DiscussionModal.jsx', import.meta.url), 'utf8');

const liveDuty = {
  active: true,
  createdBy: 'lead',
  departmentIds: ['dept-a'],
  participantUserIds: ['u1'],
};

const base = {
  actorAccess: 'view',
  actorDepartmentId: 'dept-b',
  duty: liveDuty,
  subordinateUsers: [],
};

test('duty chat access follows personal list visibility', () => {
  assert.equal(
    canAccessDutyChat({
      ...base,
      actorUserId: 'lead',
      actorRole: 'user',
    }),
    true,
  );
  assert.equal(
    canAccessDutyChat({
      ...base,
      actorUserId: 'u1',
      actorRole: 'user',
      actorDepartmentId: 'other',
    }),
    true,
  );
  assert.equal(
    canAccessDutyChat({
      ...base,
      actorUserId: 'dept-member',
      actorRole: 'user',
      actorDepartmentId: 'dept-a',
    }),
    true,
  );
  assert.equal(
    canAccessDutyChat({
      ...base,
      actorUserId: 'admin-1',
      actorRole: 'admin',
      actorDepartmentId: 'other',
    }),
    true,
  );
  assert.equal(
    canAccessDutyChat({
      ...base,
      actorUserId: 'mod-1',
      actorRole: 'moderator',
      actorDepartmentId: 'other',
    }),
    true,
  );
  assert.equal(
    canAccessDutyChat({
      ...base,
      actorUserId: 'viewer',
      actorRole: 'user',
      actorAccess: 'view_all',
      actorDepartmentId: 'other',
    }),
    true,
  );
  assert.equal(
    canAccessDutyChat({
      ...base,
      actorUserId: 'boss',
      actorRole: 'user',
      actorDepartmentId: 'dept-b',
      subordinateUsers: [{ _id: 'u1', departmentId: 'dept-a' }],
    }),
    true,
  );
  assert.equal(
    canAccessDutyChat({
      ...base,
      actorUserId: 'stranger',
      actorRole: 'user',
      actorDepartmentId: 'dept-z',
    }),
    false,
  );
  assert.equal(
    canAccessDutyChat({
      ...base,
      actorUserId: 'lead',
      actorRole: 'user',
      duty: { ...liveDuty, active: false },
    }),
    false,
  );
  assert.equal(
    canAccessDutyChat({
      ...base,
      actorUserId: 'lead',
      actorRole: 'user',
      duty: null,
    }),
    false,
  );
});

test('duty message body reuses work sanitizer with duty error codes', () => {
  assert.throws(() => prepareDutyMessageBody('   '), /DUTY_CHAT_EMPTY/);
  assert.throws(() => prepareDutyMessageBody('<p><br></p>'), /DUTY_CHAT_EMPTY/);
  const prepared = prepareDutyMessageBody('<p><i>nghiêng</i></p>');
  assert.equal(prepared.bodyText, 'nghiêng');
  assert.equal(prepared.bodyHtml, '<p><i>nghiêng</i></p>');
  assert.equal(sanitizeWorkMessageHtml('<em>ok</em>'), '<em>ok</em>');
});

test('Convex duty chat module gates list/create server-side', () => {
  assert.match(schemaSource, /dutyMessages:\s*defineTable/);
  assert.match(schemaSource, /index\("by_duty_created"/);
  assert.match(messagesSource, /authorizeDutyChat/);
  assert.match(messagesSource, /canAccessDutyChat/);
  assert.match(messagesSource, /prepareDutyMessageBody/);
  assert.match(messagesSource, /DUTY_CHAT_FORBIDDEN/);
  assert.match(messagesSource, /sanitizeWorkMessageHtml\(row\.bodyHtml\)/);
  assert.match(messagesSource, /export const list = query/);
  assert.match(messagesSource, /export const create = mutation/);
  assert.match(messagesSource, /requireDutiesAccess/);
  assert.match(dutiesSource, /canChat:\s*canAccessDutyChat/);
});

test('duty cards and shared rows use icons plus duty chat', () => {
  assert.match(personalSource, /CardExpandHint/);
  assert.match(personalSource, /aria-label=\{cardOpen \? 'Thu gọn' : 'Chi tiết'\}/);
  assert.match(personalSource, /title="Sửa"/);
  assert.match(personalSource, /title="Xóa"/);
  assert.match(personalSource, /DutyChatButton/);
  assert.match(personalSource, /dutyId=\{event\._id\}/);
  assert.doesNotMatch(personalSource, />Sửa<\/button>/);
  assert.doesNotMatch(personalSource, />Xóa<\/button>/);
  assert.match(tableSource, /DutyChatButton/);
  assert.match(tableSource, /dutyId=\{row\.eventId\}/);
  assert.match(tableSource, /row\.canChat !== false/);
  assert.match(tableSource, /title="Sửa"/);
  assert.match(tableSource, /Sửa công tác/);
  assert.match(tableSource, /stopPropagation/);
  assert.match(chatButtonSource, /anyApi\.dutyMessages\.list/);
  assert.match(chatButtonSource, /anyApi\.dutyMessages\.create/);
  assert.match(chatButtonSource, /Trao đổi công tác/);
  assert.match(modalSource, /contentEditable/);
  assert.match(modalSource, /insertUnorderedList/);
  assert.match(modalSource, /command: 'italic'/);
});
