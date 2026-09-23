import { useEffect, useMemo, useState } from 'react';
import { anyApi } from 'convex/server';
import DutyWorkspaceTabs from './DutyWorkspaceTabs';
import DutyEditModal from './DutyEditModal';
import DutyScheduleTable from './DutyScheduleTable';
import {
  buildSharedScheduleRows,
  shiftScheduleAnchor,
  toIsoDate,
} from './sharedDutySchedule.js';
import { useCachedDutySchedule } from './useCachedDutySchedule.js';
import './sharedDutySchedule.css';

export default function SharedDutyScheduleView({ onChooseView, currentUserId = '' }) {
  const [mode, setMode] = useState('week');
  const [anchorIso, setAnchorIso] = useState(() => toIsoDate(new Date()));
  const [editingEvent, setEditingEvent] = useState(null);
  const rangePreview = useMemo(() => buildSharedScheduleRows(mode, anchorIso, []).range, [mode, anchorIso]);
  const data = useCachedDutySchedule({
    userId: currentUserId,
    view: 'shared',
    mode,
    startDate: rangePreview.startIso,
    endDate: rangePreview.endIso,
    revisionQuery: anyApi.duties.sharedScheduleRevision,
    dataQuery: anyApi.duties.sharedSchedule,
    queryArgs: {
      startDate: rangePreview.startIso,
      endDate: rangePreview.endIso,
    },
  });
  const events = data?.events || [];
  const built = useMemo(
    () => buildSharedScheduleRows(mode, anchorIso, events),
    [mode, anchorIso, events],
  );

  const downloading = async () => {
    const { downloadSharedDutySchedulePdf: savePdf } = await import('./sharedDutySchedulePdf.js');
    savePdf(built);
  };

  const openEditor = (row) => {
    const event = events.find((item) => String(item._id) === String(row.eventId));
    if (!event?.canManage) return;
    setEditingEvent(event);
  };

  useEffect(() => {
    if (!editingEvent?._id) return;
    const next = events.find((item) => String(item._id) === String(editingEvent._id));
    if (next && next !== editingEvent) setEditingEvent(next);
    if (data !== undefined && !next) setEditingEvent(null);
  }, [data, events, editingEvent?._id]);

  return (
    <section className="duty-workspace lct-shared-view">
      <DutyWorkspaceTabs view="shared" onChoose={onChooseView} />
      <div className="lct-shared-toolbar">
        <div className="lct-shared-toolbar-center">
          <div className="lct-period-nav" role="group" aria-label="Chọn kỳ">
            <button type="button" onClick={() => setAnchorIso((current) => shiftScheduleAnchor(mode, current, -1))} aria-label="Kỳ trước">
              ‹
            </button>
            <button type="button" className="lct-today" onClick={() => setAnchorIso(toIsoDate(new Date()))}>
              Hôm nay
            </button>
            <button type="button" onClick={() => setAnchorIso((current) => shiftScheduleAnchor(mode, current, 1))} aria-label="Kỳ sau">
              ›
            </button>
          </div>
          <div className="lct-mode-switch" role="group" aria-label="Kiểu hiển thị">
            <button type="button" className={mode === 'week' ? 'is-active' : undefined} onClick={() => setMode('week')}>
              Tuần
            </button>
            <button type="button" className={mode === 'month' ? 'is-active' : undefined} onClick={() => setMode('month')}>
              Tháng
            </button>
          </div>
        </div>
        <button
          type="button"
          className="work-primary-button lct-download"
          disabled={data === undefined}
          onClick={() => void downloading()}
        >
          Tải PDF
        </button>
      </div>

      {data === undefined ? (
        <p className="lct-loading">Đang dựng lịch công tác chung…</p>
      ) : (
        <DutyScheduleTable
          title={built.range.title}
          rows={built.rows}
          onEditContent={openEditor}
        />
      )}

      {editingEvent ? (
        <DutyEditModal duty={editingEvent} onClose={() => setEditingEvent(null)} />
      ) : null}
    </section>
  );
}
