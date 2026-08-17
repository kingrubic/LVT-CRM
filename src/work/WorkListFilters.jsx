import { WORK_LIST_TAB_PAST, WORK_LIST_TAB_UPCOMING } from './workDisplay';
import { DutyListSearch } from '../duties/DutyListFilters';

export function WorkListTabs({ tab, onChange }) {
  return (
    <div className="duty-list-tabs" role="tablist" aria-label="Lọc danh sách công việc">
      <button
        type="button"
        role="tab"
        aria-selected={tab === WORK_LIST_TAB_UPCOMING}
        className={tab === WORK_LIST_TAB_UPCOMING ? 'is-active' : undefined}
        onClick={() => onChange(WORK_LIST_TAB_UPCOMING)}
      >
        Chưa diễn ra
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === WORK_LIST_TAB_PAST}
        className={tab === WORK_LIST_TAB_PAST ? 'is-active' : undefined}
        onClick={() => onChange(WORK_LIST_TAB_PAST)}
      >
        Đã diễn ra
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

export function WorkListEmpty({ tab = WORK_LIST_TAB_UPCOMING, tone = 'mine', filtered = false }) {
  if (filtered) {
    return (
      <div className="work-empty duty-list-empty">
        <span aria-hidden="true">⌕</span>
        <p>Không tìm thấy công việc phù hợp.</p>
      </div>
    );
  }
  if (tab === WORK_LIST_TAB_PAST) {
    return (
      <div className="work-empty duty-list-empty">
        <span aria-hidden="true">✓</span>
        <p>{tone === 'created' ? 'Chưa có công việc bạn tạo đã diễn ra.' : 'Chưa có công việc đã diễn ra.'}</p>
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
