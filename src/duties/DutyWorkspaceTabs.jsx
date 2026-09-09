import {
  LCT_ISSUING_AUTHORITY,
  LCT_NATIONAL_MOTTO_SUB,
  LCT_NATIONAL_MOTTO_TITLE,
  LCT_SCHOOL_LINES,
} from './sharedDutySchedule.js';
import './sharedDutySchedule.css';

export default function DutyWorkspaceTabs({ view, onChoose }) {
  return (
    <div className="duty-workspace-tabs" role="tablist" aria-label="Lịch công tác">
      <button
        type="button"
        role="tab"
        aria-selected={view === 'personal'}
        className={view === 'personal' ? 'is-active' : undefined}
        onClick={() => onChoose('personal')}
      >
        Lịch công tác cá nhân
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'shared'}
        className={view === 'shared' ? 'is-active' : undefined}
        onClick={() => onChoose('shared')}
      >
        Lịch công tác chung
      </button>
    </div>
  );
}

export function OfficialDutyHeader({ title }) {
  return (
    <header className="lct-official-header">
      <div className="lct-official-banner">
        <div className="lct-official-left">
          <p>{LCT_ISSUING_AUTHORITY}</p>
          <p>{LCT_SCHOOL_LINES[0]}</p>
          <p>{LCT_SCHOOL_LINES[1]}</p>
        </div>
        <div className="lct-official-right">
          <p>{LCT_NATIONAL_MOTTO_TITLE}</p>
          <p>{LCT_NATIONAL_MOTTO_SUB}</p>
        </div>
      </div>
      <h2>{title}</h2>
    </header>
  );
}
