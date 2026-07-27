import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';

function feedbackMessage(error) {
  const raw = String(error?.data ?? error?.message ?? error ?? '');
  if (raw.includes('FORBIDDEN')) return 'Bạn không có quyền thay đổi thiết lập này.';
  if (raw.includes('Could not find public function')) {
    return 'Backend chưa cập nhật function mới. Vui lòng deploy Convex rồi thử lại.';
  }
  return 'Không thể lưu thiết lập. Vui lòng thử lại.';
}

export default function DisplaySettings() {
  const data = useQuery(anyApi.settings.displaySettings);
  const update = useMutation(anyApi.settings.updateDisplaySettings);
  const updateNotifications = useMutation(anyApi.settings.updateNotificationSettings);
  const updateWorkAssigner = useMutation(anyApi.settings.updateWorkAssignerMode);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [assignerSaving, setAssignerSaving] = useState(false);
  const [assignerFeedback, setAssignerFeedback] = useState('');
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationFeedback, setNotificationFeedback] = useState('');
  const [notificationForm, setNotificationForm] = useState({
    dutiesEnabled: true,
    workEnabled: true,
    milestonesHours: [48, 24, 12, 0],
  });
  const [newMilestone, setNewMilestone] = useState('');

  useEffect(() => {
    if (!data) return;
    setNotificationForm({
      dutiesEnabled: data.notificationDutiesEnabled !== false,
      workEnabled: data.notificationWorkEnabled !== false,
      milestonesHours: data.notificationMilestonesHours || [48, 24, 12, 0],
    });
  }, [
    data?.notificationDutiesEnabled,
    data?.notificationWorkEnabled,
    data?.notificationMilestonesHours,
  ]);

  if (data === undefined) {
    return (
      <section className="display-settings-view">
        <div className="display-settings-loading">Đang tải thiết lập hiển thị…</div>
      </section>
    );
  }

  const enabled = data.dutyAttendanceConfirmationEnabled !== false;
  const workAssignerMode = data.workAssignerMode === 'supervisor' ? 'supervisor' : 'admin_mod';
  const enabledSettingCount = [
    enabled,
    workAssignerMode === 'admin_mod',
    notificationForm.dutiesEnabled,
    notificationForm.workEnabled,
  ].filter(Boolean).length;
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

  const setAssignerMode = async (mode) => {
    if (mode === workAssignerMode) return;
    setAssignerSaving(true);
    setAssignerFeedback('');
    try {
      await updateWorkAssigner({ mode });
      setAssignerFeedback(mode === 'admin_mod'
        ? 'Đã chuyển sang chế độ Admin/Mod giao việc.'
        : 'Đã chuyển sang chế độ Cấp trên giao việc.');
    } catch (error) {
      setAssignerFeedback(feedbackMessage(error));
    } finally {
      setAssignerSaving(false);
    }
  };

  const addMilestone = () => {
    const value = Number(newMilestone);
    if (!Number.isInteger(value) || value < 0 || value > 720) {
      setNotificationFeedback('Mốc thông báo phải là số giờ nguyên từ 0 đến 720.');
      return;
    }
    setNotificationForm((current) => ({
      ...current,
      milestonesHours: [...new Set([...current.milestonesHours, value])].sort((a, b) => b - a),
    }));
    setNewMilestone('');
    setNotificationFeedback('');
  };

  const saveNotifications = async () => {
    if (!notificationForm.milestonesHours.length) {
      setNotificationFeedback('Cần giữ lại ít nhất một mốc thông báo.');
      return;
    }
    setNotificationSaving(true);
    setNotificationFeedback('');
    try {
      await updateNotifications(notificationForm);
      setNotificationFeedback('Đã lưu thiết lập thông báo.');
    } catch (error) {
      setNotificationFeedback(feedbackMessage(error));
    } finally {
      setNotificationSaving(false);
    }
  };

  return (
    <section className="display-settings-view">
      <header className="display-settings-hero">
        <div>
          <span className="display-settings-kicker">Thiết lập tối cao · Hiển thị</span>
          <h2>Thiết lập hiển thị</h2>
          <p>Điều chỉnh xác nhận tham gia công tác, người giao việc và thông báo gần đến hạn.</p>
        </div>
        <div className={`display-settings-mark ${enabledSettingCount > 0 ? 'is-on' : 'is-off'}`}>
          <strong>{enabledSettingCount}</strong>
          <span>ĐANG BẬT</span>
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

      <div className="display-settings-card">
        <div className="display-settings-card-heading">
          <span className="display-settings-section-label">CÔNG VIỆC</span>
          <h3>Người giao việc</h3>
          <p>
            Chọn ai được phép phân công công việc. Chỉ bật một chế độ tại một thời điểm để tránh
            xung đột quy trình.
          </p>
        </div>
        <div className="notification-source-settings">
          <button
            type="button"
            className={`display-toggle ${workAssignerMode === 'admin_mod' ? 'is-on' : 'is-off'}`}
            onClick={() => void setAssignerMode('admin_mod')}
            disabled={assignerSaving || workAssignerMode === 'admin_mod'}
            aria-pressed={workAssignerMode === 'admin_mod'}
          >
            <span className="display-toggle-track"><span /></span>
            <span className="display-toggle-copy">
              <strong>Admin / Mod</strong>
              <small>Quản trị giao việc cho phòng ban hoặc cá nhân; mọi thành viên tự hoàn thành.</small>
            </span>
          </button>
          <button
            type="button"
            className={`display-toggle ${workAssignerMode === 'supervisor' ? 'is-on' : 'is-off'}`}
            onClick={() => void setAssignerMode('supervisor')}
            disabled={assignerSaving || workAssignerMode === 'supervisor'}
            aria-pressed={workAssignerMode === 'supervisor'}
          >
            <span className="display-toggle-track"><span /></span>
            <span className="display-toggle-copy">
              <strong>Cấp trên</strong>
              <small>Cấp 2–3 sao giao việc cho cấp dưới và đốc thúc hoàn thành.</small>
            </span>
          </button>
        </div>
        <div className="display-settings-note">
          <span aria-hidden="true">✦</span>
          <p>
            {workAssignerMode === 'admin_mod'
              ? 'Đang dùng quy trình Lê Văn Tám: Admin/Mod phân công; báo cáo KPI theo cá nhân hoàn thành.'
              : 'Đang dùng quy trình cấp trên giao việc: KPI cấp trên dựa trên việc đã giao và cấp dưới đã xong.'}
          </p>
        </div>
        {assignerFeedback ? <div className="display-settings-feedback" role="status">{assignerFeedback}</div> : null}
      </div>

      <div className="display-settings-card notification-settings-card">
        <div className="display-settings-card-heading">
          <span className="display-settings-section-label">THÔNG BÁO</span>
          <h3>Thông báo gần đến hạn</h3>
          <p>
            Chọn nguồn cần nhắc và cấu hình các mốc số giờ trước hạn. Mốc 0 giờ là thông báo
            ngay khi công tác hoặc công việc đến hạn.
          </p>
        </div>

        <div className="notification-source-settings">
          <button
            type="button"
            className={`display-toggle ${notificationForm.dutiesEnabled ? 'is-on' : 'is-off'}`}
            onClick={() => setNotificationForm((current) => ({ ...current, dutiesEnabled: !current.dutiesEnabled }))}
            aria-pressed={notificationForm.dutiesEnabled}
          >
            <span className="display-toggle-track"><span /></span>
            <span className="display-toggle-copy">
              <strong>Công tác</strong>
              <small>{notificationForm.dutiesEnabled ? 'Đang gửi thông báo gần đến hạn.' : 'Đã tắt thông báo công tác.'}</small>
            </span>
          </button>
          <button
            type="button"
            className={`display-toggle ${notificationForm.workEnabled ? 'is-on' : 'is-off'}`}
            onClick={() => setNotificationForm((current) => ({ ...current, workEnabled: !current.workEnabled }))}
            aria-pressed={notificationForm.workEnabled}
          >
            <span className="display-toggle-track"><span /></span>
            <span className="display-toggle-copy">
              <strong>Công việc</strong>
              <small>{notificationForm.workEnabled ? 'Đang gửi thông báo gần đến hạn.' : 'Đã tắt thông báo công việc.'}</small>
            </span>
          </button>
        </div>

        <div className="notification-milestone-editor">
          <div className="notification-milestone-heading">
            <div>
              <span>MỐC THÔNG BÁO</span>
              <strong>{notificationForm.milestonesHours.length} mốc đang cấu hình</strong>
            </div>
            <div className="notification-milestone-add">
              <label>
                <span>Số giờ</span>
                <input
                  type="number"
                  min="0"
                  max="720"
                  step="1"
                  value={newMilestone}
                  onChange={(event) => setNewMilestone(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addMilestone();
                    }
                  }}
                  placeholder="Ví dụ: 6"
                />
              </label>
              <button type="button" onClick={addMilestone}>+ Thêm mốc</button>
            </div>
          </div>
          <div className="notification-milestone-list">
            {notificationForm.milestonesHours.map((hours) => (
              <span key={hours}>
                <strong>{hours === 0 ? 'Đến hạn' : `${hours} giờ`}</strong>
                <button
                  type="button"
                  aria-label={`Xóa mốc ${hours} giờ`}
                  onClick={() => setNotificationForm((current) => ({
                    ...current,
                    milestonesHours: current.milestonesHours.filter((value) => value !== hours),
                  }))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="notification-settings-actions">
          <span>{notificationFeedback}</span>
          <button
            type="button"
            onClick={saveNotifications}
            disabled={notificationSaving || !notificationForm.milestonesHours.length}
          >
            {notificationSaving ? 'Đang lưu…' : 'Lưu thiết lập thông báo'}
          </button>
        </div>
      </div>
    </section>
  );
}
