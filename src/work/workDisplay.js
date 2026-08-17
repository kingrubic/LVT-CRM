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

export function emptyWorkSearch() {
  return {
    query: '',
    department: '',
    person: '',
    dateFrom: '',
    dateTo: '',
  };
}

function normalizeWorkSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesWorkSearch(haystack, needle) {
  if (!needle) return true;
  return normalizeWorkSearchText(haystack).includes(needle);
}

function workDepartmentSearchText(item) {
  const names = [item?.departmentName, item?.document?.departmentName];
  for (const assignment of item?.assignments || []) {
    names.push(assignment?.departmentName);
  }
  return names.filter(Boolean).join(' ');
}

function workPersonSearchText(item) {
  const names = [...(item?.userNames || [])];
  for (const assignment of item?.assignments || []) {
    names.push(...(assignment?.userNames || []));
    for (const member of assignment?.members || []) names.push(member?.name, member?.email);
  }
  for (const member of item?.members || []) names.push(member?.name, member?.email);
  for (const member of item?.pendingMembers || []) names.push(member?.name, member?.email);
  for (const task of item?.tasks || []) {
    for (const person of task?.assignees || []) names.push(person?.name, person?.email);
  }
  return names.filter(Boolean).join(' ');
}

function workQueryTitleText(item) {
  return [item?.title, item?.documentTitle, item?.document?.title, item?.fileName, workListTitle(item)]
    .filter(Boolean)
    .join(' ');
}

function workQueryContentText(item) {
  const parts = [item?.content, item?.documentContent, workContentSummary(item)];
  for (const assignment of item?.assignments || []) parts.push(assignment?.content);
  return parts.filter(Boolean).join(' ');
}

function workOverlapsDateRange(item, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true;
  const deadlines = workDeadlines(item);
  if (!deadlines.length) return false;
  return deadlines.some((deadline) => {
    if (dateFrom && deadline < dateFrom) return false;
    if (dateTo && deadline > dateTo) return false;
    return true;
  });
}

export function filterWorksBySearch(list, search = {}) {
  const items = Array.isArray(list) ? list : [];
  const query = normalizeWorkSearchText(search.query);
  const department = normalizeWorkSearchText(search.department);
  const person = normalizeWorkSearchText(search.person);
  const dateFrom = String(search.dateFrom || '').trim();
  const dateTo = String(search.dateTo || '').trim();
  if (!query && !department && !person && !dateFrom && !dateTo) return items;
  return items.filter((item) => {
    if (query && !includesWorkSearch(workQueryTitleText(item), query) && !includesWorkSearch(workQueryContentText(item), query)) {
      return false;
    }
    if (!includesWorkSearch(workDepartmentSearchText(item), department)) return false;
    if (!includesWorkSearch(workPersonSearchText(item), person)) return false;
    return workOverlapsDateRange(item, dateFrom, dateTo);
  });
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
