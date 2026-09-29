import { Component, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { DiscussionComposer, DiscussionMessage } from '../lib/DiscussionModal';
import { matchesPickerSearch } from '../lib/pickerSearch';
import { chatDayLabel } from './chatTime';
import { formatChatListTime } from './chatTime';
import { chatErrorText } from './chatErrorText';
import { parseChatPath } from '../navigationRoutes';
import { threadKeyFor } from './threadKey';
import { CreateGroupDialog, ManageGroupDialog } from './GroupDialogs';
import '../work/work.css';
import './chatHub.css';

const FILTERS = [
  ['all', 'Tất cả'],
  ['duty', 'Công tác'],
  ['work', 'Công việc'],
  ['group', 'Nhóm'],
];
const RECALLED_PREVIEW = 'Tin nhắn đã được thu hồi';
const COLLAPSE_KEY = 'lvt.chatHub.listCollapsed';
const PAGE_SIZE = 40;

const THREAD_API = {
  work: {
    list: anyApi.workMessages.list,
    create: anyApi.workMessages.create,
    recall: anyApi.workMessages.recall,
    idField: 'documentId',
  },
  duty: {
    list: anyApi.dutyMessages.list,
    create: anyApi.dutyMessages.create,
    recall: anyApi.dutyMessages.recall,
    idField: 'dutyId',
  },
  group: {
    list: anyApi.groupMessages.list,
    create: anyApi.groupMessages.create,
    recall: anyApi.groupMessages.recall,
    idField: 'groupId',
  },
};

class ThreadErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) return this.props.fallback(this.state.error);
    return this.props.children;
  }
}

function initials(title) {
  const parts = String(title || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'N';
  return parts.slice(0, 2).map((part) => part.slice(0, 1).toUpperCase()).join('');
}

function KindMark({ kind, title }) {
  if (kind === 'group') {
    return <span className="chat-avatar kind-group" aria-hidden="true">{initials(title)}</span>;
  }
  return (
    <span className={`chat-avatar kind-${kind}`} aria-hidden="true">
      {kind === 'duty' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3.5v3M16 3.5v3M4 10h16" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M8 7h11l-1.2 12H9.2L8 7z" />
          <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
        </svg>
      )}
    </span>
  );
}

function listPreview(item, currentUserId) {
  const text = String(item.lastBodyText || '').trim();
  if (!text) return 'Chưa có tin nhắn';
  if (text === RECALLED_PREVIEW || text === 'Nhóm vừa được tạo') return text;
  if (item.lastAuthorUserId && item.lastAuthorUserId === currentUserId) return `Bạn: ${text}`;
  return text;
}

function mergeMessages(older, newer) {
  const map = new Map();
  for (const item of [...older, ...newer]) {
    if (item?._id) map.set(String(item._id), item);
  }
  return [...map.values()].sort((a, b) => a.createdAt - b.createdAt);
}

