import { fromDateTimeLocalValue, toDateTimeLocalValue } from './dutyDisplay';

export default function DutyEditorFields({ form, onField, onStartDateTime, onEndDateTime, children }) {
  const startValue = form.allDay ? form.startDate : toDateTimeLocalValue(form.startDate, form.startTime);
  const endValue = form.allDay
    ? (form.startDate || form.endDate)
    : toDateTimeLocalValue(form.endDate, form.endTime);

  return (
    <>
      <label className="duty-content-field">
        Tên công tác
        <input
          required
          type="text"
          maxLength={200}
          value={form.title}
          onChange={(event) => onField('title', event.target.value)}
          placeholder="Nhập tên công tác"
        />
        <small>{form.title.length}/200</small>
      </label>

      <label className="duty-content-field">
        Nội dung công tác
        <textarea
          required
          maxLength={200}
          rows={3}
          value={form.content}
          onChange={(event) => onField('content', event.target.value)}
          placeholder="Nội dung công tác (tối đa 200 ký tự)"
        />
        <small>{form.content.length}/200</small>
      </label>

      <fieldset className="duty-schedule-fieldset">
        <legend>Thời gian</legend>
        <div className="duty-schedule-heading">
          <p>Chọn ngày và giờ trên cùng một ô lịch.</p>
          <label className="check-inline">
            <input type="checkbox" checked={form.allDay} onChange={(event) => onField('allDay', event.target.checked)} />
            <span>Cả ngày</span>
          </label>
        </div>
        <div className="duty-schedule-grid">
          <label>
            Từ ngày
            <input
              required
              type={form.allDay ? 'date' : 'datetime-local'}
              step={form.allDay ? undefined : 60}
              value={startValue}
              onChange={(event) => {
                if (form.allDay) {
                  onField('startDate', event.target.value);
                  return;
                }
                const next = fromDateTimeLocalValue(event.target.value);
                onStartDateTime(next.date, next.time);
              }}
            />
          </label>
          <label className={form.allDay ? 'field-disabled' : undefined}>
            Đến ngày
            <input
              required
              type={form.allDay ? 'date' : 'datetime-local'}
              step={form.allDay ? undefined : 60}
              value={endValue}
              disabled={form.allDay}
              onChange={(event) => {
                const next = fromDateTimeLocalValue(event.target.value);
                onEndDateTime(next.date, next.time);
              }}
            />
          </label>
        </div>
        {form.allDay ? <small>Đã chọn Cả ngày — ngày kết thúc trùng ngày bắt đầu và không áp dụng giờ.</small> : null}
      </fieldset>

      <label className="duty-content-field">
        Địa điểm
        <input
          required
          type="text"
          maxLength={200}
          value={form.locationText}
          onChange={(event) => onField('locationText', event.target.value)}
          placeholder="Nhập địa điểm công tác"
        />
      </label>

      {children}
    </>
  );
}
