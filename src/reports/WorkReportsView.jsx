import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import './dutyCalendar.css';

const VIEW_OPTIONS = [['week', 'Tuần'], ['month', 'Tháng'], ['quarter', 'Quý'], ['year', 'Năm']];
const WEEKDAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'];
const MINI_WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function pad(value) { return String(value).padStart(2, '0'); }
function toIsoDate(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function addDays(date, amount) { const next = new Date(date); next.setDate(next.getDate() + amount); return next; }
function addMonths(date, amount) { return new Date(date.getFullYear(), date.getMonth() + amount, 1); }
function startOfWeek(date) { return addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), date.getDay() === 0 ? -6 : 1 - date.getDay()); }
function endOfWeek(date) { return addDays(startOfWeek(date), 6); }
function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function endOfMonth(date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0); }
function daysBetween(start, end) {
  const days = [];
  for (let current = new Date(start); current <= end; current = addDays(current, 1)) days.push(current);
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
    return {
      start,
      end,
      title: start.getMonth() === end.getMonth()
        ? `${start.getDate()}–${end.getDate()} tháng ${end.getMonth() + 1}, ${end.getFullYear()}`
        : `${start.getDate()}/${start.getMonth() + 1}–${end.getDate()}/${end.getMonth() + 1}, ${end.getFullYear()}`,
    };
  }
  if (mode === 'month') {
    const grid = monthGridDays(anchor);
    return { start: grid[0], end: grid[grid.length - 1], title: `Tháng ${month + 1}, ${year}` };
  }
  if (mode === 'quarter') {
    const firstMonth = Math.floor(month / 3) * 3;
    return {
      start: new Date(year, firstMonth, 1),
      end: new Date(year, firstMonth + 3, 0),
      title: `Quý ${Math.floor(month / 3) + 1} · Tháng ${firstMonth + 1}–${firstMonth + 3}/${year}`,
    };
  }
  return { start: new Date(year, 0, 1), end: new Date(year, 11, 31), title: `Năm ${year}` };
}
function eventsForDay(events, date) {
  const isoDate = toIsoDate(date);
  return events.filter((event) => event.startDate <= isoDate && event.endDate >= isoDate);
}
function statusLabel(status) {
  return ({
    approved: 'Đã duyệt', pending: 'Chờ duyệt', unassigned: 'Chưa chỉ định',
    completed: 'Đã hoàn thành', overdue: 'Quá hạn chưa hoàn thành',
  })[status] || 'Đang thực hiện';
}
function statusSummary(status, scope) {
  const labels = {
    approved: 'Công văn đã duyệt', pending: scope === 'all' ? 'Công văn chờ duyệt' : 'Chưa hoàn thành',
    unassigned: 'Chưa chỉ định cá nhân', completed: 'Đã hoàn thành', overdue: 'Quá hạn chưa hoàn thành',
  };
  return labels[status] || statusLabel(status);
}
function eventTime(event) { return `Hạn ${event.deadline}`; }

function CalendarEvent({ event, compact = false, onSelect }) {
  return (
    <button type="button" className={`report-event ${compact ? 'compact' : ''} status-${event.status}`} onClick={() => onSelect(event)} title={`${event.content} · ${eventTime(event)}`}>
      <span className="report-event-time">{event.kindLabel}</span>
      <strong>{event.content}</strong>
      {!compact ? <span className="report-event-location">⌖ {event.departmentName}</span> : null}
    </button>
  );
}

function WeekCalendar({ range, events, onSelect }) {
  const today = toIsoDate(new Date());
  return <div className="report-week-grid">{daysBetween(range.start, range.end).map((date) => {
    const dailyEvents = eventsForDay(events, date);
    const isoDate = toIsoDate(date);
    return <section className={`report-week-day ${isoDate === today ? 'is-today' : ''}`} key={isoDate}>
      <header><span>{WEEKDAYS[(date.getDay() + 6) % 7]}</span><strong>{date.getDate()}</strong></header>
      <div className="report-day-events">{dailyEvents.length
        ? dailyEvents.map((event) => <CalendarEvent key={event._id} event={event} onSelect={onSelect} />)
        : <span className="report-day-empty">Trống lịch</span>}
      </div>
    </section>;
  })}</div>;
}

