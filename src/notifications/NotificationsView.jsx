import React from 'react';
import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';

function formatDate(value) {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function statusLabel(status) {
  if (status === 'attended') return 'Đã tham gia';
  if (status === 'absent') return 'Chưa tham gia';
  return 'Chưa xác nhận';
}

export default function NotificationsView() {
  const data = useQuery(anyApi.notifications.dutyAttendance);

  if (data === undefined) {
    return <section className="notifications-view"><div className="notifications-loading">Đang tải thông báo…</div></section>;
  }

  const items = data.items || [];
  return (
    <section className="notifications-view">
      <header className="notifications-hero">
        <div>
          <span className="notifications-kicker">Chức năng chính · Thông báo</span>
          <h2>Trạng thái công tác</h2>
          <p>Theo dõi nhanh ai đã tham gia và ai chưa xác nhận trong những công tác được phân công.</p>
        </div>
        <div className="notifications-mark">
          <strong>{items.filter((item) => item.status === 'pending').length}</strong>
          <span>CHƯA XÁC NHẬN</span>
        </div>
      </header>

      {!data.attendanceConfirmationEnabled ? (
        <div className="notifications-empty">
          <span>✓</span>
          <h3>Thông báo xác nhận đang tắt</h3>
          <p>Hệ thống đang xem các công tác được phân công là đã tham gia mặc định.</p>
        </div>
      ) : !items.length ? (
        <div className="notifications-empty">
          <span>✦</span>
          <h3>Chưa có trạng thái công tác</h3>
          <p>Các thông báo xác nhận tham gia sẽ xuất hiện tại đây.</p>
        </div>
      ) : (
        <div className="notifications-list">
          {items.map((item) => (
            <article className={`notification-card status-${item.status}`} key={item._id}>
              <div className="notification-icon" aria-hidden="true">{item.status === 'attended' ? '✓' : item.status === 'absent' ? '×' : '!'}</div>
              <div className="notification-copy">
                <strong>{item.userName}</strong>
                <span>{item.departmentName}{item.positionName ? ` · ${item.positionName}` : ''}</span>
                <p>{item.dutyContent}</p>
                <small>{formatDate(item.startDate)}{item.endDate !== item.startDate ? ` → ${formatDate(item.endDate)}` : ''}</small>
              </div>
              <span className="notification-status">{statusLabel(item.status)}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
