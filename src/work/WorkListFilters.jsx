import { WORK_LIST_TAB_COMPLETED, WORK_LIST_TAB_INCOMPLETE } from './workDisplay';
import { DutyListSearch } from '../duties/DutyListFilters';

export function WorkListTabs({ tab, onChange, incompleteCount = 0 }) {
  const badgeLabel = incompleteCount > 99 ? '99+' : String(incompleteCount);
  return (
    <div className="duty-list-tabs" role="tablist" aria-label="Lọc danh sách công việc">
      <button
        type="button"
        role="tab"
        aria-selected={tab === WORK_LIST_TAB_INCOMPLETE}
        className={tab === WORK_LIST_TAB_INCOMPLETE ? 'is-active' : undefined}
        onClick={() => onChange(WORK_LIST_TAB_INCOMPLETE)}
      >
        Chưa hoàn thành
        {incompleteCount > 0 ? (
          <b className="nav-badge duty-list-tab-badge" aria-label={`${incompleteCount} công việc chưa hoàn thành`}>
            {badgeLabel}
          </b>
        ) : null}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === WORK_LIST_TAB_COMPLETED}
        className={tab === WORK_LIST_TAB_COMPLETED ? 'is-active' : undefined}
        onClick={() => onChange(WORK_LIST_TAB_COMPLETED)}
      >
        Đã hoàn thành
      </button>
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
        <p>{tone === 'created' ? 'Chưa có công việc bạn tạo đã hoàn thành.' : 'Chưa có công việc đã hoàn thành.'}</p>
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
      <p>{tone === 'created' ? 'Bạn chưa tạo công việc nào' : 'Bạn chưa có công việc nào cần xử lý'}</p>
    </div>
  );
}
