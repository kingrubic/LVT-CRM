import React, { useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { DutyListHeading } from '../duties/DutyListFilters';
import { messageFor } from '../lib/appErrorMessage';
import '../duties/duties.css';
import '../work/work.css';
import './peopleReview.css';
import {
  DateRangeFilter,
  FaultModal,
  PrivateFileButton,
  addDays,
  formatDate,
  todayIso,
} from './PeopleReviewView';

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function FaultPersonPicker({ people, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const needle = normalizeSearch(query);
    const filtered = needle
      ? people.filter((person) => {
          const haystack = normalizeSearch(`${person.name} ${person.email} ${person.departmentName} ${person.positionName}`);
          return haystack.includes(needle);
        })
      : people;
    const map = new Map();
    for (const person of filtered) {
      const key = person.departmentName || 'Chưa xác định phòng ban';
      const list = map.get(key) || [];
      list.push(person);
      map.set(key, list);
    }
    return [...map.entries()].map(([departmentName, rows]) => ({ departmentName, people: rows }));
  }, [people, query]);

  return (
    <div className="pr-modal-backdrop" role="presentation">
      <div className="pr-modal pr-modal-wide">
        <button type="button" className="pr-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        <span className="pr-kicker">Ghi nhận lỗi</span>
        <h3>Chọn nhân sự</h3>
        <p className="pr-modal-context">Chỉ hiện người bạn được phép ghi nhận lỗi.</p>
        <label className="pr-field-label" htmlFor="staff-fault-person-search">Tìm người</label>
        <input
          id="staff-fault-person-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tên, email, phòng ban…"
        />
        {groups.length ? (
          <div className="pr-picker-list">
            {groups.map((group) => (
              <div className="pr-dept-group" key={group.departmentName}>
                <h4>{group.departmentName}</h4>
                {group.people.map((person) => (
                  <button
                    type="button"
                    className="pr-picker-person"
                    key={person._id}
                    onClick={() => onSelect(person)}
                  >
                    <strong>{person.name}</strong>
                    <small>
                      {person.isOps
                        ? person.positionName
                        : `${person.positionLevel || '—'}★ · ${person.positionName}`}
                    </small>
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="pr-empty">{people.length ? 'Không tìm thấy nhân sự phù hợp.' : 'Không có nhân sự nào bạn được ghi nhận lỗi.'}</div>
        )}
        <div className="pr-modal-actions">
          <button type="button" className="pr-ghost-button" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}

function FaultEmpty({ tone = 'mine', filtered = false }) {
  if (filtered) {
    return <div className="pr-empty">Không tìm thấy ghi nhận lỗi phù hợp.</div>;
  }
  return (
    <div className="pr-empty">
      {tone === 'recorded'
        ? 'Bạn chưa ghi nhận lỗi nào trong khoảng thời gian này.'
        : 'Không có lỗi nào được ghi nhận cho bạn trong khoảng thời gian này.'}
    </div>
  );
}

function FaultCard({ fault, showTarget = false }) {
  return (
    <article className="pr-fault-card">
      <header>
        <strong>{formatDate(fault.violationDate)}</strong>
        {showTarget ? null : <span>Ghi bởi {fault.recordedByName}</span>}
      </header>
      {showTarget ? (
        <div className="pr-fault-person">
          <strong>{fault.targetName}</strong>
          <small>{fault.departmentName}</small>
        </div>
      ) : null}
      <p>{fault.reason}</p>
      <PrivateFileButton kind="fault" fileId={fault._id} fileName={fault.fileName} />
    </article>
  );
}

class StaffFaultsErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="pr-loading" role="alert">
          <strong>Không thể tải ghi nhận lỗi.</strong>
          <p>{messageFor(this.state.error)}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function StaffFaultsPage() {
  const defaultTo = todayIso();
  const defaultFrom = addDays(defaultTo, -29);
  const [range, setRange] = useState({ from: defaultFrom, to: defaultTo });
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState(null);
  const log = useQuery(anyApi.peopleReview.staffFaultLog, {
    faultFrom: range.from,
    faultTo: range.to,
  });
  const targets = useQuery(anyApi.peopleReview.staffFaultTargets, picking || target ? {} : 'skip');

  const faults = useMemo(() => {
    const rows = log?.faults || [];
    const needle = normalizeSearch(search);
    if (!needle) return rows;
    return rows.filter((fault) => {
      const haystack = normalizeSearch(`${fault.targetName} ${fault.recordedByName} ${fault.departmentName}`);
      return haystack.includes(needle);
    });
  }, [log, search]);
  const mine = useMemo(() => faults.filter((fault) => fault.isSelfTarget), [faults]);
  const recorded = useMemo(() => faults.filter((fault) => fault.isRecordedByMe), [faults]);
  const searchActive = Boolean(normalizeSearch(search));
  const showRecordedSection = Boolean(
    log?.canAdd
    || recorded.length
    || (searchActive && (log?.faults || []).some((fault) => fault.isRecordedByMe)),
  );

  if (log === undefined) return <div className="pr-loading">Đang tải ghi nhận lỗi…</div>;

  return (
    <section className="pr-view duty-workspace">
      <div className="pr-fault-toolbar">
        <DateRangeFilter from={range.from} to={range.to} onChange={setRange} label="Lọc ngày vi phạm" />
        <label className="pr-search-field">
          Tìm người
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tên nhân sự hoặc người ghi nhận…"
          />
        </label>
      </div>

      <div className="duty-list-section">
        <DutyListHeading>Lỗi của tôi</DutyListHeading>
        {mine.length ? (
          <div className="pr-fault-list">
            {mine.map((fault) => <FaultCard key={fault._id} fault={fault} />)}
          </div>
        ) : (
          <FaultEmpty filtered={searchActive && (log.faults || []).some((fault) => fault.isSelfTarget)} />
        )}
      </div>

      {showRecordedSection ? (
      <div className="duty-list-section">
        <DutyListHeading>Lỗi do tôi ghi nhận</DutyListHeading>
        {log.canAdd ? (
          <div className="duty-list-toolbar">
            <button type="button" className="work-primary-button" onClick={() => setPicking(true)}>
              <span>+</span> Thêm ghi nhận lỗi
            </button>
          </div>
        ) : null}
        {recorded.length ? (
          <div className="pr-fault-list">
            {recorded.map((fault) => <FaultCard key={fault._id} fault={fault} showTarget />)}
          </div>
        ) : (
          <FaultEmpty
            tone="recorded"
            filtered={searchActive && (log.faults || []).some((fault) => fault.isRecordedByMe)}
          />
        )}
      </div>
      ) : null}

      {picking ? (
        targets === undefined ? (
          <div className="pr-modal-backdrop">
            <div className="pr-modal"><div className="pr-loading">Đang tải danh sách nhân sự…</div></div>
          </div>
        ) : (
          <FaultPersonPicker
            people={targets.people}
            onSelect={(person) => {
              setPicking(false);
              setTarget(person);
            }}
            onClose={() => setPicking(false)}
          />
        )
      ) : null}
      {target ? (
        <FaultModal
          person={target}
          onClose={() => setTarget(null)}
          onSaved={() => setTarget(null)}
        />
      ) : null}
    </section>
  );
}

export default function StaffFaultsView() {
  return (
    <StaffFaultsErrorBoundary>
      <StaffFaultsPage />
    </StaffFaultsErrorBoundary>
  );
}
