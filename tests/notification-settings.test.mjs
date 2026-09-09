import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HOUR_MS,
  cleanNotificationMilestones,
  createMilestones,
  resolveSourceMilestones,
  unionMilestoneHours,
} from '../convex/notificationSettings.ts';

test('mốc thông báo chỉ nhận giờ nguyên 0–720, không trùng', () => {
  assert.deepEqual(cleanNotificationMilestones([0, 24, 48]), [48, 24, 0]);
  assert.throws(() => cleanNotificationMilestones([]), /INVALID_NOTIFICATION_MILESTONES/);
  assert.throws(() => cleanNotificationMilestones([-1]), /INVALID_NOTIFICATION_MILESTONES/);
  assert.throws(() => cleanNotificationMilestones([24.5]), /INVALID_NOTIFICATION_MILESTONES/);
  assert.throws(() => cleanNotificationMilestones([24, 24]), /INVALID_NOTIFICATION_MILESTONES/);
});

test('nguồn mới kế thừa mốc chung khi chưa tách', () => {
  assert.deepEqual(resolveSourceMilestones(null, [24, 0]), [24, 0]);
  assert.deepEqual(resolveSourceMilestones([], [12, 0]), [12, 0]);
  assert.deepEqual(resolveSourceMilestones([6, 0], [48, 24, 12, 0]), [6, 0]);
  assert.deepEqual(resolveSourceMilestones(null, null), [48, 24, 12, 0]);
});

test('công tác và công việc có thể khác mốc giờ', () => {
  const now = 1_700_000_000_000;
  const dueAt = now + 10 * HOUR_MS;
  const shared = {
    sourceId: 'a',
    title: 'Họp',
    dueAt,
  };
  const dutyItems = createMilestones(
    [{ ...shared, kind: 'duty', sourceType: 'duty' }],
    [6, 0],
    now,
  );
  const workItems = createMilestones(
    [{ ...shared, kind: 'work', sourceType: 'department_work' }],
    [24, 0],
    now,
  );
  assert.deepEqual(dutyItems.map((item) => item.milestoneHours), []);
  assert.deepEqual(workItems.map((item) => item.milestoneHours), [24]);
  assert.deepEqual(unionMilestoneHours([6, 0], [24, 0]), [24, 6, 0]);
});
