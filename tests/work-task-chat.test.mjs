import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  canAccessWorkChat,
  isWorkChatAssignee,
  prepareWorkMessageBody,
  sanitizeWorkMessageHtml,
  workChatAuthorInitials,
  workMessagePlainText,
  WORK_MESSAGE_TEXT_MAX_LENGTH,
} from '../convex/workMessagePolicy.ts';

const schemaSource = readFileSync(new URL('../convex/schema.ts', import.meta.url), 'utf8');
const messagesSource = readFileSync(new URL('../convex/workMessages.ts', import.meta.url), 'utf8');
const viewsSource = readFileSync(new URL('../src/work/WorkViews.jsx', import.meta.url), 'utf8');
const iconsSource = readFileSync(new URL('../src/lib/CardActionIcons.jsx', import.meta.url), 'utf8');
const workIconsSource = readFileSync(new URL('../src/work/WorkCardIcons.jsx', import.meta.url), 'utf8');
const modalSource = readFileSync(new URL('../src/lib/DiscussionModal.jsx', import.meta.url), 'utf8');
const workModalSource = readFileSync(new URL('../src/work/WorkTaskChatModal.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/work/work.css', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

const liveDoc = { active: true, createdBy: 'lead', status: 'approved' };
const individualItem = {
  _id: 'wi1',
  active: true,
  assignmentType: 'individual',
  assigneeUserIds: ['u1'],
  departmentId: 'dept-a',
};

test('sanitize strips scripts and attributes but keeps basic rich text', () => {
  const html = sanitizeWorkMessageHtml(
    '<p onclick="alert(1)"><b>Hi</b> <script>alert(1)</script><i>there</i></p><a href="javascript:alert(1)">x</a>',
  );
  assert.match(html, /<b>Hi<\/b>/);
  assert.match(html, /<i>there<\/i>/);
  assert.equal(html.includes('script'), false);
  assert.equal(html.includes('onclick'), false);
  assert.equal(html.includes('javascript'), false);
  assert.equal(html.includes('<a'), false);
  const fromSpan = sanitizeWorkMessageHtml(
    '<span style="font-weight:bold;font-style:italic;text-decoration:underline">Ok</span>',
  );
  assert.equal(fromSpan, '<b><i><u>Ok</u></i></b>');
  assert.equal(sanitizeWorkMessageHtml('<ul><li>Một</li><li>Hai</li></ul>'), '<ul><li>Một</li><li>Hai</li></ul>');
  assert.equal(sanitizeWorkMessageHtml('<p><em>nghiêng</em></p>'), '<p><em>nghiêng</em></p>');
  assert.equal(
    sanitizeWorkMessageHtml('<span style="font-style: oblique">nghiêng</span>'),
    '<i>nghiêng</i>',
  );
});

test('prepareWorkMessageBody rejects empty and overlong messages', () => {
  assert.throws(() => prepareWorkMessageBody('   '), /WORK_CHAT_EMPTY/);
  assert.throws(() => prepareWorkMessageBody('<p><br></p>'), /WORK_CHAT_EMPTY/);
  assert.throws(
    () => prepareWorkMessageBody(`<p>${'x'.repeat(WORK_MESSAGE_TEXT_MAX_LENGTH + 1)}</p>`),
    /WORK_CHAT_TOO_LONG/,
  );
  const prepared = prepareWorkMessageBody('<p><b>  Báo cáo  </b></p>');
  assert.equal(prepared.bodyText, 'Báo cáo');
  assert.match(prepared.bodyHtml, /<b>/);
  assert.equal(workMessagePlainText('<ul><li>A</li><li>B</li></ul>'), 'A\nB');
});

test('chat access follows live work visibility, not a parallel ACL', () => {
  const usersById = new Map([
    ['lead', { status: 'active' }],
    ['u1', { status: 'active' }],
  ]);
  const base = {
    visibilityMode: 'school',
    document: liveDoc,
    workItems: [individualItem],
    usersById,
  };
  assert.equal(
    canAccessWorkChat({
      ...base,
      actorUserId: 'lead',
      actorRole: 'user',
      actorLevel: 2,
      actorDepartmentId: 'dept-a',
    }),
    true,
  );
  assert.equal(
    canAccessWorkChat({
      ...base,
      actorUserId: 'u1',
      actorRole: 'user',
      actorLevel: 1,
      actorDepartmentId: 'dept-a',
    }),
    true,
  );
  assert.equal(
    canAccessWorkChat({
      ...base,
      actorUserId: 'admin-1',
      actorRole: 'admin',
      actorLevel: 5,
      actorDepartmentId: 'other',
    }),
    true,
  );
  assert.equal(
    canAccessWorkChat({
      ...base,
      actorUserId: 'mod-1',
      actorRole: 'moderator',
      actorLevel: 5,
      actorDepartmentId: 'other',
    }),
    true,
  );
  assert.equal(
    canAccessWorkChat({
      ...base,
      actorUserId: 'hp',
      actorRole: 'user',
      actorLevel: 5,
      actorDepartmentId: 'other',
    }),
    true,
  );
  assert.equal(
    canAccessWorkChat({
      ...base,
      actorUserId: 'hp4',
      actorRole: 'user',
      actorLevel: 4,
      actorDepartmentId: 'other',
    }),
    true,
  );
  assert.equal(
    canAccessWorkChat({
      ...base,
      visibilityMode: 'creator',
      actorUserId: 'hp',
      actorRole: 'user',
      actorLevel: 5,
      actorDepartmentId: 'other',
    }),
    false,
  );
  assert.equal(
    canAccessWorkChat({
      ...base,
      actorUserId: 'peer',
      actorRole: 'user',
      actorLevel: 1,
      actorDepartmentId: 'other',
    }),
    false,
  );
  assert.equal(
    canAccessWorkChat({
      ...base,
      document: { ...liveDoc, active: false },
      actorUserId: 'lead',
      actorRole: 'user',
      actorLevel: 2,
      actorDepartmentId: 'dept-a',
    }),
    false,
  );
  assert.equal(
    canAccessWorkChat({
      ...base,
      document: null,
      actorUserId: 'lead',
      actorRole: 'user',
      actorLevel: 2,
      actorDepartmentId: 'dept-a',
    }),
    false,
  );
});

test('department roster and personal-task assignees can join chat', () => {
  const deptItem = {
    _id: 'wi-dept',
    active: true,
    assignmentType: 'department',
    departmentId: 'dept-a',
  };
  assert.equal(
    isWorkChatAssignee({
      actorUserId: 'u2',
      actorDepartmentId: 'dept-a',
      workItems: [deptItem],
    }),
    true,
  );
  assert.equal(
    isWorkChatAssignee({
      actorUserId: 'u3',
      actorDepartmentId: 'dept-b',
      workItems: [deptItem],
      personalTasks: [{ active: true, workItemId: 'wi-dept', assigneeUserIds: ['u3'] }],
    }),
    true,
  );
  assert.equal(
    canAccessWorkChat({
      actorUserId: 'u3',
      actorRole: 'user',
      actorLevel: 1,
      actorDepartmentId: 'dept-b',
      visibilityMode: 'creator',
      document: liveDoc,
      workItems: [deptItem],
      personalTasks: [{ active: true, workItemId: 'wi-dept', assigneeUserIds: ['u3'] }],
      usersById: new Map([['lead', { status: 'active' }]]),
    }),
    true,
  );
});

test('archived work chat is admin/mod only', () => {
  const usersById = new Map([
    ['lead', { status: 'disabled' }],
    ['u1', { status: 'active' }],
  ]);
  const args = {
    actorLevel: 1,
    actorDepartmentId: 'dept-a',
    visibilityMode: 'school',
    document: liveDoc,
    workItems: [individualItem],
    usersById,
  };
  assert.equal(
    canAccessWorkChat({ ...args, actorUserId: 'admin-1', actorRole: 'admin' }),
    true,
  );
  assert.equal(
    canAccessWorkChat({ ...args, actorUserId: 'u1', actorRole: 'user' }),
    false,
  );
});

test('Convex chat module gates list/create server-side', () => {
  assert.match(schemaSource, /workMessages:\s*defineTable/);
  assert.match(schemaSource, /index\("by_document_created"/);
  assert.match(messagesSource, /authorizeWorkChat/);
  assert.match(messagesSource, /canAccessWorkChat/);
  assert.match(messagesSource, /prepareWorkMessageBody/);
  assert.match(messagesSource, /WORK_CHAT_FORBIDDEN/);
  assert.match(messagesSource, /sanitizeWorkMessageHtml\(row\.bodyHtml\)/);
  assert.match(messagesSource, /export const list = query/);
  assert.match(messagesSource, /export const create = mutation/);
  assert.doesNotMatch(messagesSource, /trust client/i);
  assert.equal(workChatAuthorInitials('Nguyễn Văn A'), 'VA');
});

test('work cards use icon controls and open document chat', () => {
  assert.match(iconsSource, /function ChatBubbleIcon/);
  assert.match(iconsSource, /function PencilIcon/);
  assert.match(iconsSource, /function TrashIcon/);
  assert.match(iconsSource, /function ChevronRightIcon/);
  assert.match(iconsSource, /function ChevronDownIcon/);
  assert.match(workIconsSource, /CardExpandHint as WorkExpandHint/);
  assert.match(workIconsSource, /CardIconButton as WorkIconButton/);
  assert.match(viewsSource, /WorkExpandHint/);
  assert.match(viewsSource, /aria-label=\{cardOpen \? 'Thu gọn' : 'Chi tiết'\}/);
  assert.match(viewsSource, /title="Sửa"/);
  assert.match(viewsSource, /title="Xóa"/);
  assert.match(viewsSource, /WorkChatButton/);
  assert.match(viewsSource, /documentId=\{document\._id\}/);
  assert.match(viewsSource, /documentId=\{task\.documentId\}/);
  assert.equal((viewsSource.match(/duty-expand-hint\{cardOpen/g) || []).length, 0);
  assert.doesNotMatch(viewsSource, /disabled=\{saving\}>Sửa<\/button>/);
  assert.doesNotMatch(viewsSource, /disabled=\{saving\}>Xóa<\/button>/);
  assert.match(modalSource, /contentEditable/);
  assert.match(modalSource, /insertUnorderedList/);
  assert.match(workModalSource, /anyApi\.workMessages\.list/);
  assert.match(workModalSource, /anyApi\.workMessages\.create/);
  assert.match(workModalSource, /anyApi\.workMessages\.recall/);
  assert.match(workModalSource, /Trao đổi công việc/);
  assert.match(modalSource, /dangerouslySetInnerHTML/);
  assert.match(modalSource, /work-chat-backdrop/);
  assert.match(cssSource, /\.work-chat-modal\s*\{[^}]*background:\s*#fff/s);
  assert.match(cssSource, /\.work-modal-backdrop\.work-chat-backdrop\s*\{[^}]*background:\s*rgba\(13, 32, 58, 0\.58\)/s);
  assert.match(cssSource, /\.work-chat-modal \.work-kicker\s*\{[^}]*align-self:\s*flex-start/s);
  assert.match(cssSource, /\.work-chat-modal \.work-kicker\s*\{[^}]*padding:\s*5px 10px/s);
  assert.match(cssSource, /\.work-chat-composer-actions \.work-primary-button\s*\{[^}]*color:\s*#fff/s);
  assert.match(cssSource, /\.work-chat-composer-actions \.work-primary-button\s*\{[^}]*background:\s*var\(--lvt-navy, #14355f\)/s);
  assert.match(cssSource, /\.work-chat-composer-actions \.work-primary-button:disabled\s*\{[^}]*color:\s*#fff/s);
  assert.match(modalSource, /command: 'italic'/);
  assert.match(modalSource, /styleWithCSS/);
  assert.match(cssSource, /\.work-chat-editor i/);
  assert.match(cssSource, /font-style:\s*italic/);
  assert.match(mainSource, /@fontsource-variable\/montserrat\/wght-italic\.css/);
});
