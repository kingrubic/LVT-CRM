import React, { useState } from 'react';
import { useMutation } from 'convex/react';
import { anyApi } from 'convex/server';

function formatDueAt(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
}

function NotificationItem({ item, onRead, onDismiss, canDelete, pending }) {
  return (
    <article
      className={`notification-card ${item.read ? 'is-read' : 'is-unread'} milestone-${item.milestoneHours}`}
    >
      <button
        type="button"
        className="notification-card-main"
        onClick={() => {
          if (!item.read) onRead(item.key);
        }}
        disabled={pending === item.key}
      >
        <span className="notification-icon" aria-hidden="true">
          {item.kind === 'duty' ? '◷' : '✓'}
        </span>
        <span className="notification-copy">
          <span className="notification-meta">
            <strong>{item.milestoneLabel}</strong>
            <small>Hạn {formatDueAt(item.dueAt)}</small>
          </span>
          <strong className="notification-title">{item.title}</strong>
          <span className="notification-description">{item.description}</span>
        </span>
        {!item.read ? <i className="notification-unread-dot" aria-label="Chưa đọc" /> : null}
      </button>
      {canDelete ? (
        <button
          type="button"
          className="notification-dismiss-button"
          aria-label={`Xóa thông báo: ${item.title}`}
          title="Xóa thông báo"
          disabled={pending === `dismiss-${item.key}`}
          onClick={() => onDismiss(item.key)}
        >
          ×
        </button>
      ) : null}
    </article>
  );
}

function NotificationSection({ kind, title, subtitle, items, onRead, onDismiss, canDelete, pending }) {
  return (
    <section className={`notification-category category-${kind}`}>
      <header>
        <div>
          <span>{kind === 'duty' ? 'CÔNG TÁC' : 'CÔNG VIỆC'}</span>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <strong>{items.length}</strong>
      </header>
      {items.length ? (
        <div className="notification-category-list">
          {items.map((item) => (
            <NotificationItem
              item={item}
              key={item.key}
              onRead={onRead}
              onDismiss={onDismiss}
              canDelete={canDelete}
              pending={pending}
            />
          ))}
        </div>
      ) : (
        <div className="notification-category-empty">
          <span>✓</span>
          <p>Hiện chưa có {kind === 'duty' ? 'công tác' : 'công việc'} nào gần đến hạn.</p>
        </div>
      )}
    </section>
  );
}

export default function NotificationsView({ data }) {
  const markRead = useMutation(anyApi.notifications.markRead);
  const markAllRead = useMutation(anyApi.notifications.markAllRead);
  const dismiss = useMutation(anyApi.notifications.dismiss);
  const [pending, setPending] = useState('');

  if (data === undefined) {
    return <section className="notifications-view"><div className="notifications-loading">Đang tải thông báo…</div></section>;
  }

  const dutyItems = data.items.filter((item) => item.kind === 'duty');
  const workItems = data.items.filter((item) => item.kind === 'work');
  const unreadKeys = data.items.filter((item) => !item.read).map((item) => item.key);

  const readOne = async (notificationKey) => {
    setPending(notificationKey);
    try {
      await markRead({ notificationKey });
    } finally {
      setPending('');
    }
  };

  const readAll = async () => {
    if (!unreadKeys.length) return;
    setPending('all');
    try {
      await markAllRead({ notificationKeys: unreadKeys });
    } finally {
      setPending('');
    }
  };

  const dismissOne = async (notificationKey) => {
    setPending(`dismiss-${notificationKey}`);
    try {
      await dismiss({ notificationKey });
    } finally {
      setPending('');
    }
  };

  return (
    <section className="notifications-view">
      <header className="notifications-hero">
        <div>
          <span className="notifications-kicker">Chức năng chính · Thông báo</span>
          <h2>Nhịp việc sắp tới</h2>
          <p>Các công tác và công việc gần đến hạn, được nhắc đúng theo mốc thời gian đã thiết lập.</p>
        </div>
        <div className="notifications-mark">
          <strong>{data.unreadCount}</strong>
          <span>CHƯA ĐỌC</span>
        </div>
      </header>

      <div className="notifications-toolbar">
        <p>
          Mốc đang dùng: {data.settings.milestonesHours.map((hours) => hours === 0 ? 'Đến hạn' : `${hours} giờ`).join(' · ')}
        </p>
        <button
          type="button"
          onClick={readAll}
          disabled={!unreadKeys.length || pending === 'all'}
        >
          ✓ Đánh dấu tất cả là đã đọc
        </button>
      </div>

      <div className="notification-category-grid">
        <NotificationSection
          kind="duty"
          title="Công tác gần đến hạn"
          subtitle={data.settings.dutiesEnabled ? 'Lịch công tác được phân công cho bạn.' : 'Thông báo Công tác đang được Admin tắt.'}
          items={dutyItems}
          onRead={readOne}
          onDismiss={dismissOne}
          canDelete={data.canDelete}
          pending={pending}
        />
        <NotificationSection
          kind="work"
          title="Công việc gần đến hạn"
          subtitle={data.settings.workEnabled ? 'Công văn, công việc phòng ban và cá nhân cần xử lý.' : 'Thông báo Công việc đang được Admin tắt.'}
          items={workItems}
          onRead={readOne}
          onDismiss={dismissOne}
          canDelete={data.canDelete}
          pending={pending}
        />
      </div>
    </section>
  );
}
