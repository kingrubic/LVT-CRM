import { useMemo, useState } from 'react';
import { useMutation } from 'convex/react';
import { anyApi } from 'convex/server';

function reminderErrorMessage(error) {
  const raw = String(error?.data ?? error?.message ?? error ?? '');
  if (raw.includes('PERSONAL_REMINDER_FORBIDDEN')) return 'Bạn chỉ được tự đặt nhắc cho công tác/công việc của mình.';
  if (raw.includes('DUTY_ALREADY_PAST')) return 'Công tác đã diễn ra, không đặt nhắc mới được.';
  if (raw.includes('WORK_ALREADY_COMPLETED')) return 'Công việc này đã hoàn thành hoặc đang chờ duyệt.';
  if (raw.includes('INVALID_NOTIFICATION_MILESTONES')) return 'Mốc thông báo phải là số giờ nguyên từ 0 đến 720.';
  if (raw.includes('FORBIDDEN')) return 'Bạn không có quyền đặt nhắc nhở này.';
  return 'Không thể lưu nhắc nhở. Vui lòng thử lại.';
}

function addMilestoneHours(current, rawValue) {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 0 || value > 720) {
    return { error: 'Mốc thông báo phải là số giờ nguyên từ 0 đến 720.' };
  }
  return {
    hours: [...new Set([...current, value])].sort((a, b) => b - a),
  };
}

export function reminderMapFromList(data) {
  return new Map((data?.items || []).map((item) => [String(item.sourceId), item]));
}

export function PersonalReminderLayout({ show = false, panel = null, children }) {
  if (!show) return children;
  return (
    <div className="duty-card-layout">
      <div className="duty-card-main-col">{children}</div>
      {panel}
    </div>
  );
}

export default function PersonalReminderPanel({
  kind,
  sourceType,
  sourceId,
  label,
  reminder = null,
}) {
  const upsert = useMutation(anyApi.personalReminders.upsert);
  const enabled = Boolean(reminder?.enabled);
  const hours = reminder?.milestonesHours || [];
  const [inputValue, setInputValue] = useState('');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const copy = useMemo(() => {
    const noun = label || (kind === 'work' ? 'Công việc' : 'Công tác');
    return {
      noun,
      off: kind === 'work' ? 'Đã tắt nhắc nhở công việc.' : 'Đã tắt nhắc nhở công tác.',
      on: 'Đang nhắc trước hạn.',
    };
  }, [kind, label]);

  const save = async (nextEnabled, nextHours) => {
    setSaving(true);
    setFeedback('');
    try {
      await upsert({
        kind,
        sourceType,
        sourceId: String(sourceId),
        enabled: nextEnabled,
        milestonesHours: nextHours,
      });
    } catch (error) {
      setFeedback(reminderErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const addHours = () => {
    const result = addMilestoneHours(hours, inputValue);
    if (result.error) {
      setFeedback(result.error);
      return;
    }
    setInputValue('');
    void save(true, result.hours);
  };

  return (
    <aside
      className="personal-reminder-panel"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={`display-toggle ${enabled ? 'is-on' : 'is-off'}`}
        onClick={() => void save(!enabled, hours)}
        aria-pressed={enabled}
        disabled={saving}
      >
        <span className="display-toggle-track"><span /></span>
        <span className="display-toggle-copy">
          <strong>{copy.noun}</strong>
          <small>{enabled ? copy.on : copy.off}</small>
        </span>
      </button>
      {enabled ? (
        <div className="notification-milestone-editor">
          <div className="notification-milestone-heading">
            <div>
              <span>MỐC THÔNG BÁO</span>
              <strong>{hours.length ? `${hours.length} mốc đang cấu hình` : 'Chưa có mốc'}</strong>
            </div>
            <div className="notification-milestone-add">
              <label>
                <span>Số giờ</span>
                <input
                  type="number"
                  min="0"
                  max="720"
                  step="1"
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addHours();
                    }
                  }}
                  placeholder="Ví dụ:"
                  disabled={saving}
                />
              </label>
              <button type="button" onClick={addHours} disabled={saving}>+ Thêm mốc</button>
            </div>
          </div>
          <div className="notification-milestone-list">
            {hours.map((value) => (
              <span key={value}>
                <strong>{value === 0 ? 'Đến hạn' : `${value} giờ`}</strong>
                <button
                  type="button"
                  aria-label={`Xóa mốc ${value} giờ`}
                  onClick={() => void save(true, hours.filter((item) => item !== value))}
                  disabled={saving}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {feedback ? <p className="personal-reminder-feedback" role="status">{feedback}</p> : null}
    </aside>
  );
}
