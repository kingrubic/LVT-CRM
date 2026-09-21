import React, { Component, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery } from 'convex/react';
import { ChatBubbleIcon, CardIconButton } from './CardActionIcons';
import { chatNotificationOpensThread, claimChatAutoOpen, useChatAutoOpen } from './chatAutoOpen';
import '../work/work.css';

const RECALL_WINDOW_MS = 15 * 60 * 1000;
const RECALLED_PLACEHOLDER = 'Tin nhắn đã được thu hồi';

class DiscussionQueryBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      const code = String(this.state.error?.message || '');
      const forbidden = /WORK_CHAT_FORBIDDEN|DUTY_CHAT_FORBIDDEN/.test(code);
      return this.props.fallback(forbidden
        ? 'Bạn không có quyền trao đổi mục này.'
        : 'Không tải được tin nhắn.');
    }
    return this.props.children;
  }
}

const TOOLBAR = [
  { command: 'bold', label: 'In đậm', hint: 'B' },
  { command: 'italic', label: 'In nghiêng', hint: 'I' },
  { command: 'underline', label: 'Gạch chân', hint: 'U' },
  { command: 'insertUnorderedList', label: 'Danh sách', hint: '•' },
  { command: 'insertOrderedList', label: 'Danh sách đánh số', hint: '1.' },
];