function useNarrowLayout() {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 800px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)');
    const onChange = () => setNarrow(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

function useThreadMessages(kind, entityId) {
  const api = THREAD_API[kind];
  const [older, setOlder] = useState([]);
  const [before, setBefore] = useState(null);
  const [olderHasMore, setOlderHasMore] = useState(false);
  const [paging, setPaging] = useState(false);
  const appliedBefore = useRef(null);
  const latest = useQuery(
    api.list,
    entityId ? { [api.idField]: entityId, limit: PAGE_SIZE } : 'skip',
  );
  const olderPage = useQuery(
    api.list,
    entityId && before ? { [api.idField]: entityId, limit: PAGE_SIZE, before } : 'skip',
  );

  useEffect(() => {
    setOlder([]);
    setBefore(null);
    setOlderHasMore(false);
    setPaging(false);
    appliedBefore.current = null;
  }, [kind, entityId]);

  useEffect(() => {
    if (!before || olderPage === undefined || appliedBefore.current === before) return;
    appliedBefore.current = before;
    setOlder((current) => mergeMessages(olderPage.messages || [], current));
    setOlderHasMore(Boolean(olderPage.hasMore));
    setPaging(false);
    setBefore(null);
  }, [before, olderPage]);

  const messages = useMemo(
    () => mergeMessages(older, latest?.messages || []),
    [older, latest?.messages],
  );

  return {
    messages,
    loading: latest === undefined,
    hasMore: older.length ? olderHasMore : Boolean(latest?.hasMore),
    paging,
    title: latest?.documentTitle || latest?.dutyTitle || latest?.groupTitle || '',
    loadOlder() {
      const oldest = messages[0];
      if (!oldest || paging) return;
      setPaging(true);
      setBefore(oldest.createdAt);
    },
  };
}

function ThreadPane({ kind, entityId, title, onOpenEntity, onManage, onBack, showBack, onShowList }) {
  const api = THREAD_API[kind];
  const thread = useThreadMessages(kind, entityId);
  const groupState = useQuery(anyApi.chatHub.groupState, kind === 'group' ? { groupId: entityId } : 'skip');
  const sendMessage = useMutation(api.create);
  const recallMessage = useMutation(api.recall);
  const markRead = useMutation(anyApi.chatHub.markRead);
  const listRef = useRef(null);
  const scrollSnapshot = useRef(null);
  const [sending, setSending] = useState(false);
  const [recallingId, setRecallingId] = useState('');
  const [error, setError] = useState('');
  const [composerKey, setComposerKey] = useState(0);
  const heading = title || thread.title || (kind === 'group' ? 'Nhóm' : kind === 'duty' ? 'Công tác' : 'Công việc');
  const newestId = thread.messages[thread.messages.length - 1]?._id || '';
  const canSend = kind !== 'group' || groupState?.canSend !== false;

  useEffect(() => {
    void markRead({ threadKey: threadKeyFor(kind, entityId) }).catch(() => {});
  }, [kind, entityId, newestId, markRead]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const snap = scrollSnapshot.current;
    if (snap && !thread.paging) {
      node.scrollTop = node.scrollHeight - snap.height + snap.top;
      scrollSnapshot.current = null;
      return;
    }
    if (!thread.paging) node.scrollTop = node.scrollHeight;
  }, [newestId, thread.messages.length, thread.loading, thread.paging]);

  const handleSend = async (html) => {
    setSending(true);
    setError('');
    try {
      await sendMessage({ [api.idField]: entityId, bodyHtml: html });
      setComposerKey((value) => value + 1);
    } catch (err) {
      setError(chatErrorText(err));
    } finally {
      setSending(false);
    }
  };

  const handleRecall = async (item) => {
    setRecallingId(item._id);
    setError('');
    try {
      await recallMessage({ messageId: String(item._id) });
    } catch (err) {
      setError(chatErrorText(err));
    } finally {
      setRecallingId('');
    }
  };

  let previousDay = '';

  return (
    <section className="chat-hub-thread">
      <header className="chat-thread-head">
        {showBack ? (
          <button type="button" className="chat-icon-button chat-back-button" onClick={onBack} aria-label="Quay lại danh sách">
            ‹
          </button>
        ) : null}
        {onShowList ? (
          <button type="button" className="chat-icon-button chat-collapse-button" onClick={onShowList} aria-label="Hiện danh sách" title="Hiện danh sách">
            ›
          </button>
        ) : null}
        <div>
          <span className="chat-thread-kicker">{kind === 'duty' ? 'Công tác' : kind === 'work' ? 'Công việc' : 'Nhóm'}</span>
          <h2>{heading}</h2>
        </div>
        <div className="chat-thread-actions">
          {kind === 'work' ? (
            <button type="button" className="chat-text-button" onClick={() => onOpenEntity('work', entityId)}>Mở công việc</button>
          ) : null}
          {kind === 'duty' ? (
            <button type="button" className="chat-text-button" onClick={() => onOpenEntity('duty', entityId)}>Mở công tác</button>
          ) : null}
          {kind === 'group' ? (
            <button type="button" className="chat-text-button" onClick={onManage}>
              {groupState?.memberCount ? `${groupState.memberCount} thành viên` : 'Thành viên'}
            </button>
          ) : null}
        </div>
      </header>
      <div className="work-chat-list" ref={listRef} role="log" aria-live="polite" aria-relevant="additions">
        {thread.hasMore ? (
          <button
            type="button"
            className="chat-load-older"
            disabled={thread.paging}
            onClick={() => {
              const node = listRef.current;
              if (node) scrollSnapshot.current = { height: node.scrollHeight, top: node.scrollTop };
              thread.loadOlder();
            }}
          >
            {thread.paging ? 'Đang tải…' : 'Tin nhắn cũ hơn'}
          </button>
        ) : null}
        {thread.loading ? <p className="work-chat-empty">Đang tải tin nhắn…</p> : null}
        {!thread.loading && thread.messages.length === 0 ? (
          <p className="work-chat-empty">Chưa có tin nhắn. Hãy bắt đầu trao đổi.</p>
        ) : null}
        {thread.messages.map((item) => {
          const day = chatDayLabel(item.createdAt);
          const showDay = day !== previousDay;
          previousDay = day;
          return (
            <div key={item._id}>
              {showDay ? <div className="chat-day-separator"><span>{day}</span></div> : null}
              <DiscussionMessage item={item} recallingId={recallingId} onRecall={handleRecall} />
            </div>
          );
        })}
      </div>
      {error ? <p className="chat-form-error" role="alert">{error}</p> : null}
      {canSend ? (
        <DiscussionComposer
          key={composerKey}
          disabled={thread.loading}
          sending={sending}
          onSend={(html) => void handleSend(html)}
        />
      ) : (
        <p className="chat-list-empty">Bạn đang xem nhóm này. Chỉ thành viên mới gửi tin.</p>
      )}
    </section>
  );
}

