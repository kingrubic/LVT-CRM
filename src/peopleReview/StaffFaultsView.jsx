import React, { useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
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

export default function StaffFaultsView() {
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

  if (log === undefined) return <div className="pr-loading">Đang tải ghi nhận lỗi…</div>;

  return (
    <section className="pr-view">
      <div className="pr-hero">
        <div>
          <span className="pr-kicker">Nhân sự</span>
          <h2>Ghi nhận lỗi</h2>
          <p>
            {log.access === 'view_all'
              ? 'Danh sách toàn trường. Lọc ngày hoặc tìm người để xem nhanh.'
              : 'Bạn đang xem lỗi của mình và các lần do mình ghi nhận.'}
          </p>
        </div>
        {log.canAdd ? (
          <button type="button" className="pr-primary-button" onClick={() => setPicking(true)}>
            ＋ Thêm ghi nhận lỗi
          </button>
        ) : null}
      </div>

      <div className="pr-section">
        <header className="pr-section-head">
          <div>
            <span>DANH SÁCH</span>
            <h3>{faults.length} lần ghi nhận</h3>
          </div>
        </header>
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
        {faults.length ? (
          <div className="pr-fault-list">
            {faults.map((fault) => (
              <article className="pr-fault-card" key={fault._id}>
                <header>
                  <strong>{formatDate(fault.violationDate)}</strong>
                  <span>Ghi bởi {fault.recordedByName}</span>
                </header>
                <div className="pr-fault-person">
                  <strong>{fault.targetName}</strong>
                  <small>{fault.departmentName}</small>
                </div>
                <div className="pr-fault-tags">
                  {fault.isSelfTarget ? <span className="pr-tag">Lỗi của tôi</span> : null}
                  {fault.isRecordedByMe ? <span className="pr-tag is-recorded">Do tôi ghi nhận</span> : null}
                </div>
                <p>{fault.reason}</p>
                <PrivateFileButton kind="fault" fileId={fault._id} fileName={fault.fileName} />
              </article>
            ))}
          </div>
        ) : (
          <div className="pr-empty">
            {log.faults.length
              ? 'Không có ghi nhận lỗi khớp với từ khóa tìm kiếm.'
              : 'Không có ghi nhận lỗi trong khoảng thời gian này.'}
          </div>
        )}
      </div>

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
