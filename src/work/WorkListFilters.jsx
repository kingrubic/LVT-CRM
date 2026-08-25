import {
  WORK_LIST_TAB_COMPLETED,
  WORK_LIST_TAB_INCOMPLETE,
  WORK_LIST_TAB_OVERDUE,
  WORK_LIST_TAB_UPCOMING,
} from './workDisplay';
import { DutyListSearch } from '../duties/DutyListFilters';

const WORK_LIST_TABS = [
  { id: WORK_LIST_TAB_INCOMPLETE, label: 'Chưa hoàn thành' },
  { id: WORK_LIST_TAB_COMPLETED, label: 'Đã hoàn thành' },
  { id: WORK_LIST_TAB_UPCOMING, label: 'Chưa đến hạn' },
  { id: WORK_LIST_TAB_OVERDUE, label: 'Đã quá hạn' },
];

export function WorkListTabs({ tab, onChange, incompleteCount = 0 }) {
  const badgeLabel = incompleteCount > 99 ? '99+' : String(incompleteCount);
  return (
    <div className="duty-list-tabs work-list-tabs" role="tablist" aria-label="Lọc danh sách công việc">
      {WORK_LIST_TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={tab === item.id}
          className={tab === item.id ? 'is-active' : undefined}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.id === WORK_LIST_TAB_INCOMPLETE && incompleteCount > 0 ? (
            <b className="nav-badge duty-list-tab-badge" aria-label={`${incompleteCount} công việc chưa hoàn thành`}>
              {badgeLabel}
            </b>
          ) : null}
        </button>
      ))}
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
    return created ? 'Chưa có công việc bạn tạo đã hoàn thành.' : 'Chưa có công việc đã hoàn thành.';
  }
  if (tab === WORK_LIST_TAB_UPCOMING) {
    return created ? 'Chưa có công việc bạn tạo chưa đến hạn.' : 'Chưa có công việc chưa đến hạn.';
  }
  if (tab === WORK_LIST_TAB_OVERDUE) {
    return created ? 'Chưa có công việc bạn tạo đã quá hạn.' : 'Chưa có công việc quá hạn.';
  }
  return created ? 'Bạn chưa tạo công việc nào' : 'Bạn chưa có công việc nào cần xử lý';
}

export function WorkListEmpty({ tab = WORK_LIST_TAB_INCOMPLETE, tone = 'mine', filtered = false }) {
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
  if (tab === WORK_LIST_TAB_OVERDUE) {
    return (
      <div className="work-empty duty-list-empty">
        <span aria-hidden="true">!</span>
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
