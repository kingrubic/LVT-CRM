import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import './work.css';

const ACCEPTED_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'xls', 'png', 'jpg', 'jpeg'];

function publicUploadUrl(shortLivedUrl) {
  const uploadUrl = new URL(shortLivedUrl, window.location.origin);
  const isInternalHost = uploadUrl.hostname === '127.0.0.1' || uploadUrl.hostname === 'localhost';
  if (window.location.hostname === 'lvt.vscgroup.io.vn' && isInternalHost) {
    return `${window.location.origin}${uploadUrl.pathname}${uploadUrl.search}${uploadUrl.hash}`;
  }
  return uploadUrl.toString();
}

function formatWorkDate(value) {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function fileSizeLabel(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function workStatusLabel(status) {
  return {
    pending: 'Chờ duyệt',
    approved: 'Đã duyệt',
    rejected: 'Không duyệt',
    unassigned: 'Chưa giao việc',
    in_progress: 'Đang thực hiện',
    completed: 'Đã hoàn thành',
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

function DepartmentAssignmentModal({ departments, selectedDepartmentIds, onClose, onDone }) {
  const [departmentId, setDepartmentId] = useState('');
  const [content, setContent] = useState('');
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState('');
  const availableDepartments = departments.filter(
    (department) => !selectedDepartmentIds.includes(String(department._id)),
  );
  const submit = (event) => {
    event.preventDefault();
    if (!departmentId || !content.trim() || !deadline) {
      setError('Vui lòng điền đủ phòng ban, nội dung công việc và hạn chót.');
      return;
    }
    const department = departments.find(
      (item) => String(item._id) === String(departmentId),
    );
    onDone({
      departmentId,
      departmentName: department?.name || 'Chưa gán phòng ban',
      content: content.trim(),
      deadline,
    });
  };
  return (
    <div className="work-modal-backdrop" role="presentation">
      <form className="work-modal department-assignment-modal" onSubmit={submit}>
        <button type="button" className="work-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        <span className="work-kicker">Phân công · Phòng ban</span>
        <h3>Thêm phòng ban nhận việc</h3>
        <p className="work-modal-context">Mỗi phòng ban có nội dung và hạn hoàn thành riêng.</p>
        <label className="work-field-label" htmlFor="assignment-department">Phòng ban nhận việc</label>
        <select id="assignment-department" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} required>
          <option value="">Chọn phòng ban</option>
          {availableDepartments.map((department) => (
            <option key={department._id} value={department._id}>{department.name}</option>
          ))}
        </select>
        <label className="work-field-label" htmlFor="assignment-content">
          Nội dung công việc <small>{content.length}/2000</small>
        </label>
        <textarea
          id="assignment-content"
          value={content}
          maxLength={2000}
          rows={6}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Nhập yêu cầu cụ thể dành cho phòng ban này…"
          required
        />
        <label className="work-field-label" htmlFor="assignment-deadline">Hạn chót hoàn thành</label>
        <input id="assignment-deadline" type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} required />
        {error ? <div className="work-feedback error">{error}</div> : null}
        <div className="work-modal-actions">
          <button type="button" className="work-ghost-button" onClick={onClose}>Hủy</button>
          <button type="submit" className="work-primary-button" disabled={!availableDepartments.length}>Xong</button>
        </div>
      </form>
    </div>
  );
}

export function WorkManagement() {
  const options = useQuery(anyApi.work.formOptions);
  const documents = useQuery(anyApi.work.listAdmin);
  const generateUploadUrl = useMutation(anyApi.work.generateUploadUrl);
  const createDocument = useMutation(anyApi.work.createDocument);
  const [open, setOpen] = useState(true);
  const [file, setFile] = useState(null);
  const [departmentAssignments, setDepartmentAssignments] = useState([]);
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [approverIds, setApproverIds] = useState([]);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFile(null);
    setDepartmentAssignments([]);
    setApproverIds([]);
  };

  const submit = async (event) => {
    event.preventDefault();
    setFeedback({ type: '', text: '' });
    if (!file) return setFeedback({ type: 'error', text: 'Vui lòng tải công văn lên trước.' });
    if (!departmentAssignments.length || !approverIds.length) {
      return setFeedback({ type: 'error', text: 'Vui lòng thêm ít nhất một phòng ban nhận việc và chọn người duyệt.' });
    }
    setSaving(true);
    let stage = 'upload';
    try {
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(publicUploadUrl(uploadUrl), {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.storageId) {
        throw new Error(`WORK_UPLOAD_FAILED:${response.status}`);
      }
      stage = 'save';
      await createDocument({
        fileId: result.storageId,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        assignments: departmentAssignments.map(({ departmentId: id, content: assignmentContent, deadline: assignmentDeadline }) => ({
          departmentId: id,
          content: assignmentContent,
          deadline: assignmentDeadline,
        })),
        approverUserIds: approverIds,
      });
      setFeedback({ type: 'success', text: 'Đã tạo công văn và gửi đến người duyệt.' });
      reset();
    } catch (error) {
      setFeedback({
        type: 'error',
        text: stage === 'upload'
          ? 'Không thể tải tệp công văn lên. Vui lòng thử lại.'
          : 'Tệp đã tải lên nhưng không thể lưu công văn. Vui lòng kiểm tra thông tin phân công và người duyệt.',
      });
      console.error('Work document submission failed', {
        stage,
        message: String(error?.message || error),
      });
    } finally {
      setSaving(false);
    }
  };

  if (options === undefined || documents === undefined) {
    return <div className="work-loading">Đang chuẩn bị sổ công việc…</div>;
  }

  return (
    <section className="work-management">
      <header className="work-hero">
        <div>
          <span className="work-kicker">Thiết lập · Công việc</span>
          <h2>Sổ công văn &amp; tiến độ</h2>
          <p>Gửi đúng người duyệt, giao đúng phòng ban, theo dõi trọn vẹn đến khi hoàn tất.</p>
        </div>
        <div className="work-hero-stamp">
          <strong>{documents.length}</strong>
          <span>CÔNG VĂN</span>
        </div>
      </header>

      <div className="work-page-actions">
        <div>
          <span>QUẢN LÝ CÔNG VIỆC</span>
          <h3>Kho công văn</h3>
        </div>
        <button type="button" className="work-primary-button" onClick={() => setOpen((value) => !value)}>
          <span>{open ? '×' : '+'}</span> {open ? 'Đóng biểu mẫu' : 'Thêm công văn'}
        </button>
      </div>

      {open ? (
        <form className="work-editor" onSubmit={submit}>
          <div className="work-editor-title">
            <div>
              <span>HỒ SƠ MỚI</span>
              <h3>Thêm công văn</h3>
            </div>
            <span className="work-editor-index">01 / 03</span>
          </div>
          <div className="work-editor-grid">
            <div className="work-editor-column">
              <label className="work-field-label">Tải công văn</label>
              <WorkFileDropzone
                file={file}
                onFile={(nextFile, error) => {
                  setFile(nextFile);
                  if (error) setFeedback({ type: 'error', text: error });
                }}
              />
            </div>
            <div className="work-editor-column">
              <div className="work-approver-block">
                <div className="work-field-label">
                  <span>Duyệt công văn</span>
                  <small>{approverIds.length} người đã chọn</small>
                </div>
                <div className="work-approver-list">
                  {options.approvers.map((person) => (
                    <label key={person._id} className={approverIds.includes(person._id) ? 'is-selected' : ''}>
                      <input
                        type="checkbox"
                        checked={approverIds.includes(person._id)}
                        onChange={() => setApproverIds((current) => current.includes(person._id) ? current.filter((id) => id !== person._id) : [...current, person._id])}
                      />
                      <span className="work-person-avatar">{String(person.name).trim().slice(0, 1).toUpperCase()}</span>
                      <span>
                        <strong>{person.name}</strong>
                        <small>{person.level} sao · {person.positionName || 'Chưa gán chức vụ'}</small>
                      </span>
                    </label>
                  ))}
                  {!options.approvers.length ? <p className="work-muted">Chưa có user cấp 4 hoặc 5 sao.</p> : null}
                </div>
              </div>
            </div>
          </div>
          <section className="work-department-assignments">
            <header>
              <div>
                <span>PHÂN CÔNG</span>
                <h4>Phòng ban nhận việc</h4>
              </div>
              <button type="button" className="work-outline-button" onClick={() => setAssignmentModalOpen(true)}>
                ＋ Thêm phòng ban nhận việc
              </button>
            </header>
            {departmentAssignments.length ? (
              <div className="work-assignment-table">
                <div className="work-assignment-table-head">
                  <span>Phòng ban</span>
                  <span>Nội dung công việc</span>
                  <span>Hạn chót</span>
                  <span />
                </div>
                {departmentAssignments.map((assignment) => (
                  <div className="work-assignment-row" key={assignment.departmentId}>
                    <strong>{assignment.departmentName}</strong>
                    <span>{assignment.content}</span>
                    <time>{formatWorkDate(assignment.deadline)}</time>
                    <button
                      type="button"
                      onClick={() => setDepartmentAssignments((current) =>
                        current.filter((item) => item.departmentId !== assignment.departmentId)
                      )}
                      aria-label={`Xóa ${assignment.departmentName}`}
                      title="Xóa phòng ban"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="work-assignment-empty">
                <span>⌁</span>
                <p>Chưa có phòng ban nhận việc. Mỗi phòng ban sẽ có nội dung và hạn chót riêng.</p>
              </div>
            )}
          </section>
          {feedback.text ? <div className={`work-feedback ${feedback.type}`}>{feedback.text}</div> : null}
          <div className="work-editor-actions">
            <button type="button" className="work-ghost-button" onClick={reset}>Xóa biểu mẫu</button>
            <button type="submit" className="work-primary-button" disabled={saving}>{saving ? 'Đang tải lên…' : 'Lưu & gửi duyệt'}</button>
          </div>
        </form>
      ) : null}

      {assignmentModalOpen ? (
        <DepartmentAssignmentModal
          departments={options.departments}
          selectedDepartmentIds={departmentAssignments.map((assignment) => String(assignment.departmentId))}
          onClose={() => setAssignmentModalOpen(false)}
          onDone={(assignment) => {
            setDepartmentAssignments((current) => [...current, assignment]);
            setAssignmentModalOpen(false);
          }}
        />
      ) : null}

      <div className="work-document-grid">
        {documents.length ? documents.map((document) => (
          <article className="work-document-card" key={document._id}>
            <div className="work-document-topline">
              <span className={`work-file-badge ${document.fileType.includes('pdf') ? 'pdf' : 'doc'}`}>{document.fileName.split('.').pop().toUpperCase()}</span>
              <WorkStatus status={document.status} />
              <time>{document.assignmentCount} phòng ban nhận việc</time>
            </div>
            <h3>{document.fileName}</h3>
            <div className="work-document-meta">
              <span>Tệp đính kèm</span>
              {document.fileUrl ? <a href={document.fileUrl} target="_blank" rel="noreferrer">{document.fileName} · {fileSizeLabel(document.fileSize)}</a> : <strong>{document.fileName}</strong>}
            </div>
            <div className="work-document-assignments">
              {document.assignments.map((assignment) => (
                <section key={assignment._id || assignment.departmentId}>
                  <header>
                    <strong>{assignment.departmentName}</strong>
                    <WorkStatus status={assignment.status || 'unassigned'} />
                  </header>
                  <p>{assignment.content}</p>
                  <small>Hạn {formatWorkDate(assignment.deadline)} · {assignment.taskCount || 0} đầu mục cá nhân</small>
                </section>
              ))}
            </div>
            <div className="work-approval-summary">
              <div className="work-approval-summary-head">
                <span>Người duyệt</span>
                <strong>{document.approvalCount}/{document.approvalTotal}</strong>
              </div>
              <div className="work-approval-avatars">
                {document.approvers.map((person) => {
                  const decision = person.approved ? 'Đã duyệt' : person.rejected ? 'Không duyệt' : 'Chờ duyệt';
                  return <span className={person.approved ? 'approved' : person.rejected ? 'rejected' : ''} title={`${person.name} · ${decision}`} key={person._id}>{String(person.name).slice(0, 1).toUpperCase()}</span>;
                })}
              </div>
            </div>
          </article>
        )) : (
          <div className="work-empty"><span>✦</span><h3>Chưa có công văn nào</h3><p>Bấm “Thêm công văn” để bắt đầu giao việc.</p></div>
        )}
      </div>
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
              <span><strong>{person.name}</strong><small>{person.positionName || 'Chưa gán chức vụ'} · {person.level} sao · {person.email}</small></span>
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

export function WorkUserView() {
  const data = useQuery(anyApi.work.listMine);
  const approveDocument = useMutation(anyApi.work.approveDocument);
  const rejectDocument = useMutation(anyApi.work.rejectDocument);
  const createPersonalTask = useMutation(anyApi.work.createPersonalTask);
  const completePersonalTask = useMutation(anyApi.work.completePersonalTask);
  const [assigning, setAssigning] = useState(null);
  const [saving, setSaving] = useState(false);
  const [decidingId, setDecidingId] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const isApprover = (data?.level || 0) >= 4;
  const isAssigner = data?.level === 2 || data?.level === 3;
  const isExecutor = data?.level === 1;

  const stats = useMemo(() => {
    if (!data) return { total: 0, done: 0 };
    if (isApprover) return { total: data.approvals.length, done: data.approvals.filter((item) => item.status === 'approved' || item.status === 'rejected').length };
    if (isExecutor) return { total: data.personalTasks.length, done: data.personalTasks.filter((item) => item.status === 'completed').length };
    return { total: data.departmentWorks.length, done: data.departmentWorks.filter((item) => item.status === 'completed').length };
  }, [data, isApprover, isExecutor]);

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

  return (
    <section className="work-user-view">
      <header className="work-hero">
        <div>
          <span className="work-kicker">Không gian · Công việc</span>
          <h2>{isApprover ? 'Công văn cần duyệt' : isAssigner ? 'Công việc phòng ban' : 'Công việc cần làm'}</h2>
          <p>
            {isApprover
              ? 'Duyệt công văn được chỉ định và theo dõi tiến độ hoàn thành của phòng ban nhận việc.'
              : isAssigner
                ? 'Chia nhỏ công việc phòng ban thành các đầu mục rõ người, rõ hạn.'
                : 'Các đầu mục được giao cho bạn, hoàn thành đúng hạn để khép lại công việc phòng ban.'}
          </p>
        </div>
        <div className="work-hero-stamp">
          <strong>{stats.done}<small>/{stats.total}</small></strong>
          <span>ĐÃ XONG</span>
        </div>
      </header>

      {feedback.text ? <div className={`work-feedback ${feedback.type}`}>{feedback.text}</div> : null}

      {isApprover ? (
        <div className="work-user-list">
          {!data.approvals.length ? <div className="work-empty"><span>✓</span><h3>Không có công văn cần xử lý</h3><p>Khi Admin chỉ định bạn duyệt, hồ sơ sẽ xuất hiện tại đây.</p></div> : data.approvals.map((document) => {
            const ownApproval = document.approvers.find((person) => String(person._id) === String(data.userId));
            const canDecide = document.status === 'pending' && ownApproval && !ownApproval.approved && !ownApproval.rejected;
            return (
              <article className="work-user-card approval-card" key={document._id}>
                <div className="work-user-card-top">
                  <div>
                    <span className="work-file-badge doc">{document.fileName.split('.').pop().toUpperCase()}</span>
                    <span className="work-card-eyebrow">Công văn · {document.assignmentCount} phòng ban</span>
                  </div>
                  <WorkStatus status={document.status} />
                </div>
                <h3>{document.fileName}</h3>
                <div className="work-card-meta"><span>Duyệt <strong>{document.approvalCount}/{document.approvalTotal}</strong></span></div>
                {document.fileUrl ? <a className="work-file-link" href={document.fileUrl} target="_blank" rel="noreferrer">↗ Mở {document.fileName}</a> : null}
                <div className="work-document-assignments">
                  {document.assignments.map((assignment) => (
                    <section key={assignment._id || assignment.departmentId}>
                      <header>
                        <strong>{assignment.departmentName}</strong>
                        <WorkStatus status={assignment.status || 'unassigned'} />
                      </header>
                      <p>{assignment.content}</p>
                      <small>Hạn {formatWorkDate(assignment.deadline)} · {assignment.taskCount || 0} đầu mục cá nhân</small>
                    </section>
                  ))}
                </div>
                {canDecide ? (
                  <div className="work-approval-actions">
                    <button type="button" className="work-primary-button" disabled={decidingId === document._id} onClick={() => void handleDecision(document._id, 'approve')}>
                      ✓ Tôi duyệt công văn này
                    </button>
                    <button type="button" className="work-reject-button" disabled={decidingId === document._id} onClick={() => void handleDecision(document._id, 'reject')}>
                      × Tôi không duyệt công văn này
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : isAssigner ? (
        <div className="work-user-list">
          {!data.departmentWorks.length ? <div className="work-empty"><span>⌁</span><h3>Chưa có công việc phòng ban</h3><p>Công việc sẽ xuất hiện sau khi công văn được duyệt đủ.</p></div> : data.departmentWorks.map((work) => (
            <article className="work-user-card" key={work._id}>
              <div className="work-user-card-top">
                <div><span className="work-card-eyebrow">{work.departmentName}</span><span className="work-card-date">Hạn {formatWorkDate(work.deadline)}</span></div>
                <WorkStatus status={work.status} />
              </div>
              <h3>{work.content}</h3>
              <DepartmentProgress status={work.status} taskCount={work.tasks.length} />
              <div className="work-task-list">
                {work.tasks.map((task) => (
                  <div className="work-task-row" key={task._id}>
                    <span><strong>{task.title}</strong><small>Hạn {formatWorkDate(task.deadline)} · {task.assignees.map((person) => person.name).join(', ')}</small></span>
                    <WorkStatus status={task.status === 'completed' ? 'completed' : task.status === 'overdue' ? 'not_completed' : 'in_progress'} />
                  </div>
                ))}
              </div>
              <button type="button" className="work-outline-button" onClick={() => setAssigning(work)}>＋ Chỉ định công việc cá nhân</button>
            </article>
          ))}
        </div>
      ) : (
        <div className="work-user-list">
          {!data.personalTasks.length ? <div className="work-empty"><span>✓</span><h3>Không có đầu mục cần làm</h3><p>Khi cấp trên giao việc, đầu mục sẽ được hiển thị tại đây.</p></div> : data.personalTasks.map((task) => (
            <article className={`work-user-card personal-card ${task.status}`} key={task._id}>
              <div className="work-user-card-top"><span className="work-card-eyebrow">{task.departmentName}</span><WorkStatus status={task.status === 'pending' ? 'pending_task' : task.status} /></div>
              <h3>{task.title}</h3>
              <p>{task.documentContent}</p>
              <div className="work-card-meta"><span>Hạn hoàn thành <strong>{formatWorkDate(task.deadline)}</strong></span></div>
              {task.status === 'pending' ? <button type="button" className="work-primary-button" onClick={async () => { try { await completePersonalTask({ taskId: task._id }); } catch { setFeedback({ type: 'error', text: 'Không thể hoàn thành đầu mục này.' }); } }}>✓ Đã hoàn thành</button> : null}
              {task.status === 'overdue' ? <small className="work-overdue-note">Đã quá hạn — đầu mục được khóa, không thể xác nhận.</small> : null}
            </article>
          ))}
        </div>
      )}

      {assigning ? <PersonalTaskAssignModal work={assigning} users={data.assignableUsers} onClose={() => setAssigning(null)} onSubmit={handleAssign} saving={saving} /> : null}
    </section>
  );
}
