import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useNotificationFocus } from '../notifications/useNotificationFocus';
import WorkAssignmentRows from './WorkAssignmentRows';
import WorkCreatePreview from './WorkCreatePreview';
import { DutyListHeading } from '../duties/DutyListFilters';
import { WorkListEmpty, WorkListSearch, WorkListTabs } from './WorkListFilters';
import WorkListSummary from './WorkListSummary';
import {
  assignmentsFromDocument,
  emptyWorkSearch,
  filterWorksBySearch,
  filterWorksByTab,
  formatWorkDate,
  WORK_LIST_TAB_UPCOMING,
  workAssignmentPayload,
} from './workDisplay';
import './work.css';

const ACCEPTED_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'xls', 'png', 'jpg', 'jpeg'];

function workUploadErrorMessage(code) {
  if (code === 'UPLOAD_REGISTRATION_FAILED') {
    return 'Tệp đã đến Google Drive nhưng hệ thống chưa thể đăng ký công văn. Vui lòng liên hệ quản trị viên và cung cấp thời điểm xảy ra lỗi.';
  }
  if (code === 'DRIVE_UPLOAD_FAILED') {
    return 'Google Drive chưa nhận được tệp công văn. Vui lòng thử lại sau.';
  }
  if (code === 'FILE_ACCESS_DENIED') {
    return 'Bạn không có quyền tải tệp công văn lên.';
  }
  return 'Không thể tải tệp công văn lên. Vui lòng thử lại.';
}

function fileSizeLabel(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function settleWorkUploadedFile(fetchAccessToken, cleanupToken, committed) {
  const token = await fetchAccessToken({ forceRefreshToken: false });
  if (!token) throw new Error('AUTH_REQUIRED');
  const response = await fetch(`/api/files/uploads/${encodeURIComponent(cleanupToken)}`, {
    method: committed ? 'POST' : 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 404) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || `WORK_UPLOAD_SETTLEMENT_FAILED:${response.status}`);
  }
}

async function settleWorkCleanupJob(fetchAccessToken, cleanupJobId) {
  if (!cleanupJobId) return;
  const token = await fetchAccessToken({ forceRefreshToken: false });
  if (!token) throw new Error('AUTH_REQUIRED');
  const response = await fetch(`/api/files/cleanup-jobs/work/${encodeURIComponent(cleanupJobId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 404) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || `WORK_CLEANUP_FAILED:${response.status}`);
  }
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.4 12s3.5-6 9.6-6 9.6 6 9.6 6-3.5 6-9.6 6-9.6-6-9.6-6Z" />
      <circle cx="12" cy="12" r="2.7" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M5 20h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function PrivateFileLink({
  documentId,
  fileName,
  fileUrl,
  privateFile,
  className = '',
  children,
}) {
  const { fetchAccessToken } = useConvexAuth();
  const [busyAction, setBusyAction] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const closeButtonRef = useRef(null);
  const extension = fileName?.toLowerCase().split('.').pop() || '';
  const canPreview = ['pdf', 'png', 'jpg', 'jpeg'].includes(extension);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (!previewUrl) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setPreviewUrl('');
    };
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      window.document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [previewUrl]);

  if (!documentId || !privateFile) return null;

  const fetchFileBlob = async () => {
    const headers = new Headers();
    const token = await fetchAccessToken({ forceRefreshToken: false });
    if (!token) throw new Error('AUTH_REQUIRED');
    headers.set('Authorization', 'Bearer ' + token);
    const basePath = `/api/files/${encodeURIComponent(documentId)}`;
    const metadataResponse = await fetch(`${basePath}/metadata`, { headers, cache: 'no-store' });
    if (!metadataResponse.ok) {
      if ('caches' in window) {
        const cache = await window.caches.open('lvt-work-files-v1');
        for (const request of await cache.keys()) {
          if (new URL(request.url).pathname === basePath) await cache.delete(request);
        }
      }
      throw new Error(`FILE_METADATA_FAILED:${metadataResponse.status}`);
    }
    const metadata = await metadataResponse.json();
    const versionedURL = `${basePath}?v=${encodeURIComponent(metadata.fileVersion)}`;
    if ('caches' in window) {
      const cache = await window.caches.open('lvt-work-files-v1');
      const cached = await cache.match(versionedURL);
      if (cached) return cached.blob();
      const response = await fetch(basePath, { headers });
      if (!response.ok) throw new Error(`FILE_DOWNLOAD_FAILED:${response.status}`);
      await cache.put(versionedURL, response.clone());
      for (const request of await cache.keys()) {
        if (new URL(request.url).pathname === basePath && request.url !== new URL(versionedURL, window.location.origin).href) {
          await cache.delete(request);
        }
      }
      return response.blob();
    }
    const response = await fetch(basePath, { headers });
    if (!response.ok) throw new Error(`FILE_DOWNLOAD_FAILED:${response.status}`);
    return response.blob();
  };

  const runFileAction = async (action) => {
    if (busyAction) return;
    setBusyAction(action);
    try {
      const objectUrl = URL.createObjectURL(await fetchFileBlob());
      if (action === 'preview') {
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return objectUrl;
        });
      } else {
        const anchor = window.document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = fileName || 'cong-van';
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
    } catch (error) {
      console.error('Document file action failed', error);
      window.alert('Không thể mở tệp công văn. Vui lòng đăng nhập lại hoặc liên hệ quản trị viên.');
    } finally {
      setBusyAction('');
    }
  };

  const closePreview = () => setPreviewUrl('');

  return (
    <>
      <span className={`${className} work-file-actions`.trim()}>
        <span className="work-file-name">{children}</span>
        {canPreview ? (
          <button
            type="button"
            className="work-file-icon-button"
            onClick={() => void runFileAction('preview')}
            disabled={Boolean(busyAction)}
            aria-label={`Xem trước ${fileName}`}
            title="Xem trước"
          >
            <EyeIcon />
          </button>
        ) : null}
        <button
          type="button"
          className="work-file-icon-button"
          onClick={() => void runFileAction('download')}
          disabled={Boolean(busyAction)}
          aria-label={`Tải xuống ${fileName}`}
          title="Tải xuống"
        >
          <DownloadIcon />
        </button>
        {busyAction ? <span className="work-file-busy" role="status">Đang tải…</span> : null}
      </span>
      {previewUrl ? createPortal((
        <div className="work-file-preview-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closePreview();
        }}>
          <section className="work-file-preview-dialog" role="dialog" aria-modal="true" aria-label={`Xem trước ${fileName}`}>
            <header>
              <strong>{fileName}</strong>
              <div>
                <button type="button" className="work-file-preview-action" onClick={() => void runFileAction('download')}>
                  <DownloadIcon />
                  <span>Tải xuống</span>
                </button>
                <button
                  ref={closeButtonRef}
                  type="button"
                  className="work-file-preview-close"
                  onClick={closePreview}
                  aria-label="Đóng xem trước"
                >
                  <CloseIcon />
                </button>
              </div>
            </header>
            <div className="work-file-preview-content">
              {extension === 'pdf' ? (
                <iframe src={previewUrl} title={`Nội dung ${fileName}`} />
              ) : (
                <img src={previewUrl} alt={`Xem trước ${fileName}`} />
              )}
            </div>
          </section>
        </div>
      ), window.document.body) : null}
    </>
  );
}

function workStatusLabel(status) {
  return {
    pending: 'Chờ duyệt',
    approved: 'Đã duyệt',
    rejected: 'Không duyệt',
    unassigned: 'Chưa giao việc',
    in_progress: 'Đang thực hiện',
    completed: 'Đã hoàn thành',
    completed_late: 'Hoàn thành trễ',
    pending_completion: 'Chờ duyệt hoàn thành',
    rejected_completion: 'Bị từ chối hoàn thành',
    not_completed: 'Chưa hoàn thành',
    overdue: 'Quá hạn',
    pending_task: 'Chưa hoàn thành',
  }[status] || 'Chưa cập nhật';
}

function WorkStatus({ status }) {
  return <span className={`work-status ${status || 'pending'}`}>{workStatusLabel(status)}</span>;
}

function WorkFileDropzone({ file, onFile }) {
  const [dragging, setDragging] = useState(false);
  const handleFile = (candidate) => {
    if (!candidate) return;
    const extension = candidate.name.toLowerCase().split('.').pop();
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      onFile(null, 'Chỉ chấp nhận PDF, DOCX, Excel, PNG hoặc JPG.');
      return;
    }
    if (candidate.size > 20 * 1024 * 1024) {
      onFile(null, 'Dung lượng tệp tối đa là 20MB.');
      return;
    }
    onFile(candidate, '');
  };
  return (
    <label
      className={`work-file-dropzone ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        handleFile(event.dataTransfer.files?.[0]);
      }}
    >
      <input
        type="file"
        accept=".pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />
      <span className="work-file-orbit">↥</span>
      {file ? (
        <>
          <strong>{file.name}</strong>
          <small>{fileSizeLabel(file.size)} · Nhấn để đổi tệp</small>
        </>
      ) : (
        <>
          <strong>Kéo thả công văn vào đây</strong>
          <small>hoặc bấm để chọn · PDF, DOCX, Excel, PNG, JPG · tối đa 20MB</small>
        </>
      )}
    </label>
  );
}

