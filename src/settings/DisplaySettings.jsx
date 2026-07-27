import React, { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';

function feedbackMessage(error) {
  const raw = String(error?.data ?? error?.message ?? error ?? '');
  if (raw.includes('FORBIDDEN')) return 'Bạn không có quyền thay đổi thiết lập này.';
  return 'Không thể lưu thiết lập. Vui lòng thử lại.';
}

export default function DisplaySettings() {
  const data = useQuery(anyApi.settings.displaySettings);
  const update = useMutation(anyApi.settings.updateDisplaySettings);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  if (data === undefined) {
    return (
      <section className="display-settings-view">
        <div className="display-settings-loading">Đang tải thiết lập hiển thị…</div>
      </section>
    );
  }

  const enabled = data.dutyAttendanceConfirmationEnabled !== false;
  const toggle = async () => {
    setSaving(true);
    setFeedback('');
    try {
      await update({ dutyAttendanceConfirmationEnabled: !enabled });
      setFeedback(!enabled ? 'Đã bật hiển thị xác nhận tham gia.' : 'Đã tắt hiển thị xác nhận tham gia.');
    } catch (error) {
      setFeedback(feedbackMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="display-settings-view">
      <header className="display-settings-hero">
        <div>
          <span className="display-settings-kicker">Thiết lập tối cao · Hiển thị</span>
          <h2>Thiết lập hiển thị</h2>
          <p>Điều chỉnh cách hệ thống hiển thị trạng thái xác nhận tham gia công tác cho toàn trường.</p>
        </div>
        <div className={`display-settings-mark ${enabled ? 'is-on' : 'is-off'}`}>
          <strong>{enabled ? 'ON' : 'OFF'}</strong>
          <span>CÔNG TÁC</span>
        </div>
      </header>

      <div className="display-settings-card">
        <div className="display-settings-card-heading">
          <span className="display-settings-section-label">CÔNG TÁC</span>
          <h3>Hiển thị xác nhận tham gia</h3>
          <p>
            Khi bật, người tham gia có thể xác nhận Đã tham gia hoặc Chưa tham gia; cấp trên
            cũng nhìn thấy trạng thái của cấp dưới trong Công tác, Thông báo và Báo cáo.
          </p>
        </div>
        <button
          type="button"
          className={`display-toggle ${enabled ? 'is-on' : 'is-off'}`}
          onClick={toggle}
          disabled={saving}
          aria-pressed={enabled}
          aria-label={enabled ? 'Tắt hiển thị xác nhận tham gia' : 'Bật hiển thị xác nhận tham gia'}
        >
          <span className="display-toggle-track"><span /></span>
          <span className="display-toggle-copy">
            <strong>{enabled ? 'Đang bật' : 'Đang tắt'}</strong>
            <small>{enabled ? 'Hiển thị trạng thái và nút xác nhận.' : 'Mặc định công tác được xem là đã tham gia.'}</small>
          </span>
        </button>
        <div className="display-settings-note">
          <span aria-hidden="true">✦</span>
          <p>
            {enabled
              ? 'Báo cáo sẽ có thêm hai chỉ số Đã tham gia và Chưa xác nhận.'
              : 'Báo cáo chỉ hiển thị tổng số Công tác trong kỳ; các nút xác nhận sẽ được ẩn.'}
          </p>
        </div>
        {feedback ? <div className="display-settings-feedback" role="status">{feedback}</div> : null}
      </div>
    </section>
  );
}