function formatChatTime(value) {
  if (!value) return '';
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

function editorIsEmpty(node) {
  if (!node) return true;
  const text = String(node.innerText || node.textContent || '')
    .replace(/\u00a0/g, ' ')
    .trim();
  return !text;
}

function DiscussionComposer({ disabled, sending, onSend }) {
  const editorRef = useRef(null);
  const [empty, setEmpty] = useState(true);

  const syncEmpty = () => {
    setEmpty(editorIsEmpty(editorRef.current));
  };

  const apply = (command) => {
    const editor = editorRef.current;
    if (!editor || disabled) return;
    editor.focus();
    try {
      document.execCommand('styleWithCSS', false, 'false');
    } catch {
      /* older browsers ignore styleWithCSS */
    }
    try {
      document.execCommand(command, false);
    } catch {
      /* execCommand is the lightweight composer already used by browsers */
    }
    syncEmpty();
  };

  const submit = () => {
    const editor = editorRef.current;
    if (!editor || disabled || sending || editorIsEmpty(editor)) return;
    onSend(editor.innerHTML);
  };

  return (
    <div className="work-chat-composer">
      <div className="work-chat-toolbar" role="toolbar" aria-label="Định dạng tin nhắn">
        {TOOLBAR.map((item) => (
          <button
            key={item.command}
            type="button"
            className="work-chat-tool"
            title={item.label}
            aria-label={item.label}
            disabled={disabled || sending}
            onMouseDown={(event) => {
              event.preventDefault();
              apply(item.command);
            }}
          >
            {item.hint}
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        className={`work-chat-editor${empty ? ' is-empty' : ''}`}
        contentEditable={!disabled && !sending}
        role="textbox"
        aria-multiline="true"
        aria-label="Nội dung tin nhắn"
        data-placeholder="Nhập tin nhắn…"
        onInput={syncEmpty}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          }
        }}
        suppressContentEditableWarning
      />
      <div className="work-chat-composer-actions">
        <button
          type="button"
          className="work-primary-button"
          disabled={disabled || sending || empty}
          onClick={submit}
        >
          {sending ? 'Đang gửi…' : 'Gửi'}
        </button>
      </div>
    </div>
  );
}

function useRecallStillOpen(createdAt, recalled) {
  const [open, setOpen] = useState(
    !recalled && Date.now() - Number(createdAt || 0) <= RECALL_WINDOW_MS,
  );
  useEffect(() => {
    if (recalled) {
      setOpen(false);
      return undefined;
    }
    const remaining = RECALL_WINDOW_MS - (Date.now() - Number(createdAt || 0));
    if (remaining <= 0) {
      setOpen(false);
      return undefined;
    }
    setOpen(true);
    const timer = window.setTimeout(() => setOpen(false), remaining);
    return () => window.clearTimeout(timer);
  }, [createdAt, recalled]);
  return open;
}

function DiscussionMessage({ item, onRecall, recallingId }) {
  const recallOpen = useRecallStillOpen(item.createdAt, item.recalled);
  const showRecall = Boolean(item.canRecall && item.isSelf && recallOpen && onRecall);
  return (
    <article
      className={`work-chat-bubble${item.isSelf ? ' is-self' : ''}${item.recalled ? ' is-recalled' : ''}`}
    >
      <span className="work-person-avatar" aria-hidden="true">{item.authorInitials}</span>
      <div className="work-chat-bubble-body">
        <header>
          <strong>{item.authorName}</strong>
          <time dateTime={new Date(item.createdAt).toISOString()}>{formatChatTime(item.createdAt)}</time>
        </header>
        {item.recalled ? (
          <p className="work-chat-recalled">{RECALLED_PLACEHOLDER}</p>
        ) : (
          <div
            className="work-chat-html"
            dangerouslySetInnerHTML={{ __html: item.bodyHtml }}
          />
        )}
        {showRecall ? (
          <button
            type="button"
            className="work-chat-recall"
            title="Thu hồi tin nhắn"
            aria-label="Thu hồi tin nhắn"
            disabled={recallingId === item._id}
            onClick={() => onRecall(item)}
          >
            ×
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function DiscussionChatButton({
  entityId,
  title,
  listQuery,
  createMutation,
  recallMutation,
  idField,
  buttonTitle,
  contextText,
  fallbackTitle,
  titleField = 'documentTitle',
}) {
  const [open, setOpen] = useState(false);
  const autoOpen = useChatAutoOpen();
  useEffect(() => {
    if (!chatNotificationOpensThread(autoOpen, { idField, entityId })) return;
    if (!claimChatAutoOpen(autoOpen.token, entityId)) return;
    setOpen(true);
  }, [autoOpen?.token, autoOpen?.sourceId, autoOpen?.sourceType, entityId, idField]);
  if (!entityId) return null;
  return (
    <span data-chat-entity={entityId}>
      <CardIconButton
        className="work-chat-button"
        title={buttonTitle}
        onClick={() => setOpen(true)}
      >
        <ChatBubbleIcon />
      </CardIconButton>
      {open ? (
        <DiscussionQueryBoundary
          fallback={(message) => (
            <DiscussionErrorPanel
              title={title || fallbackTitle}
              message={message}
              onClose={() => setOpen(false)}
            />
          )}
        >
          <DiscussionModal
            entityId={entityId}
            title={title}
            listQuery={listQuery}
            createMutation={createMutation}
            recallMutation={recallMutation}
            idField={idField}
            contextText={contextText}
            fallbackTitle={fallbackTitle}
            titleField={titleField}
            onClose={() => setOpen(false)}
          />
        </DiscussionQueryBoundary>
      ) : null}
    </span>
  );
}

function DiscussionErrorPanel({ title, message, onClose }) {
  return createPortal(
    <div className="work-modal-backdrop work-chat-backdrop" role="presentation" onClick={onClose}>
      <section
        className="work-modal work-chat-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="work-modal-close" onClick={onClose} aria-label="Đóng">
          ×
        </button>
        <span className="work-kicker">TRAO ĐỔI</span>
        <h3>{title || 'Trao đổi'}</h3>
        <p className="work-chat-empty">{message}</p>
      </section>
    </div>,
    document.body,
  );
}

export default function DiscussionModal({
  entityId,
  title,
  listQuery,
  createMutation,
  recallMutation,
  idField,
  contextText,
  fallbackTitle,
  titleField = 'documentTitle',
  onClose,
}) {
  const titleId = useId();
  const listRef = useRef(null);
  const sendMessage = useMutation(createMutation);
  const recallMessage = useMutation(recallMutation);
  const data = useQuery(listQuery, entityId ? { [idField]: entityId } : 'skip');
  const [sending, setSending] = useState(false);
  const [recallingId, setRecallingId] = useState('');
  const [error, setError] = useState('');
  const [composerKey, setComposerKey] = useState(0);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !sending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, sending]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [data?.messages?.length]);

  const handleSend = async (html) => {
    setSending(true);
    setError('');
    try {
      await sendMessage({ [idField]: entityId, bodyHtml: html });
      setComposerKey((value) => value + 1);
    } catch (err) {
      const code = String(err?.message || '');
      if (code.includes('WORK_CHAT_EMPTY') || code.includes('DUTY_CHAT_EMPTY')) {
        setError('Vui lòng nhập nội dung tin nhắn.');
      } else if (code.includes('WORK_CHAT_TOO_LONG') || code.includes('DUTY_CHAT_TOO_LONG')) {
        setError('Tin nhắn quá dài (tối đa 4000 ký tự).');
      } else if (code.includes('WORK_CHAT_FORBIDDEN') || code.includes('DUTY_CHAT_FORBIDDEN')) {
        setError('Bạn không có quyền trao đổi mục này.');
      } else {
        setError('Không gửi được tin nhắn. Vui lòng thử lại.');
      }
    } finally {
      setSending(false);
    }
  };

  const handleRecall = async (item) => {
    if (!recallMessage || !item?._id) return;
    setRecallingId(item._id);
    setError('');
    try {
      await recallMessage({ messageId: String(item._id) });
    } catch (err) {
      const code = String(err?.message || '');
      if (code.includes('RECALL_TOO_LATE')) {
        setError('Đã quá 15 phút, không thể thu hồi tin nhắn này.');
      } else if (code.includes('RECALL_FORBIDDEN')) {
        setError('Bạn chỉ có thể thu hồi tin nhắn của mình.');
      } else {
        setError('Không thu hồi được tin nhắn. Vui lòng thử lại.');
      }
    } finally {
      setRecallingId('');
    }
  };

  const messages = data?.messages || [];
  const heading = title || data?.[titleField] || fallbackTitle;

  return createPortal(
    <div className="work-modal-backdrop work-chat-backdrop" role="presentation" onClick={sending ? undefined : onClose}>
      <section
        className="work-modal work-chat-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="work-modal-close" onClick={onClose} aria-label="Đóng" disabled={sending}>
          ×
        </button>
        <span className="work-kicker">TRAO ĐỔI</span>
        <h3 id={titleId}>{heading}</h3>
        <p className="work-modal-context">{contextText}</p>
        <div className="work-chat-list" ref={listRef} role="log" aria-live="polite" aria-relevant="additions">
          {data === undefined ? (
            <p className="work-chat-empty">Đang tải tin nhắn…</p>
          ) : messages.length === 0 ? (
            <p className="work-chat-empty">Chưa có tin nhắn. Hãy bắt đầu trao đổi.</p>
          ) : (
            messages.map((item) => (
              <DiscussionMessage
                key={item._id}
                item={item}
                recallingId={recallingId}
                onRecall={recallMessage ? handleRecall : null}
              />
            ))
          )}
        </div>
        {error ? <div className="work-feedback error">{error}</div> : null}
        <DiscussionComposer
          key={composerKey}
          disabled={data === undefined}
          sending={sending}
          onSend={(html) => void handleSend(html)}
        />
      </section>
    </div>,
    document.body,
  );
}
