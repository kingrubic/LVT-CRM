export function formatViDate(isoDate) {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y}`;
}

export function toDateTimeLocalValue(date, time) {
  if (!date) return '';
  return `${date}T${time || '08:00'}`;
}

export function fromDateTimeLocalValue(value) {
  const [date = '', clock = ''] = String(value || '').split('T');
  return { date, time: clock.slice(0, 5) };
}

export function formatDutyDateTimeLine(date, time, { allDay = false } = {}) {
  const dateText = formatViDate(date);
  if (dateText === '—') return '—';
  if (allDay) return dateText;
  return `${dateText} - ${time || '—'}`;
}

export function dutyDisplayTitle(duty) {
  return String(duty?.title || '').trim() || String(duty?.content || '').trim() || 'Công tác';
}

export function emptyDutyForm() {
  return {
    title: '',
    startDate: '',
    endDate: '',
    startTime: '08:00',
    endTime: '17:00',
    allDay: false,
    content: '',
    locationText: '',
    departmentIds: [],
    participantUserIds: [],
  };
}

export function dutyFormFromItem(item) {
  return {
    title: item.title || item.content || '',
    startDate: item.startDate,
    endDate: item.endDate,
    startTime: item.startTime,
    endTime: item.endTime,
    allDay: Boolean(item.allDay),
    content: item.content || '',
    locationText: item.locationText || (item.locationNames || []).join(', '),
    departmentIds: [...(item.departmentIds || [])],
    participantUserIds: [...(item.participantUserIds || [])],
  };
}

export function dutyPayloadFromForm(form, { includeDepartments = true } = {}) {
  return {
    title: form.title,
    startDate: form.startDate,
    endDate: form.allDay ? form.startDate : form.endDate,
    startTime: form.startTime,
    endTime: form.endTime,
    allDay: form.allDay,
    content: form.content,
    locationText: form.locationText,
    departmentIds: includeDepartments ? form.departmentIds : [],
    participantUserIds: form.participantUserIds,
  };
}

export function applyDutyFormField(prev, field, value) {
  const next = { ...prev, [field]: value };
  if (field === 'allDay' && value) {
    next.endDate = prev.startDate || prev.endDate;
  }
  if (field === 'startDate' && (prev.allDay || next.allDay)) {
    next.endDate = value;
  }
  return next;
}

export function applyDutyStartDateTime(prev, date, time) {
  return {
    ...prev,
    startDate: date,
    startTime: time || prev.startTime,
    endDate: prev.allDay ? date : prev.endDate,
  };
}

export function applyDutyEndDateTime(prev, date, time) {
  return {
    ...prev,
    endDate: date,
    endTime: time || prev.endTime,
  };
}
