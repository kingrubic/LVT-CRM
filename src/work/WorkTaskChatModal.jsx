import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { ChatBubbleIcon, WorkIconButton } from './WorkCardIcons';

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

function WorkChatComposer({ disabled, sending, onSend }) {
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

export function WorkChatButton({ documentId, title }) {
  const [open, setOpen] = useState(false);
  if (!documentId) return null;
  return (
    <>
      <WorkIconButton
        className="work-chat-button"
        title="Trao đổi công việc"
        onClick={() => setOpen(true)}
      >
        <ChatBubbleIcon />
      </WorkIconButton>
      {open ? (
        <WorkTaskChatModal
          documentId={documentId}
          title={title}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export default function WorkTaskChatModal({ documentId, title, onClose }) {
  const titleId = useId();
  const listRef = useRef(null);
  const sendMessage = useMutation(anyApi.workMessages.create);
  const data = useQuery(anyApi.workMessages.list, documentId ? { documentId } : 'skip');
  const [sending, setSending] = useState(false);
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
      await sendMessage({ documentId, bodyHtml: html });
      setComposerKey((value) => value + 1);
    } catch (err) {
      const code = String(err?.message || '');
      if (code.includes('WORK_CHAT_EMPTY')) setError('Vui lòng nhập nội dung tin nhắn.');
      else if (code.includes('WORK_CHAT_TOO_LONG')) setError('Tin nhắn quá dài (tối đa 4000 ký tự).');
      else if (code.includes('WORK_CHAT_FORBIDDEN')) setError('Bạn không có quyền trao đổi công việc này.');
      else setError('Không gửi được tin nhắn. Vui lòng thử lại.');
    } finally {
      setSending(false);
    }
  };

  const messages = data?.messages || [];
  const heading = title || data?.documentTitle || 'Công việc';

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
        <p className="work-modal-context">Tin nhắn hiển thị cho người đã thấy công việc này.</p>
        <div className="work-chat-list" ref={listRef} role="log" aria-live="polite" aria-relevant="additions">
          {data === undefined ? (
            <p className="work-chat-empty">Đang tải tin nhắn…</p>
          ) : messages.length === 0 ? (
            <p className="work-chat-empty">Chưa có tin nhắn. Hãy bắt đầu trao đổi.</p>
          ) : (
            messages.map((item) => (
              <article
                key={item._id}
                className={`work-chat-bubble${item.isSelf ? ' is-self' : ''}`}
              >
                <span className="work-person-avatar" aria-hidden="true">{item.authorInitials}</span>
                <div className="work-chat-bubble-body">
                  <header>
                    <strong>{item.authorName}</strong>
                    <time dateTime={new Date(item.createdAt).toISOString()}>{formatChatTime(item.createdAt)}</time>
                  </header>
                  <div
                    className="work-chat-html"
                    dangerouslySetInnerHTML={{ __html: item.bodyHtml }}
                  />
                </div>
              </article>
            ))
          )}
        </div>
        {error ? <div className="work-feedback error">{error}</div> : null}
        <WorkChatComposer
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