function DepartmentProgress({ status, taskCount }) {
  return (
    <div className="work-progress">
      <div className="work-progress-head">
        <span>Tiến độ phòng ban</span>
        <WorkStatus status={status} />
      </div>
      <div className="work-progress-track">
        <span className={status === 'completed' ? 'is-complete' : ''} />
      </div>
      <small>
        {status === 'unassigned'
          ? 'Chưa có đầu mục cá nhân nào được giao.'
          : `${taskCount || 0} đầu mục cá nhân đang theo dõi.`}
      </small>
    </div>
  );
}

function CompletionSubmitModal({ title, onClose, onSubmit, saving }) {
  const { fetchAccessToken } = useConvexAuth();
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    if (!file) {
      setError('Vui lòng đính kèm file bằng chứng hoàn thành.');
      return;
    }
    setError('');
    try {
      const token = await fetchAccessToken({ forceRefreshToken: false });
      if (!token) throw new Error('AUTH_REQUIRED');
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': file.type || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name),
        },
        body: file,
      });
      const uploaded = await response.json().catch(() => null);
      if (!response.ok || !uploaded?.driveFileId || !uploaded?.cleanupToken) {
        throw new Error(uploaded?.error || `WORK_UPLOAD_FAILED:${response.status}`);
      }
      await onSubmit({
        uploaded: {
          driveFileId: uploaded.driveFileId,
          driveChecksum: uploaded.driveChecksum,
          cleanupToken: uploaded.cleanupToken,
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          fileSize: file.size,
        },
      });
    } catch (submitError) {
      setError('Không thể tải bằng chứng lên. Vui lòng thử lại.');
      console.error(submitError);
    }
  };
  return (
    <div className="work-modal-backdrop" role="presentation">
      <form className="work-modal" onSubmit={submit}>
        <button type="button" className="work-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        <span className="work-kicker">Nộp công việc</span>
        <h3>{title}</h3>
        <p className="work-modal-context">Đính kèm file bằng chứng hoàn thành rồi bấm Nộp. Người tạo việc sẽ đánh dấu hoàn thành.</p>
        <WorkFileDropzone
          file={file}
          onFile={(nextFile, fileError) => {
            setFile(nextFile);
            if (fileError) setError(fileError);
          }}
        />
        {error ? <div className="work-feedback error">{error}</div> : null}
        <div className="work-modal-actions">
          <button type="button" className="work-ghost-button" onClick={onClose}>Hủy</button>
          <button type="submit" className="work-primary-button" disabled={saving}>
            {saving ? 'Đang nộp…' : 'Nộp'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CompletionReviewModal({ item, onClose, onSubmit, saving }) {
  const [qualityPercent, setQualityPercent] = useState('100');
  const [rejectionReason, setRejectionReason] = useState('');
  const [mode, setMode] = useState('approve');
  const [error, setError] = useState('');
  const submit = (event) => {
    event.preventDefault();
    if (mode === 'approve') {
      const value = Number(qualityPercent);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        setError('Phần trăm hoàn thành phải từ 0 đến 100.');
        return;
      }
      if (value < 50 && !window.confirm('% quá thấp, bạn có chắc duyệt công việc này không?')) {
        return;
      }
      onSubmit({ decision: 'approve', qualityPercent: Math.round(value) });
      return;
    }
    if (!rejectionReason.trim()) {
      setError('Vui lòng nhập lý do chưa duyệt.');
      return;
    }
    onSubmit({ decision: 'reject', rejectionReason: rejectionReason.trim() });
  };
  return (
    <div className="work-modal-backdrop" role="presentation">
      <form className="work-modal" onSubmit={submit}>
        <button type="button" className="work-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        <span className="work-kicker">Duyệt hoàn thành</span>
        <h3>{item.content}</h3>
        <p className="work-modal-context">
          {item.userName} · {item.departmentName} · Hạn {formatWorkDate(item.deadline)}
          {item.submittedLate ? ' · Nộp trễ' : ''}
        </p>
        <div className="work-assignment-actions">
          <button type="button" className={`work-outline-button ${mode === 'approve' ? 'is-active' : ''}`} onClick={() => setMode('approve')}>Duyệt</button>
          <button type="button" className={`work-outline-button ${mode === 'reject' ? 'is-active' : ''}`} onClick={() => setMode('reject')}>Chưa duyệt</button>
        </div>
        {mode === 'approve' ? (
          <>
            <label className="work-field-label" htmlFor="review-quality">Mức độ hoàn thành (%) — bắt buộc</label>
            <input
              id="review-quality"
              type="number"
              min="0"
              max="100"
              step="1"
              value={qualityPercent}
              onChange={(event) => setQualityPercent(event.target.value)}
              required
            />
          </>
        ) : (
          <>
            <label className="work-field-label" htmlFor="review-reason">Lý do chưa duyệt</label>
            <textarea
              id="review-reason"
              rows={4}
              maxLength={500}
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              placeholder="Nêu rõ phần cần bổ sung/sửa…"
              required
            />
          </>
        )}
        {error ? <div className="work-feedback error">{error}</div> : null}
        <div className="work-modal-actions">
          <button type="button" className="work-ghost-button" onClick={onClose}>Hủy</button>
          <button type="submit" className={mode === 'approve' ? 'work-primary-button' : 'work-reject-button'} disabled={saving}>
            {saving ? 'Đang lưu…' : mode === 'approve' ? 'Duyệt hoàn thành' : 'Trả về user'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function WorkManagement({ allowCreate = true, hideCompletionQueue = false, focusTarget = null }) {
  const options = useQuery(anyApi.work.formOptions, allowCreate ? {} : 'skip');
  const listData = useQuery(anyApi.work.listAdmin);
  const createDocument = useMutation(anyApi.work.createDocument);
  const updateDocument = useMutation(anyApi.work.updateDocument);
  const deleteDocument = useMutation(anyApi.work.deleteDocument);
  const { fetchAccessToken } = useConvexAuth();
  const reviewWorkCompletion = useMutation(anyApi.work.reviewWorkCompletion);
  const reviewPersonalCompletion = useMutation(anyApi.work.reviewPersonalCompletion);
  const [open, setOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [assignments, setAssignments] = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [listTab, setListTab] = useState(WORK_LIST_TAB_UPCOMING);
  const [listSearch, setListSearch] = useState(emptyWorkSearch);
  const [expanded, setExpanded] = useState(null);
  const [approverIds, setApproverIds] = useState([]);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);
  const [pendingSettlement, setPendingSettlement] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [reviewSaving, setReviewSaving] = useState(false);

  useNotificationFocus(focusTarget, {
    acceptSourceTypes: ['approval', 'department_work', 'personal_task', 'completion_rejected'],
  });

  const documents = listData?.documents || [];
  const pendingCompletionReviews = listData?.pendingCompletionReviews || [];
  const visibleDocuments = useMemo(() => filterWorksByTab(documents, listTab), [documents, listTab]);
  const filteredDocuments = useMemo(
    () => filterWorksBySearch(visibleDocuments, listSearch),
    [visibleDocuments, listSearch],
  );

  const reset = () => {
    setEditingDocument(null);
    setFile(null);
    setTitle('');
    setAssignments([]);
    setApproverIds([]);
    setPreviewOpen(false);
  };

  const closeEditor = () => {
    reset();
    setOpen(false);
  };

  const startEdit = (document) => {
    setEditingDocument(document);
    setFile(null);
    setTitle(document.title || document.fileName || '');
    setApproverIds([]);
    setAssignments(assignmentsFromDocument(document));
    setPreviewOpen(false);
    setFeedback({ type: '', text: '' });
    setOpen(true);
    window.requestAnimationFrame(() => {
      window.document.getElementById('work-document-editor')?.scrollIntoView({ behavior: 'smooth' });
    });
  };

  const persistWork = async () => {
    if (saving) return;
    setFeedback({ type: '', text: '' });
    if (pendingSettlement) {
      setSaving(true);
      try {
        await settleWorkUploadedFile(fetchAccessToken, pendingSettlement.cleanupToken, true);
        await settleWorkCleanupJob(fetchAccessToken, pendingSettlement.cleanupJobId).catch((cleanupError) => {
          console.error('Work old file cleanup deferred', cleanupError);
        });
        setPendingSettlement(null);
        setFeedback({ type: 'success', text: 'Đã tạo công việc.' });
        closeEditor();
      } catch (settlementError) {
        console.error('Work upload settlement retry failed', settlementError);
        setFeedback({
          type: 'error',
          text: 'Công văn đã được tạo và tệp vẫn được giữ an toàn, nhưng chưa thể hoàn tất upload. Vui lòng thử lại.',
        });
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!title.trim()) {
      return setFeedback({ type: 'error', text: 'Vui lòng nhập tên công việc.' });
    }
    if (!assignments.length) {
      return setFeedback({ type: 'error', text: 'Vui lòng thêm ít nhất một phân công.' });
    }
    setSaving(true);
    let stage = file ? 'upload' : 'save';
    let uploaded = null;
    let saved = null;
    let crmCommitted = false;
    try {
      if (file) {
        const token = await fetchAccessToken({ forceRefreshToken: false });
        if (!token) throw new Error('AUTH_REQUIRED');
        const response = await fetch('/api/files/upload', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': file.type || 'application/octet-stream',
            'X-File-Name': encodeURIComponent(file.name),
          },
          body: file,
        });
        uploaded = await response.json().catch(() => null);
        if (!response.ok || !uploaded?.driveFileId || !uploaded?.cleanupToken) {
          throw new Error(uploaded?.error || `WORK_UPLOAD_FAILED:${response.status}`);
        }
      }
      stage = 'save';
      const workflow = {
        title: title.trim(),
        assignments: workAssignmentPayload(assignments),
      };
      const fileArgs = uploaded ? {
        driveFileId: uploaded.driveFileId,
        driveChecksum: uploaded.driveChecksum,
        cleanupToken: uploaded.cleanupToken,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
      } : editingDocument ? {} : {
        fileName: '',
        fileType: '',
        fileSize: 0,
      };
      saved = editingDocument
        ? await updateDocument({ documentId: editingDocument._id, ...workflow, ...fileArgs })
        : await createDocument({ ...workflow, ...fileArgs });
      crmCommitted = true;
      if (uploaded) {
        stage = 'settlement';
        await settleWorkUploadedFile(fetchAccessToken, uploaded.cleanupToken, true);
      }
      await settleWorkCleanupJob(fetchAccessToken, saved?.cleanupJobId).catch((cleanupError) => {
        console.error('Work old file cleanup deferred', cleanupError);
      });
      setFeedback({
        type: 'success',
        text: editingDocument ? 'Đã cập nhật công việc.' : 'Đã tạo công việc.',
      });
      closeEditor();
    } catch (error) {
      if (crmCommitted) {
        setPendingSettlement({ ...uploaded, cleanupJobId: saved?.cleanupJobId });
        setFeedback({
          type: 'error',
          text: 'Công văn đã được tạo và tệp vẫn được giữ an toàn, nhưng chưa thể hoàn tất upload. Vui lòng thử lại.',
        });
      } else if (uploaded?.cleanupToken) {
        try {
          await settleWorkUploadedFile(fetchAccessToken, uploaded.cleanupToken, false);
        } catch (cleanupError) {
          console.error('Work orphan upload cleanup failed', cleanupError);
        }
        setFeedback({
          type: 'error',
          text: 'Tệp đã tải lên nhưng không thể lưu công văn. Vui lòng kiểm tra thông tin phân công và người duyệt.',
        });
      } else {
        setFeedback({
          type: 'error',
          text: workUploadErrorMessage(error?.message),
        });
      }
      console.error('Work document submission failed', {
        stage,
        message: String(error?.message || error),
      });
    } finally {
      setSaving(false);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    if (pendingSettlement || editingDocument) {
      void persistWork();
      return;
    }
    if (!assignments.length) {
      setFeedback({ type: 'error', text: 'Vui lòng thêm ít nhất một phân công.' });
      return;
    }
    setPreviewOpen(true);
  };

  if ((allowCreate && options === undefined) || listData === undefined) {
    return <div className="work-loading">Đang chuẩn bị sổ công việc…</div>;
  }

  const removeDocument = async (document) => {
    if (!window.confirm(`Xóa công việc ${document.title || document.fileName}?`)) return;
    setSaving(true);
    setFeedback({ type: '', text: '' });
    try {
      const result = await deleteDocument({ documentId: document._id });
      await settleWorkCleanupJob(fetchAccessToken, result?.cleanupJobId).catch((cleanupError) => {
        console.error('Work deleted file cleanup deferred', cleanupError);
      });
      if (editingDocument?._id === document._id) reset();
      setFeedback({ type: 'success', text: 'Đã xóa công văn chưa duyệt.' });
    } catch (error) {
      setFeedback({
        type: 'error',
        text: String(error?.message || '').includes('WORK_DOCUMENT_IMMUTABLE')
          ? 'Công văn đã được duyệt nên không thể sửa hoặc xóa.'
          : 'Không thể xóa công văn lúc này.',
      });
    } finally {
      setSaving(false);
    }
  };

  const submitReview = async ({ decision, qualityPercent, rejectionReason }) => {
    if (!reviewing) return;
    setReviewSaving(true);
    setFeedback({ type: '', text: '' });
    try {
      if (reviewing.kind === 'personal_task') {
        await reviewPersonalCompletion({
          taskId: reviewing.taskId,
          userId: reviewing.userId,
          decision,
          qualityPercent,
          rejectionReason,
        });
      } else {
        await reviewWorkCompletion({
          workItemId: reviewing.workItemId,
          userId: reviewing.userId,
          decision,
          qualityPercent,
          rejectionReason,
        });
      }
      setReviewing(null);
      setFeedback({
        type: 'success',
        text: decision === 'approve' ? 'Đã duyệt hoàn thành task.' : 'Đã từ chối và trả task về cho user.',
      });
    } catch {
      setFeedback({ type: 'error', text: 'Không thể duyệt hoàn thành lúc này.' });
    } finally {
      setReviewSaving(false);
    }
  };

  return (
    <section className="work-management duty-workspace">
      {feedback.text && !open ? <div className={`work-feedback ${feedback.type}`}>{feedback.text}</div> : null}

      {allowCreate && open ? (
        <form id="work-document-editor" className="work-editor duty-modern-editor" onSubmit={submit}>
          <div className="work-editor-title">
            <div>
              <span>{editingDocument ? 'CẬP NHẬT VIỆC' : 'VIỆC MỚI'}</span>
              <h3>{editingDocument ? 'Sửa công việc' : 'Tạo công việc'}</h3>
            </div>
            <button type="button" className="duty-editor-close" onClick={closeEditor} aria-label="Đóng biểu mẫu">
              <span aria-hidden="true">×</span> Đóng
            </button>
          </div>
          <label className="duty-content-field">
            Tên công việc
            <input
              required
              type="text"
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Nhập tên công việc"
            />
            <small>{title.length}/200</small>
          </label>
          <div className="duty-field">
            <span className="duty-field-label">Tệp đính kèm (không bắt buộc)</span>
            {editingDocument && !file && editingDocument.fileName ? (
              <p className="work-muted">Đang giữ tệp hiện tại: {editingDocument.fileName}. Chọn tệp mới nếu muốn thay.</p>
            ) : null}
            <WorkFileDropzone
              file={file}
              onFile={(nextFile, error) => {
                setFile(nextFile);
                if (error) setFeedback({ type: 'error', text: error });
              }}
            />
          </div>
          <WorkAssignmentRows
            assignments={assignments}
            onChange={setAssignments}
            departments={options.departments}
            users={options.users || []}
            showDepartments={options.isOps !== false}
          />
          {feedback.text ? <div className={`work-feedback ${feedback.type}`}>{feedback.text}</div> : null}
          <div className="work-editor-actions duty-editor-actions">
            <button type="button" className="work-ghost-button" onClick={reset}>{editingDocument ? 'Hủy sửa' : 'Xóa biểu mẫu'}</button>
            <button type="submit" className="work-primary-button" disabled={saving}>
              {saving
                ? (editingDocument ? 'Đang lưu…' : 'Đang tạo…')
                : pendingSettlement
                  ? 'Thử hoàn tất lại'
                  : editingDocument
                    ? 'Lưu thay đổi'
                    : 'Tạo'}
            </button>
          </div>
        </form>
      ) : null}

      {previewOpen ? (
        <WorkCreatePreview
          title={title}
          fileName={file?.name || ''}
          assignments={assignments}
          catalogs={options}
          pending={saving}
          onCancel={() => setPreviewOpen(false)}
          onConfirm={() => void persistWork()}
        />
      ) : null}

      {!hideCompletionQueue && pendingCompletionReviews.length ? (
        <section className="work-completion-queue">
          <header>
            <div>
              <span>DUYỆT HOÀN THÀNH</span>
              <h3>{pendingCompletionReviews.length} task đang chờ duyệt</h3>
            </div>
          </header>
          <div className="work-user-list">
            {pendingCompletionReviews.map((item) => (
              <article className="work-user-card pending-completion-card" key={`${item.kind}-${item.taskId || item.workItemId}-${item.userId}`}>
                <div className="work-completion-card-content">
                  <span className="work-card-eyebrow">{item.departmentName}</span>
                  <h3>{item.content}</h3>
                  <div className="work-card-meta">
                    <span>Người nộp <strong>{item.userName}</strong></span>
                    <span>Hạn <strong>{formatWorkDate(item.deadline)}</strong></span>
                    {item.submittedLate ? <span className="work-late-flag">Nộp trễ</span> : null}
                  </div>
                </div>
                <div className="work-completion-review-actions">
                  <WorkStatus status="pending_completion" />
                  <button type="button" className="work-primary-button" onClick={() => setReviewing(item)}>
                    Duyệt / Chưa duyệt
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="duty-list-section">
        <DutyListHeading>Việc tôi tạo</DutyListHeading>
        <div className="duty-list-toolbar">
          <WorkListTabs tab={listTab} onChange={setListTab} />
          {allowCreate && !open ? (
            <button type="button" className="work-primary-button" onClick={() => setOpen(true)}>
              <span>+</span> Tạo công việc
            </button>
          ) : null}
        </div>
        <WorkListSearch value={listSearch} onChange={setListSearch} />
        {visibleDocuments.length === 0 ? (
          <WorkListEmpty tab={listTab} tone="created" />
        ) : filteredDocuments.length === 0 ? (
          <WorkListEmpty filtered />
        ) : (
          <div className="duty-modern-list">
            {filteredDocuments.map((document) => {
              const cardOpen = String(expanded || '') === String(document._id);
              return (
                <article
                  className={`duty-modern-card ${cardOpen ? 'is-open' : ''}`}
                  key={document._id}
                  data-focus-id={document._id}
                >
                  <button type="button" className="duty-card-toggle" onClick={() => setExpanded(cardOpen ? null : document._id)}>
                    <WorkListSummary
                      item={document}
                      status={<WorkStatus status={document.workStatus || document.status} />}
                    />
                    <span className="duty-expand-hint">{cardOpen ? 'Thu gọn' : 'Chi tiết'}</span>
                  </button>
                  {document.canEdit || document.canDelete ? (
                    <div className="row-actions duty-actions">
                      {document.canEdit ? (
                        <button type="button" className="work-outline-button" onClick={() => startEdit(document)} disabled={saving}>Sửa</button>
                      ) : null}
                      {document.canDelete ? (
                        <button type="button" className="work-reject-button" onClick={() => void removeDocument(document)} disabled={saving}>Xóa</button>
                      ) : null}
                    </div>
                  ) : (
                    <p className="work-document-locked">Đã có người nộp · Không thể sửa hoặc xóa</p>
                  )}
                  {cardOpen ? (
                    <div className="duty-detail">
                      {document.privateFile && document.fileName ? (
                        <div className="work-document-meta">
                          <span>Tệp đính kèm</span>
                          <PrivateFileLink
                            documentId={document._id}
                            fileName={document.fileName}
                            fileUrl={document.fileUrl}
                            privateFile={document.privateFile}
                          >
                            {document.fileName} · {fileSizeLabel(document.fileSize)}
                          </PrivateFileLink>
                        </div>
                      ) : null}
                      {document.assignments.map((assignment) => (
                        <section key={assignment._id || assignment.departmentId} data-focus-id={assignment._id || undefined}>
                          <header>
                            <strong>
                              {assignment.type === 'individual' ? 'Cá nhân' : assignment.departmentName}
                            </strong>
                            <WorkStatus status={assignment.status || 'unassigned'} />
                          </header>
                          <p>{assignment.content}</p>
                          <small>
                            Hạn {formatWorkDate(assignment.deadline)}
                            {assignment.taskCount != null ? ` · ${assignment.taskCompletedCount || 0}/${assignment.taskCount} hoàn thành` : ''}
                          </small>
                          {assignment.members?.length ? (
                            <div className="work-member-progress">
                              {assignment.members.map((member) => (
                                <span key={member._id} className={`work-member-chip status-${member.status}`}>
                                  {member.name} · {workStatusLabel(member.status)}
                                  {member.qualityPercent != null ? ` · ${member.qualityPercent}%` : ''}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </section>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
      {reviewing ? (
        <CompletionReviewModal
          item={reviewing}
          onClose={() => setReviewing(null)}
          onSubmit={submitReview}
          saving={reviewSaving}
        />
      ) : null}
    </section>
  );
}

function PersonalTaskAssignModal({ work, users, onClose, onSubmit, saving }) {
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState(work.deadline);
  const [assigneeIds, setAssigneeIds] = useState([]);
  return (
    <div className="work-modal-backdrop" role="presentation">
      <form className="work-modal" onSubmit={(event) => { event.preventDefault(); onSubmit({ title, deadline, assigneeUserIds: assigneeIds }); }}>
        <button type="button" className="work-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        <span className="work-kicker">Công việc cá nhân</span>
        <h3>Chỉ định đầu mục</h3>
        <p className="work-modal-context">{work.departmentName} · Hạn phòng ban {formatWorkDate(work.deadline)}</p>
        <label className="work-field-label" htmlFor="personal-title">Tên công việc <small>{title.length}/200</small></label>
        <input id="personal-title" type="text" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ví dụ: Tổng hợp danh sách hồ sơ…" required />
        <label className="work-field-label" htmlFor="personal-deadline">Hạn chót hoàn thành</label>
        <input id="personal-deadline" type="date" min={new Date().toISOString().slice(0, 10)} value={deadline} onChange={(event) => setDeadline(event.target.value)} required />
        <div className="work-field-label">Người thực hiện <small>{assigneeIds.length} người</small></div>
        <div className="work-assignee-list">
          {users.map((person) => (
            <label key={person._id} className={assigneeIds.includes(person._id) ? 'is-selected' : ''}>
              <input type="checkbox" checked={assigneeIds.includes(person._id)} onChange={() => setAssigneeIds((current) => current.includes(person._id) ? current.filter((id) => id !== person._id) : [...current, person._id])} />
              <span className="work-person-avatar" aria-hidden="true">{String(person.name).trim().slice(0, 1).toUpperCase()}</span>
              <span><strong>{person.name}</strong><small>{person.positionName || 'Chưa gán chức vụ'}</small></span>
            </label>
          ))}
          {!users.length ? <p className="work-muted">Không có user cấp thấp hơn cùng phòng ban.</p> : null}
        </div>
        <div className="work-modal-actions">
          <button type="button" className="work-ghost-button" onClick={onClose}>Hủy</button>
          <button type="submit" className="work-primary-button" disabled={saving || !assigneeIds.length}>{saving ? 'Đang lưu…' : 'Giao công việc'}</button>
        </div>
      </form>
    </div>
  );
}

export function WorkUserView({ focusTarget = null }) {
  const data = useQuery(anyApi.work.listMine);
  const { fetchAccessToken } = useConvexAuth();
  const approveDocument = useMutation(anyApi.work.approveDocument);
  const rejectDocument = useMutation(anyApi.work.rejectDocument);
  const createPersonalTask = useMutation(anyApi.work.createPersonalTask);
  const completePersonalTask = useMutation(anyApi.work.completePersonalTask);
  const completeWorkItem = useMutation(anyApi.work.completeWorkItem);
  const reviewWorkCompletion = useMutation(anyApi.work.reviewWorkCompletion);
  const reviewPersonalCompletion = useMutation(anyApi.work.reviewPersonalCompletion);
  const [assigning, setAssigning] = useState(null);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(null);
  const [completingSaving, setCompletingSaving] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [decidingId, setDecidingId] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [listTab, setListTab] = useState(WORK_LIST_TAB_UPCOMING);
  const [listSearch, setListSearch] = useState(emptyWorkSearch);
  const [expanded, setExpanded] = useState(null);
  const isApprover = (data?.level || 0) >= 4;
  const isAssigner = data?.level === 2 || data?.level === 3;
  const isAdminMod = (data?.assignerMode || 'admin_mod') === 'admin_mod';
  const pendingCompletionReviews = data?.pendingCompletionReviews || [];

  useNotificationFocus(focusTarget, {
    acceptSourceTypes: ['approval', 'department_work', 'personal_task', 'completion_rejected'],
  });

  const visibleMyTasks = useMemo(() => filterWorksByTab(data?.myTasks || [], listTab), [data?.myTasks, listTab]);
  const visibleDepartmentWorks = useMemo(
    () => filterWorksByTab(data?.departmentWorks || [], listTab),
    [data?.departmentWorks, listTab],
  );
  const visiblePersonalTasks = useMemo(
    () => filterWorksByTab(data?.personalTasks || [], listTab),
    [data?.personalTasks, listTab],
  );
  const filteredMyTasks = useMemo(
    () => filterWorksBySearch(visibleMyTasks, listSearch),
    [visibleMyTasks, listSearch],
  );
  const filteredDepartmentWorks = useMemo(
    () => filterWorksBySearch(visibleDepartmentWorks, listSearch),
    [visibleDepartmentWorks, listSearch],
  );
  const filteredPersonalTasks = useMemo(
    () => filterWorksBySearch(visiblePersonalTasks, listSearch),
    [visiblePersonalTasks, listSearch],
  );

  if (data === undefined) return <div className="work-loading">Đang tải công việc của bạn…</div>;

  const handleAssign = async ({ title, deadline, assigneeUserIds }) => {
    setSaving(true);
    setFeedback({ type: '', text: '' });
    try {
      await createPersonalTask({ workItemId: assigning._id, title, deadline, assigneeUserIds });
      setAssigning(null);
      setFeedback({ type: 'success', text: 'Đã giao đầu mục công việc cá nhân.' });
    } catch {
      setFeedback({ type: 'error', text: 'Không thể giao công việc. Vui lòng kiểm tra người thực hiện và hạn chót.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDecision = async (documentId, decision) => {
    setDecidingId(documentId);
    setFeedback({ type: '', text: '' });
    try {
      if (decision === 'approve') {
        await approveDocument({ documentId });
        setFeedback({ type: 'success', text: 'Bạn đã duyệt công văn.' });
      } else {
        await rejectDocument({ documentId });
        setFeedback({ type: 'success', text: 'Bạn đã xác nhận không duyệt công văn.' });
      }
    } catch {
      setFeedback({ type: 'error', text: 'Không thể cập nhật quyết định duyệt công văn lúc này.' });
    } finally {
      setDecidingId(null);
    }
  };

  /** @param {{ uploaded?: { driveFileId: string, driveChecksum?: string, cleanupToken: string, fileName: string, fileType: string, fileSize: number } }} [result] */
  const handleCompleteWorkItem = async (result = {}) => {
    const { uploaded } = result;
    if (!completing || !uploaded) return;
    setCompletingSaving(true);
    setFeedback({ type: '', text: '' });
    try {
      await completeWorkItem({
        workItemId: completing._id,
        driveFileId: uploaded.driveFileId,
        driveChecksum: uploaded.driveChecksum,
        cleanupToken: uploaded.cleanupToken,
        fileName: uploaded.fileName,
        fileType: uploaded.fileType,
        fileSize: uploaded.fileSize,
      });
      await settleWorkUploadedFile(fetchAccessToken, uploaded.cleanupToken, true);
      setCompleting(null);
      setFeedback({ type: 'success', text: 'Đã nộp công việc. Người tạo sẽ đánh dấu hoàn thành.' });
    } catch {
      setFeedback({ type: 'error', text: 'Không thể đánh dấu hoàn thành lúc này.' });
    } finally {
      setCompletingSaving(false);
    }
  };

  /** @param {{ qualityPercent?: number }} [result] */
  const handleCompletePersonal = async (result = {}) => {
    const { qualityPercent } = result;
    if (!completing) return;
    setCompletingSaving(true);
    setFeedback({ type: '', text: '' });
    try {
      await completePersonalTask({
        taskId: completing._id,
        ...(qualityPercent !== undefined ? { qualityPercent } : {}),
      });
      setCompleting(null);
      setFeedback({
        type: 'success',
        text: data?.isAdmin ? 'Đã ghi nhận hoàn thành.' : 'Đã gửi duyệt hoàn thành.',
      });
    } catch {
      setFeedback({ type: 'error', text: 'Không thể hoàn thành đầu mục này.' });
    } finally {
      setCompletingSaving(false);
    }
  };

  const submitReview = async ({ decision, qualityPercent, rejectionReason }) => {
    if (!reviewing) return;
    setReviewSaving(true);
    setFeedback({ type: '', text: '' });
    try {
      if (reviewing.kind === 'personal_task') {
        await reviewPersonalCompletion({
          taskId: reviewing.taskId,
          userId: reviewing.userId,
          decision,
          qualityPercent,
          rejectionReason,
        });
      } else {
        await reviewWorkCompletion({
          workItemId: reviewing.workItemId,
          userId: reviewing.userId,
          decision,
          qualityPercent,
          rejectionReason,
        });
      }
      setReviewing(null);
      setFeedback({
        type: 'success',
        text: decision === 'approve' ? 'Đã duyệt hoàn thành task.' : 'Đã từ chối và trả task về cho user.',
      });
    } catch {
      setFeedback({ type: 'error', text: 'Không thể duyệt hoàn thành lúc này.' });
    } finally {
      setReviewSaving(false);
    }
  };

  return (
    <>
    <section className="work-user-view duty-workspace">
      {feedback.text ? <div className={`work-feedback ${feedback.type}`}>{feedback.text}</div> : null}

      {pendingCompletionReviews.length ? (
        <section className="work-completion-queue">
          <header>
            <div>
              <span>DUYỆT HOÀN THÀNH</span>
              <h3>{pendingCompletionReviews.length} task đang chờ bạn duyệt</h3>
            </div>
          </header>
          <div className="work-user-list">
            {pendingCompletionReviews.map((item) => (
              <article className="work-user-card pending-completion-card" key={`${item.kind}-${item.taskId || item.workItemId}-${item.userId}`}>
                <div className="work-completion-card-content">
                  <span className="work-card-eyebrow">{item.departmentName}</span>
                  <h3>{item.content}</h3>
                  <div className="work-card-meta">
                    <span>Người nộp <strong>{item.userName}</strong></span>
                    <span>Hạn <strong>{formatWorkDate(item.deadline)}</strong></span>
                  </div>
                </div>
                <div className="work-completion-review-actions">
                  <WorkStatus status="pending_completion" />
                  <button type="button" className="work-primary-button" onClick={() => setReviewing(item)}>
                    Duyệt / Chưa duyệt
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {false && isApprover ? (
        <div className="work-user-list">
          {!data.approvals.length ? (
            <div className="work-empty"><span>✓</span><h3>Không có công văn cần xử lý</h3><p>Khi Admin chỉ định bạn duyệt, hồ sơ sẽ xuất hiện tại đây.</p></div>
          ) : data.approvals.map((document) => {
            const ownApproval = document.approvers.find((person) => String(person._id) === String(data.userId));
            const canApprove = document.status === 'pending' && ownApproval && !ownApproval.approved && !ownApproval.rejected;
            const canReject = canApprove && document.approvalCount === 0;
            return (
              <article className="work-user-card approval-card" key={document._id} data-focus-id={document._id}>
                <div className="work-user-card-top">
                  <div>
                    <span className="work-file-badge doc">{document.fileName.split('.').pop().toUpperCase()}</span>
                    <span className="work-card-eyebrow">Công văn · {document.assignmentCount} phân công</span>
                  </div>
                  <WorkStatus status={document.status} />
                </div>
                <h3>{document.fileName}</h3>
                <div className="work-card-meta"><span>Duyệt <strong>{document.approvalCount}/{document.approvalTotal}</strong></span></div>
                <PrivateFileLink
                  className="work-file-link"
                  documentId={document._id}
                  fileName={document.fileName}
                  fileUrl={document.fileUrl}
                  privateFile={document.privateFile}
                >
                  {document.fileName}
                </PrivateFileLink>
                <div className="work-document-assignments">
                  {document.assignments.map((assignment) => (
                    <section key={assignment._id || assignment.departmentId}>
                      <header>
                        <strong>{assignment.type === 'individual' ? 'Cá nhân' : assignment.departmentName}</strong>
                        <WorkStatus status={assignment.status || 'unassigned'} />
                      </header>
                      <p>{assignment.content}</p>
                      <small>Hạn {formatWorkDate(assignment.deadline)} · {assignment.taskCount || 0} người</small>
                    </section>
                  ))}
                </div>
                {canApprove ? (
                  <div className="work-approval-actions">
                    <button type="button" className="work-primary-button" disabled={decidingId === document._id} onClick={() => void handleDecision(document._id, 'approve')}>
                      ✓ Tôi duyệt công văn này
                    </button>
                    {canReject ? (
                      <button type="button" className="work-reject-button" disabled={decidingId === document._id} onClick={() => void handleDecision(document._id, 'reject')}>
                        × Tôi không duyệt công văn này
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      {isAdminMod || isAssigner || (!isAdminMod && !isApprover && !isAssigner) ? (
        <div className="duty-list-section">
          <DutyListHeading>Việc của tôi</DutyListHeading>
          <div className="duty-list-toolbar">
            <WorkListTabs tab={listTab} onChange={setListTab} />
          </div>
          <WorkListSearch value={listSearch} onChange={setListSearch} />
          {isAdminMod ? (
            visibleMyTasks.length === 0 ? <WorkListEmpty tab={listTab} /> : filteredMyTasks.length === 0 ? <WorkListEmpty filtered /> : (
              <div className="duty-modern-list">
                {filteredMyTasks.map((task) => {
                  const cardOpen = String(expanded || '') === String(task._id);
                  return (
                    <article className={`duty-modern-card ${cardOpen ? 'is-open' : ''}`} key={task._id} data-focus-id={task._id}>
                      <button type="button" className="duty-card-toggle" onClick={() => setExpanded(cardOpen ? null : task._id)}>
                        <WorkListSummary
                          item={task}
                          status={<WorkStatus status={task.status === 'pending' ? 'pending_task' : task.status} />}
                        />
                        <span className="duty-expand-hint">{cardOpen ? 'Thu gọn' : 'Chi tiết'}</span>
                      </button>
                      {task.status === 'pending' || task.status === 'pending_task' || task.status === 'overdue' || task.status === 'rejected_completion' ? (
                        <div className="row-actions duty-actions">
                          <button
                            type="button"
                            className="work-primary-button"
                            onClick={() => setCompleting({ ...task, mode: 'work_item' })}
                          >
                            {task.status === 'overdue' || task.status === 'rejected_completion'
                              ? 'Gửi hoàn thành lại'
                              : 'Đã hoàn thành'}
                          </button>
                        </div>
                      ) : null}
                      {cardOpen ? (
                        <div className="duty-detail">
                          {task.rejectionReason ? (
                            <div className="work-rejection-banner" role="status">
                              <strong>Lý do chưa duyệt</strong>
                              <p>{task.rejectionReason}</p>
                            </div>
                          ) : null}
                          <PrivateFileLink
                            className="work-file-link"
                            documentId={task.documentId}
                            fileName={task.fileName}
                            fileUrl={task.fileUrl}
                            privateFile={task.privateFile}
                          >
                            {task.fileName || 'Công văn đính kèm'}
                          </PrivateFileLink>
                          {task.type === 'department' && task.pendingMembers?.length ? (
                            <div className="work-member-progress">
                              <strong className="work-pending-label">Chưa xong / chờ duyệt:</strong>
                              {task.pendingMembers.map((member) => (
                                <span key={member._id} className={`work-member-chip status-${member.status}`}>
                                  {member.name}
                                  {member.qualityPercent != null ? ` · ${member.qualityPercent}%` : ''}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {task.type === 'department' && task.members?.length ? (
                            <details className="work-member-details">
                              <summary>Xem tiến độ cả phòng ban ({task.members.length})</summary>
                              <div className="work-member-progress">
                                {task.members.map((member) => (
                                  <span key={member._id} className={`work-member-chip status-${member.status}`}>
                                    {member.name} · {workStatusLabel(member.status)}
                                    {member.qualityPercent != null ? ` · ${member.qualityPercent}%` : ''}
                                  </span>
                                ))}
                              </div>
                            </details>
                          ) : null}
                          {task.status === 'pending_completion' ? (
                            <small className="work-overdue-note">Đang chờ Admin/Mod duyệt hoàn thành.</small>
                          ) : null}
                          {task.status === 'completed_late' ? (
                            <small className="work-overdue-note">Đã hoàn thành trễ hạn — sẽ ghi nhận vào KPI.</small>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )
          ) : null}

          {!isAdminMod && isAssigner ? (
            visibleDepartmentWorks.length === 0 ? <WorkListEmpty tab={listTab} /> : filteredDepartmentWorks.length === 0 ? <WorkListEmpty filtered /> : (
              <div className="duty-modern-list">
                {filteredDepartmentWorks.map((work) => {
                  const cardOpen = String(expanded || '') === String(work._id);
                  return (
                    <article className={`duty-modern-card ${cardOpen ? 'is-open' : ''}`} key={work._id} data-focus-id={work._id}>
                      <button type="button" className="duty-card-toggle" onClick={() => setExpanded(cardOpen ? null : work._id)}>
                        <WorkListSummary item={work} status={<WorkStatus status={work.status} />} />
                        <span className="duty-expand-hint">{cardOpen ? 'Thu gọn' : 'Chi tiết'}</span>
                      </button>
                      <div className="row-actions duty-actions">
                        <button type="button" className="work-outline-button" onClick={() => setAssigning(work)}>＋ Chỉ định công việc cá nhân</button>
                      </div>
                      {cardOpen ? (
                        <div className="duty-detail">
                          <DepartmentProgress status={work.status} taskCount={work.tasks.length} />
                          <div className="work-task-list">
                            {work.tasks.map((task) => (
                              <div className="work-task-row" key={task._id}>
                                <span>
                                  <strong>{task.title}</strong>
                                  <small>Hạn {formatWorkDate(task.deadline)} · {task.assignees.map((person) => person.name).join(', ')}</small>
                                </span>
                                <WorkStatus status={
                                  task.status === 'completed' || task.status === 'completed_late' || task.status === 'pending_completion' || task.status === 'rejected_completion'
                                    ? task.status
                                    : task.status === 'overdue'
                                      ? 'not_completed'
                                      : 'in_progress'
                                } />
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )
          ) : null}

          {!isAdminMod && !isApprover && !isAssigner ? (
            visiblePersonalTasks.length === 0 ? <WorkListEmpty tab={listTab} /> : filteredPersonalTasks.length === 0 ? <WorkListEmpty filtered /> : (
              <div className="duty-modern-list">
                {filteredPersonalTasks.map((task) => {
                  const cardOpen = String(expanded || '') === String(task._id);
                  return (
                    <article className={`duty-modern-card ${cardOpen ? 'is-open' : ''}`} key={task._id} data-focus-id={task._id}>
                      <button type="button" className="duty-card-toggle" onClick={() => setExpanded(cardOpen ? null : task._id)}>
                        <WorkListSummary
                          item={task}
                          status={<WorkStatus status={task.status === 'pending' ? 'pending_task' : task.status} />}
                        />
                        <span className="duty-expand-hint">{cardOpen ? 'Thu gọn' : 'Chi tiết'}</span>
                      </button>
                      {task.status === 'pending' || task.status === 'pending_task' || task.status === 'overdue' || task.status === 'rejected_completion' ? (
                        <div className="row-actions duty-actions">
                          <button
                            type="button"
                            className="work-primary-button"
                            onClick={() => setCompleting({ ...task, mode: 'personal_task', content: task.title })}
                          >
                            {task.status === 'rejected_completion' ? 'Nộp lại' : 'Nộp'}
                          </button>
                        </div>
                      ) : null}
                      {cardOpen ? (
                        <div className="duty-detail">
                          {task.rejectionReason ? (
                            <div className="work-rejection-banner" role="status">
                              <strong>Lý do chưa duyệt</strong>
                              <p>{task.rejectionReason}</p>
                            </div>
                          ) : null}
                          {task.status === 'pending_completion' ? (
                            <small className="work-overdue-note">Đang chờ cấp trên duyệt hoàn thành.</small>
                          ) : null}
                          {task.status === 'completed_late' ? (
                            <small className="work-overdue-note">Đã hoàn thành trễ hạn — sẽ ghi nhận vào KPI.</small>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )
          ) : null}
        </div>
      ) : null}

      {assigning ? <PersonalTaskAssignModal work={assigning} users={data.assignableUsers} onClose={() => setAssigning(null)} onSubmit={handleAssign} saving={saving} /> : null}
      {completing ? (
        <CompletionSubmitModal
          title={completing.content || completing.title}
          saving={completingSaving}
          onClose={() => setCompleting(null)}
          onSubmit={completing.mode === 'personal_task' ? handleCompletePersonal : handleCompleteWorkItem}
        />
      ) : null}
      {reviewing ? (
        <CompletionReviewModal
          item={reviewing}
          onClose={() => setReviewing(null)}
          onSubmit={submitReview}
          saving={reviewSaving}
        />
      ) : null}
    </section>
      {data.canCreate ? <WorkManagement allowCreate hideCompletionQueue focusTarget={focusTarget} /> : null}
    </>
  );
}