function MonthCalendar({ anchor, events, onSelect }) {
  const today = toIsoDate(new Date());
  return <div className="report-month-calendar">
    <div className="report-month-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
    <div className="report-month-grid">{monthGridDays(anchor).map((date) => {
      const dailyEvents = eventsForDay(events, date);
      const isoDate = toIsoDate(date);
      return <section className={`report-month-day ${date.getMonth() !== anchor.getMonth() ? 'is-outside' : ''} ${isoDate === today ? 'is-today' : ''}`} key={isoDate}>
        <span className="report-month-number">{date.getDate()}</span>
        <div className="report-month-events">
          {dailyEvents.slice(0, 3).map((event) => <CalendarEvent compact key={event._id} event={event} onSelect={onSelect} />)}
          {dailyEvents.length > 3 ? <span className="report-more-events">+{dailyEvents.length - 3} việc khác</span> : null}
        </div>
      </section>;
    })}</div>
  </div>;
}

function MiniMonth({ date, events, onSelect }) {
  const first = startOfMonth(date);
  const leadingDays = (first.getDay() + 6) % 7;
  const today = toIsoDate(new Date());
  const cells = [...Array.from({ length: leadingDays }, () => null), ...Array.from({ length: endOfMonth(date).getDate() }, (_, index) => new Date(date.getFullYear(), date.getMonth(), index + 1))];
  return <article className="report-mini-month">
    <h4>Tháng {date.getMonth() + 1}</h4>
    <div className="report-mini-weekdays">{MINI_WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
    <div className="report-mini-grid">{cells.map((cell, index) => {
      if (!cell) return <span className="report-mini-day empty" key={`empty-${index}`} />;
      const dailyEvents = eventsForDay(events, cell);
      const isoDate = toIsoDate(cell);
      return <button type="button" className={`report-mini-day ${dailyEvents.length ? 'has-events' : ''} ${isoDate === today ? 'is-today' : ''}`} key={isoDate} disabled={!dailyEvents.length} onClick={() => dailyEvents.length && onSelect(dailyEvents[0])} title={dailyEvents.map((event) => event.content).join(', ')}>
        {cell.getDate()}{dailyEvents.length ? <i>{dailyEvents.length}</i> : null}
      </button>;
    })}</div>
  </article>;
}

function PeriodCalendar({ mode, anchor, events, onSelect }) {
  const firstMonth = mode === 'quarter' ? Math.floor(anchor.getMonth() / 3) * 3 : 0;
  const count = mode === 'quarter' ? 3 : 12;
  return <div className={`report-period-grid mode-${mode}`}>{Array.from({ length: count }, (_, index) => <MiniMonth key={`${anchor.getFullYear()}-${firstMonth + index}`} date={new Date(anchor.getFullYear(), firstMonth + index, 1)} events={events} onSelect={onSelect} />)}</div>;
}

function EventDetail({ event, onClose }) {
  if (!event) return null;
  return <aside className="report-event-detail">
    <button type="button" className="report-detail-close" onClick={onClose} aria-label="Đóng chi tiết">×</button>
    <span className={`report-detail-status status-${event.status}`}>{statusLabel(event.status)}</span>
    <h3>{event.content}</h3>
    <dl>
      <div><dt>Loại công việc</dt><dd>{event.kindLabel}</dd></div>
      <div><dt>Hạn hoàn thành</dt><dd>{event.deadline}</dd></div>
      <div><dt>Phòng ban</dt><dd>{event.departmentName}</dd></div>
      <div><dt>Công văn</dt><dd>{event.documentName}</dd></div>
    </dl>
  </aside>;
}

export default function WorkReportsView() {
  const [mode, setMode] = useState('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState(null);
  const range = useMemo(() => viewRange(mode, anchor), [mode, anchor]);
  const data = useQuery(anyApi.reports.workCalendar, { startDate: toIsoDate(range.start), endDate: toIsoDate(range.end) });
  const events = data?.events || [];

  useEffect(() => { setSelectedEvent(null); }, [mode, anchor]);

  const movePeriod = (direction) => {
    if (mode === 'week') setAnchor((current) => addDays(current, direction * 7));
    else if (mode === 'month') setAnchor((current) => addMonths(current, direction));
    else if (mode === 'quarter') setAnchor((current) => addMonths(current, direction * 3));
    else setAnchor((current) => new Date(current.getFullYear() + direction, current.getMonth(), 1));
  };
  const statuses = data?.visibilityScope === 'all'
    ? ['approved', 'pending']
    : data?.visibilityScope === 'department'
      ? ['unassigned', 'pending', 'completed', 'overdue']
      : ['pending', 'completed', 'overdue'];

  return <section className="duty-reports-view work-reports-view">
    <header className="report-hero">
      <div>
        <span className="report-kicker">Báo cáo · Công việc</span>
        <h2>Lịch công việc trực quan</h2>
        <p>Theo dõi công văn, việc phòng ban và đầu mục cá nhân trên cùng một lịch linh hoạt.</p>
      </div>
      <div className="report-hero-mark" aria-hidden="true"><span>{anchor.getDate()}</span><small>THÁNG {anchor.getMonth() + 1}</small></div>
    </header>
    {data === undefined ? <div className="report-loading"><span /><p>Đang dựng lịch công việc…</p></div> : <div className="report-workspace people-collapsed">
      <main className="report-calendar-panel">
        <div className="report-calendar-toolbar">
          <div className="report-calendar-title"><span>{data.visibilityScope === 'all' ? 'Công văn toàn trường' : data.visibilityScope === 'department' ? 'Công việc phòng ban' : 'Công việc của tôi'}</span><h3>{range.title}</h3></div>
          <div className="report-toolbar-actions">
            <div className="report-period-nav"><button type="button" onClick={() => movePeriod(-1)} aria-label="Kỳ trước">‹</button><button type="button" className="today-button" onClick={() => setAnchor(new Date())}>Hôm nay</button><button type="button" onClick={() => movePeriod(1)} aria-label="Kỳ sau">›</button></div>
            <div className="report-mode-switch">{VIEW_OPTIONS.map(([id, label]) => <button type="button" className={mode === id ? 'active' : ''} key={id} onClick={() => setMode(id)}>{label}</button>)}</div>
          </div>
        </div>
        <div className="report-summary-row work-report-summary">
          <div><strong>{events.length}</strong><span>Mục công việc trong kỳ</span></div>
          {statuses.map((status) => <div className={`status-${status}`} key={status}><strong>{events.filter((event) => event.status === status).length}</strong><span>{statusSummary(status, data.visibilityScope)}</span></div>)}
          <span className="report-summary-note">Dữ liệu cập nhật theo phân công hiện hành</span>
        </div>
        <div className="report-calendar-stage">
          {mode === 'week' ? <WeekCalendar range={range} events={events} onSelect={setSelectedEvent} /> : mode === 'month' ? <MonthCalendar anchor={anchor} events={events} onSelect={setSelectedEvent} /> : <PeriodCalendar mode={mode} anchor={anchor} events={events} onSelect={setSelectedEvent} />}
          {!events.length ? <div className="report-empty-overlay"><span>✦</span><strong>Kỳ này đang trống lịch</strong><small>Hãy chuyển sang kỳ khác để xem công việc.</small></div> : null}
        </div>
      </main>
      <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>}
  </section>;
}
