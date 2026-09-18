import { OfficialDutyHeader } from './DutyWorkspaceTabs';
import { canOpenDutyContentEditor } from './sharedDutySchedule.js';

export default function DutyScheduleTable({
  title,
  rows,
  onEditContent,
  onSelectEvent,
}) {
  return (
    <article className="lct-sheet" aria-label={title}>
      <OfficialDutyHeader title={title} />
      <table className="lct-table">
        <colgroup>
          <col className="lct-col-day" />
          <col className="lct-col-time" />
          <col className="lct-col-content" />
          <col className="lct-col-place" />
          <col className="lct-col-people" />
        </colgroup>
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Thời gian</th>
            <th>Nội dung</th>
            <th>Địa điểm</th>
            <th>Thành phần</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const selectable = Boolean(row.eventId && onSelectEvent);
            const editable = Boolean(onEditContent) && canOpenDutyContentEditor(row);
            return (
              <tr
                key={`${row.dayIso}-${row.eventId || 'empty'}-${index}`}
                className={selectable ? 'lct-row-selectable' : undefined}
                onClick={selectable ? () => onSelectEvent(row) : undefined}
              >
                {row.showDay ? (
                  <th scope="row" rowSpan={row.rowSpan}>{row.dayLabel}</th>
                ) : null}
                <td>{row.time}</td>
                <td className={editable ? 'lct-content-cell is-editable' : 'lct-content-cell'}>
                  {editable ? (
                    <button
                      type="button"
                      className={`lct-content-button${row.content ? '' : ' is-empty'}`}
                      title="Sửa công tác"
                      aria-label={row.content ? `Sửa công tác: ${row.content}` : 'Sửa công tác'}
                      onClick={(event) => {
                        event.stopPropagation();
                        onEditContent(row);
                      }}
                    >
                      {row.content}
                    </button>
                  ) : (
                    row.content
                  )}
                </td>
                <td>{row.location}</td>
                <td>{row.participants}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}