export default function ChatHub({ path, onNavigate, onOpenEntity }) {
  const data = useQuery(anyApi.chatHub.list, {});
  const continueBackfill = useMutation(anyApi.chatHub.continueBackfill);
  const archiveMine = useMutation(anyApi.chatHub.archiveMine);
  const narrow = useNarrowLayout();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);
  const parsed = parseChatPath(path);
  const selected = parsed?.entityId ? { kind: parsed.kind, entityId: parsed.entityId } : null;
  useEffect(() => {
    if (!data?.backfillPending) return undefined;
    let cancelled = false;
    let timer = 0;
    const tick = async () => {
      if (cancelled) return;
      try {
        const result = await continueBackfill({});
        if (cancelled || result?.done) return;
        timer = window.setTimeout(() => void tick(), 40);
      } catch {
        if (!cancelled) timer = window.setTimeout(() => void tick(), 1500);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [data?.backfillPending, continueBackfill]);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* private mode */
      }
      return next;
    });
  };

  const conversations = data?.conversations || [];
  const visible = conversations.filter((item) => {
    if (filter !== 'all' && item.kind !== filter) return false;
    if (!search.trim()) return true;
    return matchesPickerSearch(`${item.title} ${item.lastBodyText}`, search);
  });
  const activeItem = selected
    ? conversations.find((item) => item.kind === selected.kind && item.entityId === selected.entityId)
    : null;
  const showList = !narrow || !selected;
  const listCollapsed = collapsed && !narrow;

  return (
    <div className={`chat-hub${listCollapsed ? ' is-list-collapsed' : ''}${selected ? ' is-reading' : ''}`}>
      {showList ? (
        <aside className="chat-hub-list" aria-label="Danh sách cuộc trò chuyện">
          <div className="chat-list-toolbar">
            <strong>Cuộc trò chuyện</strong>
            <button type="button" className="chat-text-button" onClick={() => setCreating(true)}>Tạo nhóm</button>
            <button
              type="button"
              className="chat-icon-button chat-collapse-button"
              onClick={toggleCollapsed}
              aria-label="Ẩn danh sách"
              title="Ẩn danh sách"
            >
              ‹
            </button>
          </div>
          <input
            className="chat-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm cuộc trò chuyện…"
            aria-label="Tìm cuộc trò chuyện"
          />
          <div className="chat-filters" role="tablist" aria-label="Lọc cuộc trò chuyện">
            {FILTERS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {data?.backfillPending ? <p className="chat-sync-note">Đang đồng bộ cuộc trò chuyện cũ…</p> : null}
          <div className="chat-conversation-list">
            {data === undefined ? <p className="chat-list-empty">Đang tải…</p> : null}
            {data && visible.length === 0 ? (
              <p className="chat-list-empty">
                {conversations.length === 0
                  ? 'Chưa có cuộc trò chuyện. Hãy tạo nhóm hoặc nhắn trong Công tác, Công việc.'
                  : 'Không có cuộc trò chuyện phù hợp.'}
              </p>
            ) : null}
            {visible.map((item) => {
              const active = selected?.kind === item.kind && selected?.entityId === item.entityId;
              const preview = listPreview(item, data?.currentUserId);
              return (
                <button
                  key={item.threadKey}
                  type="button"
                  className={`chat-conversation${active ? ' is-active' : ''}`}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onNavigate(item.kind, item.entityId)}
                >
                  <KindMark kind={item.kind} title={item.title} />
                  <span className="chat-conversation-copy">
                    <strong>{item.title || (item.kind === 'group' ? 'Nhóm' : 'Trao đổi')}</strong>
                    <small className={preview === RECALLED_PREVIEW ? 'is-recalled' : ''}>{preview}</small>
                  </span>
                  <span className="chat-conversation-meta">
                    <time dateTime={item.lastMessageAt ? new Date(item.lastMessageAt).toISOString() : undefined}>
                      {formatChatListTime(item.lastMessageAt)}
                    </time>
                    {item.unreadCount > 0 ? (
                      <span className="chat-unread">{item.unreadCount > 99 ? '99+' : item.unreadCount}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
      ) : null}
      {selected ? (
        <ThreadErrorBoundary
          resetKey={`${selected.kind}:${selected.entityId}`}
          fallback={(error) => (
            <section className="chat-hub-thread">
              <header className="chat-thread-head">
                {narrow ? (
                  <button type="button" className="chat-icon-button chat-back-button" onClick={() => onNavigate()} aria-label="Quay lại danh sách">‹</button>
                ) : null}
                <h2>Không mở được cuộc trò chuyện</h2>
              </header>
              <div className="chat-thread-error">
                <p>{chatErrorText(error)}</p>
                <button
                  type="button"
                  className="chat-text-button"
                  onClick={() => {
                    void archiveMine({ threadKey: threadKeyFor(selected.kind, selected.entityId) });
                    onNavigate();
                  }}
                >
                  Ẩn cuộc trò chuyện
                </button>
              </div>
            </section>
          )}
        >
          <ThreadPane
            kind={selected.kind}
            entityId={selected.entityId}
            title={activeItem?.title || ''}
            showBack={narrow}
            onBack={() => onNavigate()}
            onOpenEntity={onOpenEntity}
            onManage={() => setManaging(true)}
            onShowList={listCollapsed ? toggleCollapsed : null}
          />
        </ThreadErrorBoundary>
      ) : (
        <section className="chat-hub-thread">
          {listCollapsed ? (
            <header className="chat-thread-head">
              <button type="button" className="chat-icon-button" onClick={toggleCollapsed} aria-label="Hiện danh sách" title="Hiện danh sách">
                ›
              </button>
              <h2>Trao đổi</h2>
            </header>
          ) : null}
          <div className="chat-thread-empty">
            <p>Chọn một cuộc trò chuyện để bắt đầu.</p>
          </div>
        </section>
      )}
      {creating ? (
        <CreateGroupDialog
          onClose={() => setCreating(false)}
          onCreated={(groupId) => {
            setCreating(false);
            onNavigate('group', groupId);
          }}
        />
      ) : null}
      {managing && selected?.kind === 'group' ? (
        <ManageGroupDialog
          groupId={selected.entityId}
          onClose={() => setManaging(false)}
          onLeft={() => {
            setManaging(false);
            onNavigate();
          }}
        />
      ) : null}
    </div>
  );
}
