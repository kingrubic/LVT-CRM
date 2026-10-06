import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { vietnamTodayYmd } from './homeroomTime';
import { addDays, endOfMonth, formatDate, formatDateLong, isYmd, monthLabel, startOfMonth, weekdayIndex } from './homeroomLabels';
import { EmptyState, Feedback, Icon, Loading, Modal, Notice, useAsyncTask } from './homeroomUi';

const KIND_LABELS = { holiday: 'Ngày nghỉ', extra_teaching: 'Học bù', working: 'Ngày học' };
const WEEK_HEADERS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function isWeekend(ymd) {
  const day = weekdayIndex(ymd);
  return day === 0 || day === 6;
}

function addMonths(ymd, delta) {
  const [y, m] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 10);
}

export default function HomeroomCalendar({ yearId, years }) {
  const data = useQuery(anyApi.schoolYears.listCalendarDays, { schoolYearId: yearId });
  const today = vietnamTodayYmd();
  const [month, setMonth] = useState(() => startOfMonth(today));
  const [modal, setModal] = useState(null);

  const year = data?.schoolYear;
  const exceptions = useMemo(() => new Map((data?.days || []).map((row) => [row.date, row])), [data]);
  const locked = Boolean(years?.find((row) => row._id === yearId)?.lockedAt);

  const firstMonth = year ? startOfMonth(year.startDate) : '';
  const lastMonth = year ? startOfMonth(year.endDate) : '';
  const shownMonth = year && (month < firstMonth || month > lastMonth) ? (today >= year.startDate && today <= year.endDate ? startOfMonth(today) : firstMonth) : month;

  const cells = useMemo(() => {
    if (!shownMonth) return [];
    const start = shownMonth;
    const end = endOfMonth(shownMonth);
    const lead = (weekdayIndex(start) + 6) % 7;
    const list = [];
    for (let i = 0; i < lead; i += 1) list.push(null);
    for (let day = start; day <= end; day = addDays(day, 1)) list.push(day);
    while (list.length % 7) list.push(null);
    return list;
  }, [shownMonth]);

  const monthStats = useMemo(() => {
    if (!year) return { school: 0, off: 0 };
    let school = 0;
    let off = 0;
    for (const day of cells) {
      if (!day || day < year.startDate || day > year.endDate) continue;
      const exception = exceptions.get(day);
      const isSchool = exception ? exception.kind !== 'holiday' : !isWeekend(day);
      if (isSchool) school += 1;
      else if (!isWeekend(day)) off += 1;
    }
    return { school, off };
  }, [cells, exceptions, year]);

  if (data === undefined) return <Loading label="Đang tải lịch học…" />;

  return (
    <div className="hr-stack">
      <section className="hr-panel">
        <header className="hr-panel-head">
          <div>
            <h2>Lịch học năm {year.name}</h2>
            <p className="hr-muted">
              Mặc định <strong>Thứ 2 – Thứ 6</strong> là ngày học. Đánh dấu ngày nghỉ (lễ, Tết…) và ngày học bù (ví dụ Thứ 7). Lịch quyết định khi nào hệ thống nhắc thiếu file điểm danh.
            </p>
          </div>
          {!locked ? (
            <button type="button" className="primary-button" onClick={() => setModal({ kind: 'range' })}>
              <Icon name="calendar" size={15} /> Thêm đợt nghỉ
            </button>
          ) : null}
        </header>
        {locked ? <Notice tone="warn" icon="alert" title="Năm học đã khóa — chỉ xem lịch." /> : null}
        <div className="hr-calendar-layout">
          <div className="hr-calendar">
            <div className="hr-calendar-nav">
              <button type="button" className="hr-icon-button" onClick={() => setMonth(addMonths(shownMonth, -1))} disabled={shownMonth <= firstMonth} aria-label="Tháng trước">
                <Icon name="chevronLeft" size={18} />
              </button>
              <strong>{monthLabel(shownMonth)}</strong>
              <button type="button" className="hr-icon-button" onClick={() => setMonth(addMonths(shownMonth, 1))} disabled={shownMonth >= lastMonth} aria-label="Tháng sau">
                <Icon name="chevronRight" size={18} />
              </button>
            </div>
            <div className="hr-calendar-grid" role="grid" aria-label={monthLabel(shownMonth)}>
              {WEEK_HEADERS.map((label) => (
                <span key={label} className="hr-calendar-head" role="columnheader">{label}</span>
              ))}
              {cells.map((day, index) => {
                if (!day) return <span key={`blank-${index}`} className="hr-calendar-cell is-blank" />;
                const outside = day < year.startDate || day > year.endDate;
                const exception = exceptions.get(day);
                const weekend = isWeekend(day);
                const kind = exception?.kind || (weekend ? 'weekend' : 'school');
                return (
                  <button
                    key={day}
                    type="button"
                    role="gridcell"
                    className={`hr-calendar-cell is-${outside ? 'outside' : kind}${day === today ? ' is-today' : ''}`}
                    disabled={outside || locked}
                    onClick={() => setModal({ kind: 'day', date: day })}
                    title={exception?.note || undefined}
                    aria-label={`${formatDateLong(day)}: ${outside ? 'ngoài năm học' : exception ? KIND_LABELS[exception.kind] : weekend ? 'cuối tuần' : 'ngày học'}`}
                  >
                    <span className="hr-calendar-num">{Number(day.slice(8))}</span>
                    {exception && !outside ? <span className="hr-calendar-tag">{KIND_LABELS[exception.kind]}</span> : null}
                  </button>
                );
              })}
            </div>
            <div className="hr-calendar-legend">
              <span><i className="is-school" /> Ngày học</span>
              <span><i className="is-weekend" /> Cuối tuần</span>
              <span><i className="is-holiday" /> Ngày nghỉ</span>
              <span><i className="is-extra_teaching" /> Học bù</span>
              <span className="hr-muted">Tháng này: {monthStats.school} ngày học{monthStats.off ? `, nghỉ ${monthStats.off} ngày thường` : ''}</span>
            </div>
          </div>
          <aside className="hr-calendar-side">
            <h3>Ngày đặc biệt ({data.days.length})</h3>
            {!data.days.length ? (
              <EmptyState icon="calendar" title="Chưa có ngày nghỉ hoặc học bù.">Bấm vào một ngày trên lịch để đánh dấu.</EmptyState>
            ) : (
              <ul className="hr-exception-list">
                {data.days.map((row) => (
                  <li key={row._id} className={`is-${row.kind}`}>
                    <button type="button" className="hr-link" onClick={() => { setMonth(startOfMonth(row.date)); if (!locked) setModal({ kind: 'day', date: row.date }); }}>
                      {formatDate(row.date)}
                    </button>
                    <span className="hr-sub">{KIND_LABELS[row.kind]}{row.note ? ` · ${row.note}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </section>

      <SchoolYearSettings key={yearId} year={years.find((row) => row._id === yearId)} locked={locked} />

      {modal?.kind === 'day' ? (
        <DayModal yearId={yearId} date={modal.date} exception={exceptions.get(modal.date)} onClose={() => setModal(null)} />
      ) : null}
      {modal?.kind === 'range' ? <RangeModal yearId={yearId} year={year} onClose={() => setModal(null)} /> : null}
    </div>
  );
}

function DayModal({ yearId, date, exception = undefined, onClose }) {
  const upsert = useMutation(anyApi.schoolYears.upsertCalendarDay);
  const remove = useMutation(anyApi.schoolYears.removeCalendarDay);
  const weekend = isWeekend(date);
  const targetKind = weekend ? 'extra_teaching' : 'holiday';
  const [note, setNote] = useState(exception?.note || '');
  const task = useAsyncTask();
  const defaultLabel = weekend ? 'Cuối tuần (nghỉ)' : 'Ngày học bình thường';

  return (
    <Modal
      title={formatDateLong(date)}
      subtitle={exception ? `Hiện là: ${KIND_LABELS[exception.kind]}` : `Mặc định: ${defaultLabel}`}
      onClose={onClose}
      busy={task.pending}
      size="sm"
      footer={
        <>
          {exception ? (
            <button
              type="button"
              className="hr-button hr-button--ghost hr-push-left"
              disabled={task.pending}
              onClick={async () => {
                const outcome = await task.run(() => remove({ schoolYearId: yearId, date }));
                if (outcome.ok) onClose();
              }}
            >
              Về mặc định
            </button>
          ) : null}
          <button type="button" className="hr-button hr-button--ghost" onClick={onClose} disabled={task.pending}>Hủy</button>
          <button type="submit" form="hr-day-form" className="primary-button" disabled={task.pending}>
            {task.pending ? 'Đang lưu…' : exception ? 'Lưu ghi chú' : weekend ? 'Đánh dấu học bù' : 'Đánh dấu ngày nghỉ'}
          </button>
        </>
      }
    >
      <form
        id="hr-day-form"
        className="hr-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const outcome = await task.run(() =>
            upsert({ schoolYearId: yearId, date, kind: exception?.kind || targetKind, note: note.trim() || undefined }),
          );
          if (outcome.ok) onClose();
        }}
      >
        <label className="hr-field">
          <span>Ghi chú</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={120}
            placeholder={weekend ? 'Ví dụ: Học bù cho ngày 2/9' : 'Ví dụ: Nghỉ lễ Quốc khánh'}
          />
        </label>
        <p className="hr-hint">
          {weekend
            ? 'Ngày học bù: hệ thống sẽ nhắc nếu chưa có file điểm danh.'
            : 'Ngày nghỉ: hệ thống không nhắc thiếu file điểm danh.'}
        </p>
        <Feedback error={task.error} />
      </form>
    </Modal>
  );
}

function RangeModal({ yearId, year, onClose }) {
  const upsert = useMutation(anyApi.schoolYears.upsertCalendarDay);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState('');
  const task = useAsyncTask();
  const valid = isYmd(from) && isYmd(to) && from <= to;
  const days = [];
  if (valid) {
    for (let day = from; day <= to && days.length < 60; day = addDays(day, 1)) {
      if (!isWeekend(day) && day >= year.startDate && day <= year.endDate) days.push(day);
    }
  }

  return (
    <Modal
      title="Thêm đợt nghỉ"
      subtitle="Đánh dấu nghỉ cho các ngày Thứ 2 – Thứ 6 trong khoảng (tối đa 60 ngày)."
      onClose={onClose}
      busy={task.pending}
      footer={
        <>
          <button type="button" className="hr-button hr-button--ghost" onClick={onClose} disabled={task.pending}>Hủy</button>
          <button type="submit" form="hr-range-form" className="primary-button" disabled={task.pending || !days.length}>
            {task.pending ? progress || 'Đang lưu…' : `Đánh dấu ${days.length} ngày nghỉ`}
          </button>
        </>
      }
    >
      <form
        id="hr-range-form"
        className="hr-form hr-form-grid"
        onSubmit={async (event) => {
          event.preventDefault();
          const outcome = await task.run(async () => {
            for (let i = 0; i < days.length; i += 1) {
              setProgress(`Đang lưu ${i + 1}/${days.length}…`);
              await upsert({ schoolYearId: yearId, date: days[i], kind: 'holiday', note: note.trim() || undefined });
            }
          });
          if (outcome.ok) onClose();
        }}
      >
        <label className="hr-field">
          <span>Từ ngày</span>
          <input type="date" value={from} min={year.startDate} max={year.endDate} onChange={(e) => setFrom(e.target.value)} required />
        </label>
        <label className="hr-field">
          <span>Đến ngày</span>
          <input type="date" value={to} min={from || year.startDate} max={year.endDate} onChange={(e) => setTo(e.target.value)} required />
        </label>
        <label className="hr-field hr-form-span">
          <span>Ghi chú</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Ví dụ: Nghỉ Tết Nguyên đán" />
        </label>
        <div className="hr-form-span"><Feedback error={task.error} /></div>
      </form>
    </Modal>
  );
}

function SchoolYearSettings({ year = undefined, locked }) {
  const update = useMutation(anyApi.schoolYears.update);
  const create = useMutation(anyApi.schoolYears.create);
  const [form, setForm] = useState(() => ({
    name: year?.name || '',
    startDate: year?.startDate || '',
    endDate: year?.endDate || '',
    attendanceUploadDueTime: year?.attendanceUploadDueTime || '08:30',
  }));
  const [creating, setCreating] = useState(false);
  const task = useAsyncTask();
  if (!year) return null;
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <section className="hr-panel">
      <header className="hr-panel-head">
        <div>
          <h3>Thiết lập năm học</h3>
          <p className="hr-muted">Giờ nhắc: sau giờ này nếu lớp chưa có dữ liệu điểm danh, tổng quan sẽ báo đỏ.</p>
        </div>
        <button type="button" className="hr-button" onClick={() => setCreating(true)}>
          <Icon name="plus" size={15} /> Tạo năm học mới
        </button>
      </header>
      <form
        className="hr-form"
        onSubmit={async (event) => {
          event.preventDefault();
          await task.run(() => update({ id: year._id, ...form }), 'Đã lưu thiết lập năm học.');
        }}
      >
        <div className="hr-form-grid hr-form-grid--4">
          <label className="hr-field">
            <span>Tên năm học</span>
            <input value={form.name} onChange={set('name')} required disabled={locked} />
          </label>
          <label className="hr-field">
            <span>Bắt đầu</span>
            <input type="date" value={form.startDate} onChange={set('startDate')} required disabled={locked} />
          </label>
          <label className="hr-field">
            <span>Kết thúc</span>
            <input type="date" value={form.endDate} onChange={set('endDate')} required disabled={locked} />
          </label>
          <label className="hr-field">
            <span>Giờ nhắc thiếu file</span>
            <input type="time" value={form.attendanceUploadDueTime} onChange={set('attendanceUploadDueTime')} disabled={locked} />
          </label>
        </div>
        <Feedback error={task.error} success={task.success} />
        {!locked ? (
          <div className="hr-row">
            <button type="submit" className="primary-button" disabled={task.pending}>{task.pending ? 'Đang lưu…' : 'Lưu thiết lập'}</button>
          </div>
        ) : null}
      </form>
      {creating ? <CreateYearModal create={create} previous={year} onClose={() => setCreating(false)} /> : null}
    </section>
  );
}

function CreateYearModal({ create, previous, onClose }) {
  const startYear = Number(String(previous?.endDate || vietnamTodayYmd()).slice(0, 4));
  const [form, setForm] = useState({
    name: `${startYear}-${startYear + 1}`,
    startDate: `${startYear}-09-05`,
    endDate: `${startYear + 1}-05-31`,
    attendanceUploadDueTime: previous?.attendanceUploadDueTime || '08:30',
    active: false,
  });
  const task = useAsyncTask();
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return (
    <Modal
      title="Tạo năm học mới"
      onClose={onClose}
      busy={task.pending}
      footer={
        <>
          <button type="button" className="hr-button hr-button--ghost" onClick={onClose} disabled={task.pending}>Hủy</button>
          <button type="submit" form="hr-year-form" className="primary-button" disabled={task.pending}>{task.pending ? 'Đang tạo…' : 'Tạo năm học'}</button>
        </>
      }
    >
      <form
        id="hr-year-form"
        className="hr-form hr-form-grid"
        onSubmit={async (event) => {
          event.preventDefault();
          const outcome = await task.run(() => create(form));
          if (outcome.ok) onClose();
        }}
      >
        <label className="hr-field"><span>Tên năm học</span><input value={form.name} onChange={set('name')} required /></label>
        <label className="hr-field"><span>Giờ nhắc thiếu file</span><input type="time" value={form.attendanceUploadDueTime} onChange={set('attendanceUploadDueTime')} /></label>
        <label className="hr-field"><span>Bắt đầu</span><input type="date" value={form.startDate} onChange={set('startDate')} required /></label>
        <label className="hr-field"><span>Kết thúc</span><input type="date" value={form.endDate} onChange={set('endDate')} required /></label>
        <label className="hr-switch hr-form-span">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm((c) => ({ ...c, active: e.target.checked }))} />
          <span>Áp dụng ngay (không được chồng ngày với năm học đang áp dụng)</span>
        </label>
        <div className="hr-form-span"><Feedback error={task.error} /></div>
      </form>
    </Modal>
  );
}
