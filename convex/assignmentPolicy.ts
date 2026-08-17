/** Pure assignment / visibility rules for công tác and công việc. */

export const TEAM_LEAD_LEVELS = new Set([2, 3]);

export const WORK_VISIBILITY_CREATOR = "creator";
export const WORK_VISIBILITY_SCHOOL = "school";
export const WORK_VISIBILITY_DEFAULT = WORK_VISIBILITY_SCHOOL;
export type WorkVisibilityMode =
  | typeof WORK_VISIBILITY_CREATOR
  | typeof WORK_VISIBILITY_SCHOOL;

export const DUTY_LOCATION_MAX_LENGTH = 200;
export const DUTY_TITLE_MAX_LENGTH = 200;
export const DUTY_CONTENT_MAX_LENGTH = 200;
export const WORK_TITLE_MAX_LENGTH = 200;

export function isTeamLeadLevel(level: number) {
  return level === 2 || level === 3;
}

export function isOperationalManagerRole(role: string) {
  return role === "admin" || role === "moderator";
}

/** Admin/mod or tổ trưởng/tổ phó (2/3★). Level 4/5 cannot create. */
export function canCreateAssignments(role: string, level: number) {
  if (isOperationalManagerRole(role)) return true;
  return isTeamLeadLevel(level);
}

export function normalizeWorkVisibilityMode(value: string | null | undefined): WorkVisibilityMode {
  return value === WORK_VISIBILITY_CREATOR ? WORK_VISIBILITY_CREATOR : WORK_VISIBILITY_SCHOOL;
}

export function cleanDutyTitle(value: string) {
  const title = String(value || "").trim();
  if (!title || title.length > DUTY_TITLE_MAX_LENGTH) throw new Error("INVALID_DUTY_TITLE");
  return title;
}

export function dutyListTitle(duty: { title?: string; content?: string }) {
  const title = String(duty.title || "").trim();
  if (title) return title;
  return String(duty.content || "").trim() || "Công tác";
}

export function cleanDutyContent(value: string) {
  const content = String(value || "").trim();
  if (!content || content.length > DUTY_CONTENT_MAX_LENGTH) throw new Error("INVALID_CONTENT");
  return content;
}

export function cleanDutyLocationText(value: string) {
  const locationText = String(value || "").trim();
  if (!locationText) throw new Error("INVALID_LOCATION");
  if (locationText.length > DUTY_LOCATION_MAX_LENGTH) throw new Error("INVALID_LOCATION");
  return locationText;
}

export function dutyLocationLabel(
  duty: { locationText?: string; locationIds?: string[] },
  locationNames: string[] = [],
) {
  const text = String(duty.locationText || "").trim();
  if (text) return text;
  return locationNames.filter(Boolean).join(", ");
}

export function cleanWorkTitle(value: string) {
  const title = String(value || "").trim();
  if (!title || title.length > WORK_TITLE_MAX_LENGTH) throw new Error("INVALID_WORK_TITLE");
  return title;
}

export function workListTitle(document: { title?: string; fileName?: string; content?: string }) {
  const title = String(document.title || "").trim();
  if (title) return title;
  const fileName = String(document.fileName || "").trim();
  if (fileName) return fileName;
  return String(document.content || "").trim() || "Công việc";
}

export function isWorkReleased<T extends { active?: boolean; status?: string }>(
  document: T | null | undefined,
): document is T & { active: true } {
  return Boolean(document?.active) && document?.status !== "rejected";
}

export function userIsActive(user: { status?: string } | null | undefined) {
  return user?.status === "active";
}

/** Whole document archives when the creator is no longer active. */
export function isDocumentArchived(
  document: { createdBy?: string },
  usersById: Map<string, { status?: string }>,
) {
  const creator = usersById.get(String(document.createdBy || ""));
  return !userIsActive(creator);
}

/**
 * Individual work archives when every named assignee is inactive.
 * Department assignments follow the creator only.
 */
export function isWorkItemArchived(
  document: { createdBy?: string },
  item: { assignmentType?: string; assigneeUserIds?: string[] },
  usersById: Map<string, { status?: string }>,
) {
  if (isDocumentArchived(document, usersById)) return true;
  if (item.assignmentType !== "individual") return false;
  const ids = (item.assigneeUserIds || []).map(String).filter(Boolean);
  if (!ids.length) return false;
  return ids.every((id) => !userIsActive(usersById.get(id)));
}

export function hasBlockingSubmission(
  completions: Array<{ status?: string }> | null | undefined,
) {
  return (completions || []).some(
    (row) => row.status === "pending_approval" || row.status === "approved",
  );
}

export function canCreatorMutateWork(items: Array<{ completions?: Array<{ status?: string }> }>) {
  return !items.some((item) => hasBlockingSubmission(item.completions));
}

/**
 * Who may see a live (non-archived) work document.
 * Assignees always see their own assignment. Mode `creator` limits the
 * management/overview list to the creator; mode `school` also includes
 * admin/mod and level 4/5.
 */
export function canSeeLiveWork(args: {
  actorUserId: string;
  actorRole: string;
  actorLevel: number;
  createdBy: string;
  isAssignee: boolean;
  visibilityMode: WorkVisibilityMode;
}) {
  if (String(args.actorUserId) === String(args.createdBy)) return true;
  if (args.isAssignee) return true;
  if (args.visibilityMode === WORK_VISIBILITY_CREATOR) return false;
  if (isOperationalManagerRole(args.actorRole)) return true;
  return args.actorLevel === 4 || args.actorLevel === 5;
}

export function canSeeArchivedWork(actorRole: string) {
  return isOperationalManagerRole(actorRole);
}

export function canReviewWorkCompletion(args: {
  actorUserId: string;
  createdBy: string;
}) {
  return String(args.actorUserId) === String(args.createdBy);
}
