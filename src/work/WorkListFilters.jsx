import {
  formatWorkTabCount,
  WORK_LIST_TAB_COMPLETED,
  WORK_LIST_TAB_OVERDUE,
  WORK_LIST_TAB_PENDING,
  WORK_LIST_TAB_TODO,
} from './workDisplay';
import { DutyListSearch } from '../duties/DutyListFilters';

const WORK_LIST_TABS = [
  { id: WORK_LIST_TAB_TODO, label: 'Việc cần làm' },
  { id: WORK_LIST_TAB_PENDING, label: 'Đang chờ duyệt' },
  { id: WORK_LIST_TAB_OVERDUE, label: 'Quá hạn' },
  { id: WORK_LIST_TAB_COMPLETED, label: 'Đã duyệt hoàn thành' },
];

export function WorkListTabs({ tab, onChange, counts = {} }) {
  return (
    <div className="duty-list-tabs work-list-tabs" role="tablist" aria-label="Lọc danh sách công việc">
      {WORK_LIST_TABS.map((item) => {
        const count = Number(counts[item.id]) || 0;
        const badgeLabel = formatWorkTabCount(count);
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'is-active' : undefined}
            onClick={() => onChange(item.id)}
          >
            {item.label}
            {badgeLabel ? (
              <b className="nav-badge duty-list-tab-badge" aria-label={`${count} ${item.label}`}>
                {badgeLabel}
              </b>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function WorkListSearch({ value, onChange }) {
  return (
    <DutyListSearch
      value={value}
      onChange={onChange}
      queryPlaceholder="Tìm theo tên hoặc nội dung công việc"
      personPlaceholder="Tên người được giao"
      showLocation={false}
    />
  );
}

function workListEmptyCopy(tab, tone) {
  const created = tone === 'created';
  if (tab === WORK_LIST_TAB_COMPLETED) {
    return created ? 'Chưa có công việc bạn tạo đã duyệt hoàn thành.' : 'Chưa có công việc đã duyệt hoàn thành.';
  }
  if (tab === WORK_LIST_TAB_PENDING) {
    return created ? 'Không có công việc bạn tạo đang chờ duyệt.' : 'Không có công việc đang chờ duyệt.';
  }
  if (tab === WORK_LIST_TAB_OVERDUE) {
    return created ? 'Chưa có công việc bạn tạo quá hạn.' : 'Chưa có công việc quá hạn.';
  }
  return created ? 'Không có việc cần làm trong các công việc bạn tạo.' : 'Bạn chưa có việc cần làm.';
}

export function WorkListEmpty({ tab = WORK_LIST_TAB_TODO, tone = 'mine', filtered = false }) {
  if (filtered) {
    return (
      <div className="work-empty duty-list-empty">
        <span aria-hidden="true">⌕</span>
        <p>Không tìm thấy công việc phù hợp.</p>
      </div>
    );
  }
  if (tab === WORK_LIST_TAB_COMPLETED) {
    return (
      <div className="work-empty duty-list-empty">
        <span aria-hidden="true">✓</span>
        <p>{workListEmptyCopy(tab, tone)}</p>
      </div>
    );
  }
  if (tab === WORK_LIST_TAB_OVERDUE || tab === WORK_LIST_TAB_PENDING) {
    return (
      <div className="work-empty duty-list-empty">
        <span aria-hidden="true">{tab === WORK_LIST_TAB_OVERDUE ? '!' : '…'}</span>
        <p>{workListEmptyCopy(tab, tone)}</p>
      </div>
    );
  }
  return (
    <div className="work-empty duty-list-empty duty-empty-upcoming">
      <span className="duty-empty-smile" aria-hidden="true">
        <svg viewBox="0 0 72 72">
          <circle cx="36" cy="36" r="30" />
          <circle className="duty-empty-blush" cx="20.5" cy="40" r="5" />
          <circle className="duty-empty-blush" cx="51.5" cy="40" r="5" />
          <circle className="duty-empty-eye" cx="26" cy="31" r="3.2" />
          <circle className="duty-empty-eye" cx="46" cy="31" r="3.2" />
          <path d="M25 44c3.4 6 18.6 6 22 0" />
        </svg>
      </span>
      <p>{workListEmptyCopy(tab, tone)}</p>
    </div>
  );
}
