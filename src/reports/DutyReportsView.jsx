import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import './dutyCalendar.css';

const VIEW_OPTIONS = [
  ['week', 'Tuần'],
  ['month', 'Tháng'],
  ['quarter', 'Quý'],
  ['year', 'Năm'],
];
const WEEKDAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'];
const MINI_WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function pad(value) {
  return String(value).padStart(2, '0');
}

function toIsoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromIsoDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date, amount) {
  const next = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  return next;
}

function startOfWeek(date) {
  const day = date.getDay();
  return addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), day === 0 ? -6 : 1 - day);
}

function endOfWeek(date) {
  return addDays(startOfWeek(date), 6);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function daysBetween(start, end) {
  const days = [];
  for (let current = new Date(start); current <= end; current = addDays(current, 1)) {
    days.push(current);
  }
  return days;
}

function monthGridDays(date) {
  const start = startOfWeek(startOfMonth(date));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function viewRange(mode, anchor) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  if (mode === 'week') {
    const start = startOfWeek(anchor);
    const end = endOfWeek(anchor);
    const sameMonth = start.getMonth() === end.getMonth();
    return {
      start,
      end,
      title: sameMonth
        ? `${start.getDate()}–${end.getDate()} tháng ${end.getMonth() + 1}, ${end.getFullYear()}`
        : `${start.getDate()}/${start.getMonth() + 1}–${end.getDate()}/${end.getMonth() + 1}, ${end.getFullYear()}`,
    };
  }
  if (mode === 'month') {
    const grid = monthGridDays(anchor);
    return {
      start: grid[0],
      end: grid[grid.length - 1],
      title: `Tháng ${month + 1}, ${year}`,
    };
  }
  if (mode === 'quarter') {
    const firstMonth = Math.floor(month / 3) * 3;
    return {
      start: new Date(year, firstMonth, 1),
      end: new Date(year, firstMonth + 3, 0),
      title: `Quý ${Math.floor(month / 3) + 1} · Tháng ${firstMonth + 1}–${firstMonth + 3}/${year}`,
    };
  }
  return {
    start: new Date(year, 0, 1),
    end: new Date(year, 11, 31),
    title: `Năm ${year}`,
  };
}

function eventsForDay(events, date) {
  const isoDate = toIsoDate(date);
  return events.filter((event) => event.startDate <= isoDate && event.endDate >= isoDate);
}

function statusLabel(status) {
  if (status === 'attended') return 'Đã tham gia';
  if (status === 'absent') return 'Chưa tham gia';
  return 'Chưa xác nhận';
}

function eventTime(event) {
  return event.allDay ? 'Cả ngày' : `${event.startTime}–${event.endTime}`;
}

function CalendarEvent({ event, compact = false, onSelect }) {
  return (
    <button
      type="button"
      className={`report-event ${compact ? 'compact' : ''} status-${event.attendanceStatus}`}
      onClick={() => onSelect(event)}
      title={`${event.content} · ${eventTime(event)}`}
    >
      <span className="report-event-time">{eventTime(event)}</span>
      <strong>{event.content}</strong>
      {!compact && event.locationNames?.length ? (
        <span className="report-event-location">⌖ {event.locationNames.join(', ')}</span>
      ) : null}
    </button>
  );
}

function WeekCalendar({ range, events, onSelect }) {
  const today = toIsoDate(new Date());
  return (
    <div className="report-week-grid">
      {daysBetween(range.start, range.end).map((date) => {
        const dailyEvents = eventsForDay(events, date);
        const isoDate = toIsoDate(date);
        return (
          <section className={`report-week-day ${isoDate === today ? 'is-today' : ''}`} key={isoDate}>
            <header>
              <span>{WEEKDAYS[(date.getDay() + 6) % 7]}</span>
              <strong>{date.getDate()}</strong>
            </header>
            <div className="report-day-events">
              {dailyEvents.length ? (
                dailyEvents.map((event) => (
                  <CalendarEvent key={event._id} event={event} onSelect={onSelect} />
                ))
              ) : (
                <span className="report-day-empty">Trống lịch</span>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function MonthCalendar({ anchor, events, onSelect }) {
  const today = toIsoDate(new Date());
  const days = monthGridDays(anchor);
  return (
    <div className="report-month-calendar">
      <div className="report-month-weekdays">
        {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="report-month-grid">
        {days.map((date) => {
          const dailyEvents = eventsForDay(events, date);
          const isoDate = toIsoDate(date);
          const outside = date.getMonth() !== anchor.getMonth();
          return (
            <section
              className={`report-month-day ${outside ? 'is-outside' : ''} ${isoDate === today ? 'is-today' : ''}`}
              key={isoDate}
            >
              <span className="report-month-number">{date.getDate()}</span>
              <div className="report-month-events">
                {dailyEvents.slice(0, 3).map((event) => (
                  <CalendarEvent compact key={event._id} event={event} onSelect={onSelect} />
                ))}
                {dailyEvents.length > 3 ? <span className="report-more-events">+{dailyEvents.length - 3} lịch khác</span> : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function MiniMonth({ date, events, onSelect }) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = startOfMonth(date);
  const leadingDays = (first.getDay() + 6) % 7;
  const totalDays = endOfMonth(date).getDate();
  const today = toIsoDate(new Date());
  const cells = [
    ...Array.from({ length: leadingDays }, () => null),
    ...Array.from({ length: totalDays }, (_, index) => new Date(year, month, index + 1)),
  ];
  return (
    <article className="report-mini-month">
      <h4>Tháng {month + 1}</h4>
      <div className="report-mini-weekdays">
        {MINI_WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="report-mini-grid">
        {cells.map((cell, index) => {
          if (!cell) return <span className="report-mini-day empty" key={`empty-${index}`} />;
          const dailyEvents = eventsForDay(events, cell);
          const isoDate = toIsoDate(cell);
          return (
            <button
              type="button"
              className={`report-mini-day ${dailyEvents.length ? 'has-events' : ''} ${isoDate === today ? 'is-today' : ''}`}
              key={isoDate}
              disabled={!dailyEvents.length}
              onClick={() => dailyEvents.length && onSelect(dailyEvents[0])}
              title={dailyEvents.map((event) => event.content).join(', ')}
            >
              {cell.getDate()}
              {dailyEvents.length ? <i>{dailyEvents.length}</i> : null}
            </button>
          );
        })}
      </div>
    </article>
  );
}

function PeriodCalendar({ mode, anchor, events, onSelect }) {
  const year = anchor.getFullYear();
  const firstMonth = mode === 'quarter' ? Math.floor(anchor.getMonth() / 3) * 3 : 0;
  const count = mode === 'quarter' ? 3 : 12;
  return (
    <div className={`report-period-grid mode-${mode}`}>
      {Array.from({ length: count }, (_, index) => (
        <MiniMonth
          key={`${year}-${firstMonth + index}`}
          date={new Date(year, firstMonth + index, 1)}
          events={events}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function PersonAvatar({ name }) {
  const initials = String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase('vi');
  return <span className="report-person-avatar">{initials || '?'}</span>;
}

function EventDetail({ event, personName, onClose }) {
  if (!event) return null;
  return (
    <aside className="report-event-detail">
      <button type="button" className="report-detail-close" onClick={onClose} aria-label="Đóng chi tiết">×</button>
      <span className={`report-detail-status status-${event.attendanceStatus}`}>
        {statusLabel(event.attendanceStatus)}
      </span>
      <h3>{event.content}</h3>
      <dl>
        <div><dt>Nhân sự</dt><dd>{personName}</dd></div>
        <div><dt>Thời gian</dt><dd>{eventTime(event)}</dd></div>
        <div><dt>Ngày</dt><dd>{event.startDate === event.endDate ? event.startDate : `${event.startDate} → ${event.endDate}`}</dd></div>
        <div><dt>Địa điểm</dt><dd>{event.locationNames?.length ? event.locationNames.join(', ') : 'Chưa chỉ định'}</dd></div>
        <div><dt>Hình thức gán</dt><dd>{event.assignmentType === 'individual' ? 'Gán cá nhân' : 'Theo phòng ban'}</dd></div>
      </dl>
    </aside>
  );
}

export default function DutyReportsView() {
  const [mode, setMode] = useState('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [peopleCollapsed, setPeopleCollapsed] = useState(false);
  const range = useMemo(() => viewRange(mode, anchor), [mode, anchor]);
  const queryArgs = {
    startDate: toIsoDate(range.start),
    endDate: toIsoDate(range.end),
    ...(selectedUserId ? { userId: selectedUserId } : {}),
  };
  const data = useQuery(anyApi.reports.dutyCalendar, queryArgs);

  useEffect(() => {
    if (data?.selectedUserId && !selectedUserId) {
      setSelectedUserId(data.selectedUserId);
    }
  }, [data?.selectedUserId, selectedUserId]);

  useEffect(() => {
    setSelectedEvent(null);
  }, [mode, anchor, selectedUserId]);

  const movePeriod = (direction) => {
    if (mode === 'week') setAnchor((current) => addDays(current, direction * 7));
    else if (mode === 'month') setAnchor((current) => addMonths(current, direction));
    else if (mode === 'quarter') setAnchor((current) => addMonths(current, direction * 3));
    else setAnchor((current) => new Date(current.getFullYear() + direction, current.getMonth(), 1));
  };

  const events = data?.events || [];
  const attendedCount = events.filter((event) => event.attendanceStatus === 'attended').length;
  const pendingCount = events.filter((event) => event.attendanceStatus === 'pending').length;
  const peopleGroups = useMemo(() => {
    const groups = new Map();
    for (const person of data?.people || []) {
      const departmentName = person.departmentName || 'Chưa gán phòng ban';
      const people = groups.get(departmentName) || [];
      people.push(person);
      groups.set(departmentName, people);
    }
    return [...groups.entries()]
      .map(([departmentName, people]) => ({ departmentName, people }))
      .sort((a, b) => {
        const aHasSelf = a.people.some((person) => person.isSelf);
        const bHasSelf = b.people.some((person) => person.isSelf);
        return Number(bHasSelf) - Number(aHasSelf) ||
          a.departmentName.localeCompare(b.departmentName, 'vi');
      });
  }, [data?.people]);

  return (
    <section className="duty-reports-view">
      <header className="report-hero">
        <div>
          <span className="report-kicker">Báo cáo · Công tác</span>
          <h2>Lịch công tác trực quan</h2>
          <p>Theo dõi nhịp công tác của cá nhân và cấp dưới trên một dòng thời gian rõ ràng, linh hoạt.</p>
        </div>
        <div className="report-hero-mark" aria-hidden="true">
          <span>{anchor.getDate()}</span>
          <small>THÁNG {anchor.getMonth() + 1}</small>
        </div>
      </header>

      {data === undefined ? (
        <div className="report-loading">
          <span />
          <p>Đang dựng lịch công tác…</p>
        </div>
      ) : (
        <div className={`report-workspace ${peopleCollapsed ? 'people-collapsed' : ''}`}>
          <aside className="report-people-panel">
            <div className="report-panel-heading">
              <span>Nhân sự</span>
              <strong>{data.people.length}</strong>
            </div>
            <p>
              {data.visibilityScope === 'all'
                ? 'Toàn hệ thống · nhân sự được nhóm theo phòng ban.'
                : 'Chọn một người để xem lịch công tác.'}
            </p>
            <div className="report-people-list">
              {peopleGroups.map((group) => (
                <section className="report-people-group" key={group.departmentName}>
                  <header>
                    <span>{group.departmentName}</span>
                    <small>{group.people.length}</small>
                  </header>
                  <div className="report-people-group-list">
                    {group.people.map((person) => (
                      <button
                        type="button"
                        className={`report-person ${String(person._id) === String(data.selectedUserId) ? 'active' : ''}`}
                        key={person._id}
                        onClick={() => setSelectedUserId(person._id)}
                      >
                        <PersonAvatar name={person.name} />
                        <span>
                          <strong>{person.name}</strong>
                          <small>
                            {person.isSelf ? 'Lịch của tôi' : person.positionName || 'Chưa gán chức vụ'}
                          </small>
                        </span>
                        <i aria-hidden="true">›</i>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </aside>

          <main className="report-calendar-panel">
            <div className="report-calendar-toolbar">
              <button
                type="button"
                className="report-panel-toggle"
                onClick={() => setPeopleCollapsed((collapsed) => !collapsed)}
                aria-label={peopleCollapsed ? 'Hiện cột nhân sự' : 'Ẩn cột nhân sự'}
                aria-expanded={!peopleCollapsed}
                title={peopleCollapsed ? 'Hiện cột nhân sự' : 'Ẩn cột nhân sự'}
              >
                <span aria-hidden="true">{peopleCollapsed ? '›' : '‹'}</span>
                <small>{peopleCollapsed ? 'Nhân sự' : 'Ẩn nhân sự'}</small>
              </button>
              <div className="report-calendar-title">
                <span>Lịch của {data.selectedUserName}</span>
                <h3>{range.title}</h3>
              </div>
              <div className="report-toolbar-actions">
                <div className="report-period-nav">
                  <button type="button" onClick={() => movePeriod(-1)} aria-label="Kỳ trước">‹</button>
                  <button type="button" className="today-button" onClick={() => setAnchor(new Date())}>Hôm nay</button>
                  <button type="button" onClick={() => movePeriod(1)} aria-label="Kỳ sau">›</button>
                </div>
                <div className="report-mode-switch">
                  {VIEW_OPTIONS.map(([id, label]) => (
                    <button type="button" className={mode === id ? 'active' : ''} key={id} onClick={() => setMode(id)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="report-summary-row">
              <div><strong>{events.length}</strong><span>Công tác trong kỳ</span></div>
              <div className="attended"><strong>{attendedCount}</strong><span>Đã tham gia</span></div>
              <div className="pending"><strong>{pendingCount}</strong><span>Chưa xác nhận</span></div>
              <span className="report-summary-note">Dữ liệu cập nhật theo lịch được phân công</span>
            </div>

            <div className="report-calendar-stage">
              {mode === 'week' ? (
                <WeekCalendar range={range} events={events} onSelect={setSelectedEvent} />
              ) : mode === 'month' ? (
                <MonthCalendar anchor={anchor} events={events} onSelect={setSelectedEvent} />
              ) : (
                <PeriodCalendar mode={mode} anchor={anchor} events={events} onSelect={setSelectedEvent} />
              )}
              {!events.length ? (
                <div className="report-empty-overlay">
                  <span>✦</span>
                  <strong>Kỳ này đang trống lịch</strong>
                  <small>Hãy chuyển sang kỳ khác hoặc chọn nhân sự khác.</small>
                </div>
              ) : null}
            </div>
          </main>

          <EventDetail
            event={selectedEvent}
            personName={data.selectedUserName}
            onClose={() => setSelectedEvent(null)}
          />
        </div>
      )}
    </section>
  );
}
