/** Pure personal-reminder authorization. Keep this file free of Convex server imports. */

export function dutyAllowsPersonalReminder(timing: { isOverdue?: boolean } | null | undefined) {
  return !timing?.isOverdue;
}

export function workCompletionBlocksReminder(args: {
  userId: string;
  completedUserIds?: string[];
  completions?: Array<{ userId: string; status: string }>;
}) {
  const userId = String(args.userId || "");
  if (!userId) return true;
  if ((args.completedUserIds || []).some((id) => String(id) === userId)) return true;
  const row = (args.completions || []).find((item) => String(item.userId) === userId);
  return row?.status === "approved" || row?.status === "pending_approval";
}

export function canEnableDutyPersonalReminder(args: {
  user: { _id: string; departmentId?: string };
  duty: { active?: boolean; departmentIds?: string[]; participantUserIds?: string[] } | null;
  isParticipant: boolean;
  isOverdue: boolean;
}) {
  if (!args.duty?.active) return "DUTY_NOT_FOUND";
  if (!args.isParticipant) return "PERSONAL_REMINDER_FORBIDDEN";
  if (args.isOverdue) return "DUTY_ALREADY_PAST";
  return null;
}

export function canEnableWorkPersonalReminder(args: {
  found: boolean;
  isAssignee: boolean;
  blockedByCompletion: boolean;
}) {
  if (!args.found) return "WORK_NOT_FOUND";
  if (!args.isAssignee) return "PERSONAL_REMINDER_FORBIDDEN";
  if (args.blockedByCompletion) return "WORK_ALREADY_COMPLETED";
  return null;
}
