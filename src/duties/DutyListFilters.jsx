import { DUTY_LIST_TAB_PAST, DUTY_LIST_TAB_UPCOMING } from './dutyDisplay';

export function DutyListTabs({ tab, onChange }) {
  return (
    <div className="duty-list-tabs" role="tablist" aria-label="Lọc danh sách công tác">
      <button
        type="button"
        role="tab"
        aria-selected={tab === DUTY_LIST_TAB_UPCOMING}
        className={tab === DUTY_LIST_TAB_UPCOMING ? 'is-active' : undefined}
        onClick={() => onChange(DUTY_LIST_TAB_UPCOMING)}
      >
        Chưa diễn ra
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === DUTY_LIST_TAB_PAST}
        className={tab === DUTY_LIST_TAB_PAST ? 'is-active' : undefined}
        onClick={() => onChange(DUTY_LIST_TAB_PAST)}
      >
        Đã diễn ra
      </button>
    </div>
  );
}

export function DutyListEmpty({ tab }) {
  if (tab === DUTY_LIST_TAB_PAST) {
    return (
      <div className="work-empty duty-list-empty">
        <span aria-hidden="true">✓</span>
        <p>Chưa có sự kiện đã diễn ra.</p>
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
      <p>Bạn chưa có sự kiện nào cần tham gia</p>
    </div>
  );
}
