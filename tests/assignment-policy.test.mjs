import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canCreateAssignments,
  canCreatorMutateWork,
  canReviewWorkCompletion,
  canSeeArchivedWork,
  canSeeLiveWork,
  cleanDutyContent,
  cleanDutyLocationText,
  cleanDutyTitle,
  cleanWorkTitle,
  normalizeDutyClock,
  dutyListTitle,
  dutyLocationLabel,
  isDocumentArchived,
  isWorkItemArchived,
  isWorkNotificationAssignee,
  isWorkReleased,
  workListTitle,
} from '../convex/assignmentPolicy.ts';

test('chỉ admin/mod và tổ trưởng/tổ phó (2/3 sao) được tạo công tác/công việc', () => {
  assert.equal(canCreateAssignments('admin', 0), true);
  assert.equal(canCreateAssignments('moderator', 0), true);
  assert.equal(canCreateAssignments('user', 2), true);
  assert.equal(canCreateAssignments('user', 3), true);
  assert.equal(canCreateAssignments('user', 1), false);
  assert.equal(canCreateAssignments('user', 4), false);
  assert.equal(canCreateAssignments('user', 5), false);
});

test('giờ công tác chuẩn hóa HH:mm từ datetime-local', () => {
  assert.equal(normalizeDutyClock('08:08'), '08:08');
  assert.equal(normalizeDutyClock('8:08'), '08:08');
  assert.equal(normalizeDutyClock('08:08:00'), '08:08');
  assert.equal(normalizeDutyClock(' 17:00:30 '), '17:00');
});

test('tên công tác bắt buộc, list ưu tiên title rồi mới content', () => {
  assert.equal(cleanDutyTitle('  Họp chuyên môn  '), 'Họp chuyên môn');
  assert.throws(() => cleanDutyTitle(''), /INVALID_DUTY_TITLE/);
  assert.throws(() => cleanDutyTitle('x'.repeat(201)), /INVALID_DUTY_TITLE/);
  assert.equal(cleanDutyContent(' Báo cáo tuần '), 'Báo cáo tuần');
  assert.throws(() => cleanDutyContent(''), /INVALID_CONTENT/);
  assert.equal(dutyListTitle({ title: 'Đi thực tế', content: 'Nội dung cũ' }), 'Đi thực tế');
  assert.equal(dutyListTitle({ content: 'Nội dung cũ' }), 'Nội dung cũ');
  assert.equal(dutyListTitle({}), 'Công tác');
});

test('địa điểm công tác là text tự do đã trim', () => {
  assert.equal(cleanDutyLocationText('  Phòng họp A  '), 'Phòng họp A');
  assert.throws(() => cleanDutyLocationText('   '), /INVALID_LOCATION/);
  assert.equal(dutyLocationLabel({ locationText: 'UBND Q.3' }, ['Kho cũ']), 'UBND Q.3');
  assert.equal(dutyLocationLabel({ locationIds: ['x'] }, ['Hội trường']), 'Hội trường');
});

test('danh sách công việc ưu tiên tên công việc, không bắt buộc file', () => {
  assert.equal(cleanWorkTitle(' Họp chuyên môn '), 'Họp chuyên môn');
  assert.throws(() => cleanWorkTitle(''), /INVALID_WORK_TITLE/);
  assert.equal(workListTitle({ title: 'Sổ điểm', fileName: 'scan.pdf' }), 'Sổ điểm');
  assert.equal(workListTitle({ fileName: 'scan.pdf' }), 'scan.pdf');
});

test('công việc hiện ngay khi tạo; chỉ từ chối mới không giao', () => {
  assert.equal(isWorkReleased({ active: true, status: 'pending' }), true);
  assert.equal(isWorkReleased({ active: true, status: 'approved' }), true);
  assert.equal(isWorkReleased({ active: true, status: 'rejected' }), false);
  assert.equal(isWorkReleased({ active: false, status: 'approved' }), false);
});

test('lưu trữ khi người tạo hoặc toàn bộ người nhận cá nhân inactive', () => {
  const users = new Map([
    ['creator', { status: 'disabled' }],
    ['a', { status: 'active' }],
  ]);
  assert.equal(isDocumentArchived({ createdBy: 'creator' }, users), true);
  const activeCreator = new Map([
    ['creator', { status: 'active' }],
    ['a', { status: 'disabled' }],
    ['b', { status: 'disabled' }],
  ]);
  assert.equal(
    isWorkItemArchived(
      { createdBy: 'creator' },
      { assignmentType: 'individual', assigneeUserIds: ['a', 'b'] },
      activeCreator,
    ),
    true,
  );
  assert.equal(
    isWorkItemArchived(
      { createdBy: 'creator' },
      { assignmentType: 'individual', assigneeUserIds: ['a'] },
      new Map([['creator', { status: 'active' }], ['a', { status: 'active' }]]),
    ),
    false,
  );
});

test('người được giao luôn thấy việc của mình; chế độ creator ẩn việc người khác tạo', () => {
  const assignee = {
    actorUserId: 'u1',
    actorRole: 'user',
    actorLevel: 1,
    createdBy: 'lead',
    isAssignee: true,
    visibilityMode: 'creator',
  };
  assert.equal(canSeeLiveWork(assignee), true);
  assert.equal(canSeeLiveWork({ ...assignee, isAssignee: false, actorUserId: 'peer', actorLevel: 3 }), false);
  assert.equal(
    canSeeLiveWork({
      actorUserId: 'hp',
      actorRole: 'user',
      actorLevel: 5,
      createdBy: 'lead',
      isAssignee: false,
      visibilityMode: 'school',
    }),
    true,
  );
  assert.equal(
    canSeeLiveWork({
      actorUserId: 'hp',
      actorRole: 'user',
      actorLevel: 5,
      createdBy: 'lead',
      isAssignee: false,
      visibilityMode: 'creator',
    }),
    false,
  );
  assert.equal(canSeeArchivedWork('admin'), true);
  assert.equal(canSeeArchivedWork('user'), false);
});

test('người tạo mới được duyệt hoàn thành; khóa sửa khi đã có nộp', () => {
  assert.equal(canReviewWorkCompletion({ actorUserId: 'lead', createdBy: 'lead' }), true);
  assert.equal(canReviewWorkCompletion({ actorUserId: 'admin', createdBy: 'lead' }), false);
  assert.equal(canCreatorMutateWork([{ completions: [] }]), true);
  assert.equal(
    canCreatorMutateWork([{ completions: [{ status: 'pending_approval' }] }]),
    false,
  );
  assert.equal(
    canCreatorMutateWork([{ completions: [{ status: 'rejected' }] }]),
    true,
  );
});

test('thông báo công việc mới: admin nhận khi được giao cá nhân, không nhận việc phòng ban', () => {
  const admin = { _id: 'admin-1', role: 'admin', departmentId: 'dept-a' };
  const teacher = { _id: 'user-1', role: 'user', departmentId: 'dept-a' };
  const individual = { assignmentType: 'individual', assigneeUserIds: ['admin-1'], departmentId: 'dept-a' };
  const department = { assignmentType: 'department', assigneeUserIds: [], departmentId: 'dept-a' };
  assert.equal(isWorkNotificationAssignee({ user: admin, item: individual }), true);
  assert.equal(isWorkNotificationAssignee({ user: teacher, item: individual }), false);
  assert.equal(isWorkNotificationAssignee({ user: admin, item: department }), false);
  assert.equal(isWorkNotificationAssignee({ user: teacher, item: department }), true);
});
