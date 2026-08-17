export const WORK_LIST_TAB_UPCOMING = 'upcoming';
export const WORK_LIST_TAB_PAST = 'past';

const COMPLETED_STATUSES = new Set(['completed', 'completed_late']);

export function vietnamToday(now = Date.now()) {
  return new Date(now + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function formatWorkDate(value) {
  if (!value) return '—';
  const [year, month, day] = String(value).split('-');
  if (!year || !month || !day) return '—';
  return `${day}/${month}/${year}`;
}

export function emptyWorkAssignment(type) {
  return {
    type: type === 'individual' ? 'individual' : 'department',
    departmentId: '',
    userIds: [],
    content: '',
    deadline: '',
  };
}

export function assignmentsFromDocument(document) {
  return (document?.assignments || []).flatMap((assignment) => {
    if (assignment.type === 'individual') {
      const ids = assignment.userIds?.length ? assignment.userIds : [''];
      return ids.map((userId) => ({
        type: 'individual',
        departmentId: assignment.departmentId || '',
        userIds: userId ? [String(userId)] : [],
        content: assignment.content || '',
        deadline: assignment.deadline || '',
      }));
    }
    return [{
      type: 'department',
      departmentId: String(assignment.departmentId || ''),
      userIds: [],
      content: assignment.content || '',
      deadline: assignment.deadline || '',
    }];
  });
}

export function workAssignmentPayload(assignments) {
  return (assignments || []).map((item) => (
    item.type === 'individual'
      ? { type: 'individual', userIds: item.userIds, content: item.content, deadline: item.deadline }
      : { type: 'department', departmentId: item.departmentId, content: item.content, deadline: item.deadline }
  ));
}

export function workDeadlines(item) {
  if (Array.isArray(item?.assignments) && item.assignments.length) {
    return item.assignments.map((row) => row.deadline).filter(Boolean);
  }
  return item?.deadline ? [item.deadline] : [];
}

export function isWorkCompleted(item) {
  return COMPLETED_STATUSES.has(item?.workStatus || item?.status);
}

export function isWorkPast(item, today = vietnamToday()) {
  if (isWorkCompleted(item)) return true;
  const deadlines = workDeadlines(item);
  if (!deadlines.length) return false;
  return deadlines.every((deadline) => deadline < today);
}

export function workDeadlineKey(item) {
  const deadlines = workDeadlines(item);
  if (!deadlines.length) return '';
  return [...deadlines].sort()[0];
}

export function filterWorksByTab(list, tab = WORK_LIST_TAB_UPCOMING, today = vietnamToday()) {
  const items = Array.isArray(list) ? list : [];
  const compare = (a, b) => workDeadlineKey(a).localeCompare(workDeadlineKey(b));
  if (tab === WORK_LIST_TAB_PAST) {
    return items.filter((item) => isWorkPast(item, today)).sort(compare);
  }
  return items.filter((item) => !isWorkPast(item, today)).sort(compare);
}

export function assignmentRecipientLabel(assignment, catalogs = {}) {
  if (assignment?.type === 'individual') {
    const id = String(assignment.userIds?.[0] || '');
    const user = (catalogs.users || []).find((row) => String(row._id) === id);
    return user?.name || assignment.userNames?.[0] || 'Chưa chọn người';
  }
  const department = (catalogs.departments || []).find(
    (row) => String(row._id) === String(assignment?.departmentId || ''),
  );
  return department?.name || assignment?.departmentName || 'Chưa chọn phòng ban';
}

/** @param {{ title?: string, fileName?: string, assignments?: object[] }} [form] */
export function buildWorkCreatePreview(form = {}, catalogs = {}) {
  const title = form.title;
  const fileName = form.fileName;
  const assignments = form.assignments;
  return {
    title: String(title || '').trim() || 'Công việc',
    fileName: String(fileName || '').trim() || 'Không có tệp',
    rows: (assignments || []).map((assignment) => ({
      recipient: assignmentRecipientLabel(assignment, catalogs),
      content: String(assignment.content || '').trim() || '—',
      deadline: formatWorkDate(assignment.deadline),
    })),
  };
}

export function workListTitle(item) {
  return String(item?.title || item?.content || item?.fileName || '').trim() || 'Công việc';
}

export function workRecipientSummary(item) {
  if (item?.assignments?.length) {
    return item.assignments
      .map((assignment) => (
        assignment.type === 'individual'
          ? (assignment.userNames?.join(', ') || 'Cá nhân')
          : (assignment.departmentName || 'Phòng ban')
      ))
      .filter(Boolean)
      .join(', ') || '—';
  }
  if (item?.type === 'individual') return item.userNames?.join(', ') || 'Cá nhân';
  return item?.departmentName || '—';
}

export function workContentSummary(item) {
  if (item?.assignments?.length) {
    const contents = item.assignments.map((assignment) => assignment.content).filter(Boolean);
    if (contents.length === 1) return contents[0];
    if (contents.length > 1) return `${contents[0]} (+${contents.length - 1})`;
  }
  return item?.content || item?.documentContent || '—';
}
