export const FIRST_CLASS_CTA = 'Tạo lớp đầu tiên';
export const CLASS_CATALOG_TITLE = 'Quản lý lớp';
export const TEACHER_OVERVIEW_TITLE = 'Lớp đang chủ nhiệm';
export const MANAGE_CLASSES_ACTION = 'Quản lý lớp';
export const IMPORT_ATTENDANCE_ACTION = 'Import file điểm danh';
export const DOWNLOAD_ATTENDANCE_TEMPLATE_ACTION = 'Tải file điểm danh mẫu';
export const OPEN_CLASS_ACTION = 'Mở lớp';
export const UPCOMING_ASSIGNMENT_TITLE = 'Sắp hiệu lực';
export const CURRENT_ASSIGNMENT_TITLE = 'Phân công hiện tại';
export const HISTORICAL_ASSIGNMENT_TITLE = 'Lịch sử phân công';
export const ARCHIVED_CLASSES_TITLE = 'Lớp đã lưu trữ';
export const BACK_TO_OVERVIEW = 'Về tổng quan';
export const ASSIGNMENT_REPLACE_WARNING =
  'Gán giáo viên chủ nhiệm mới sẽ đóng phân công cũ vào ngày liền trước ngày hiệu lực.';

function trimmedText(value) {
  return String(value ?? '').trim();
}

export function buildClassCreatePayload({ schoolYearId, code, name, gradeLevel, notes }) {
  const payload = {
    schoolYearId,
    code: trimmedText(code),
    name: trimmedText(name),
    gradeLevel: Number(gradeLevel),
  };
  const nextNotes = trimmedText(notes);
  if (nextNotes) payload.notes = nextNotes;
  return payload;
}

export function buildClassUpdatePayload({ id, code, name, gradeLevel, notes }) {
  const payload = {
    id,
    code: trimmedText(code),
    name: trimmedText(name),
    gradeLevel: Number(gradeLevel),
  };
  const nextNotes = trimmedText(notes);
  if (nextNotes) payload.notes = nextNotes;
  return payload;
}

export function buildClassArchivePayload(id) {
  return { id };
}

export function buildClassAssignmentPayload({ classId, userId, assignmentType = 'homeroom_teacher', effectiveFrom }) {
  if (assignmentType !== 'homeroom_teacher') {
    throw new Error('INVALID_ASSIGNMENT_TYPE');
  }
  return {
    classId,
    userId,
    assignmentType: 'homeroom_teacher',
    scopeKind: 'class',
    effectiveFrom,
  };
}

export function isHomeroomTeacherClassAssignment(row) {
  return row?.assignmentType === 'homeroom_teacher' && row?.scopeKind === 'class' && Boolean(row?.classId);
}

export function filterHomeroomTeacherClassAssignments(assignments) {
  return (assignments || []).filter((row) => isHomeroomTeacherClassAssignment(row));
}

export function assignmentTypeLabel(type) {
  return type === 'supervisor' ? 'Giám thị' : 'Giáo viên chủ nhiệm';
}

export function userRoleLabel(role) {
  if (role === 'admin') return 'Administrator';
  if (role === 'moderator') return 'Moderator';
  return 'Người dùng';
}

export function classStatusLabel(status) {
  return status === 'archived' ? 'Đã lưu trữ' : 'Đang hoạt động';
}

export function assignmentEffect(row, today) {
  if (!row) return 'ended';
  if (row.effectiveFrom && row.effectiveFrom > today) return 'upcoming';
  if (row.effectiveTo && row.effectiveTo < today) return 'ended';
  return 'current';
}

export function isCurrentAssignment(row, today) {
  return assignmentEffect(row, today) === 'current';
}

export function isUpcomingAssignment(row, today) {
  return assignmentEffect(row, today) === 'upcoming';
}

export function isEndedAssignment(row, today) {
  return assignmentEffect(row, today) === 'ended';
}

export function groupAssignmentsByEffect(assignments, today) {
  const current = [];
  const upcoming = [];
  const historical = [];
  for (const row of assignments || []) {
    const effect = assignmentEffect(row, today);
    if (effect === 'current') current.push(row);
    else if (effect === 'upcoming') upcoming.push(row);
    else historical.push(row);
  }
  return { current, upcoming, historical };
}

export function filterActiveClasses(classes) {
  return (classes || []).filter((row) => row.status === 'active');
}

export function assignmentDateRange(row) {
  return row.effectiveTo ? `${row.effectiveFrom} – ${row.effectiveTo}` : `${row.effectiveFrom} – hiện tại`;
}
