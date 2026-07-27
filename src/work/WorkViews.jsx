import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { useNotificationFocus } from '../notifications/useNotificationFocus';
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
    completed_late: 'Hoàn thành trễ',
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
      type: 'department',
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
        <p className="work-modal-context">Toàn bộ thành viên phòng ban sẽ thấy việc và hạn chót sau khi công văn được duyệt.</p>
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

function IndividualAssignmentModal({ users, selectedUserIds, onClose, onDone }) {
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [content, setContent] = useState('');
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState('');
  const availableUsers = users.filter((user) => !selectedUserIds.includes(String(user._id)));
  const submit = (event) => {
    event.preventDefault();
    if (!assigneeIds.length || !content.trim() || !deadline) {
      setError('Vui lòng chọn người nhận, nội dung và hạn chót.');
      return;
    }
    const selected = availableUsers.filter((user) => assigneeIds.includes(String(user._id)));
    onDone({
      type: 'individual',
      userIds: selected.map((user) => String(user._id)),
      userNames: selected.map((user) => user.name),
      content: content.trim(),
      deadline,
    });
  };
  return (
    <div className="work-modal-backdrop" role="presentation">
      <form className="work-modal department-assignment-modal" onSubmit={submit}>
        <button type="button" className="work-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        <span className="work-kicker">Phân công · Cá nhân</span>
        <h3>Thêm cá nhân nhận việc</h3>
        <p className="work-modal-context">Người được chọn nhận task riêng; nếu cũng thuộc phòng ban được giao thì chỉ tính task cá nhân.</p>
        <div className="work-field-label">Người nhận việc <small>{assigneeIds.length} người</small></div>
        <div className="work-assignee-list">
          {availableUsers.map((person) => (
            <label key={person._id} className={assigneeIds.includes(String(person._id)) ? 'is-selected' : ''}>
              <input
                type="checkbox"
                checked={assigneeIds.includes(String(person._id))}
                onChange={() => setAssigneeIds((current) =>
                  current.includes(String(person._id))
                    ? current.filter((id) => id !== String(person._id))
                    : [...current, String(person._id)],
                )}
              />
              <span className="work-person-avatar" aria-hidden="true">{String(person.name).trim().slice(0, 1).toUpperCase()}</span>
              <span>
                <strong>{person.name}</strong>
                <small>{person.departmentName || 'Chưa gán PB'} · {person.positionName || 'Chưa gán chức vụ'}</small>
              </span>
            </label>
          ))}
          {!availableUsers.length ? <p className="work-muted">Không còn cá nhân nào để chọn.</p> : null}
        </div>
        <label className="work-field-label" htmlFor="individual-content">
          Nội dung công việc <small>{content.length}/2000</small>
        </label>
        <textarea
          id="individual-content"
          value={content}
          maxLength={2000}
          rows={5}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Nhập yêu cầu dành cho cá nhân…"
          required
        />
        <label className="work-field-label" htmlFor="individual-deadline">Hạn chót hoàn thành</label>
        <input id="individual-deadline" type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} required />
        {error ? <div className="work-feedback error">{error}</div> : null}
        <div className="work-modal-actions">
          <button type="button" className="work-ghost-button" onClick={onClose}>Hủy</button>
          <button type="submit" className="work-primary-button" disabled={!assigneeIds.length}>Xong</button>
        </div>
      </form>
    </div>
  );
}

export function WorkManagement({ allowCreate = true, focusTarget = null }) {
  const options = useQuery(anyApi.work.formOptions, allowCreate ? {} : 'skip');
  const documents = useQuery(anyApi.work.listAdmin);
  const generateUploadUrl = useMutation(anyApi.work.generateUploadUrl);
  const createDocument = useMutation(anyApi.work.createDocument);
  const [open, setOpen] = useState(allowCreate);
  const [file, setFile] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [assignmentModal, setAssignmentModal] = useState('');
  const [approverIds, setApproverIds] = useState([]);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);

  useNotificationFocus(focusTarget, {
    acceptSourceTypes: ['approval', 'department_work', 'personal_task'],
  });

  const reset = () => {
    setFile(null);
    setAssignments([]);
    setApproverIds([]);
  };

  const submit = async (event) => {
    event.preventDefault();
    setFeedback({ type: '', text: '' });
    if (!file) return setFeedback({ type: 'error', text: 'Vui lòng tải công văn lên trước.' });
    if (!assignments.length || !approverIds.length) {
      return setFeedback({ type: 'error', text: 'Vui lòng thêm ít nhất một phân công và chọn người duyệt.' });
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
        assignments: assignments.map((item) => (
          item.type === 'individual'
            ? {
                type: 'individual',
                userIds: item.userIds,
                content: item.content,
                deadline: item.deadline,
              }
            : {
                type: 'department',
                departmentId: item.departmentId,
                content: item.content,
                deadline: item.deadline,
              }
        )),
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

  if ((allowCreate && options === undefined) || documents === undefined) {
    return <div className="work-loading">Đang chuẩn bị sổ công việc…</div>;
  }

  const selectedDepartmentIds = assignments
    .filter((item) => item.type !== 'individual')
    .map((item) => String(item.departmentId));
  const selectedUserIds = assignments
    .filter((item) => item.type === 'individual')
    .flatMap((item) => item.userIds.map(String));
  const isAdminModMode = (options?.assignerMode || 'admin_mod') === 'admin_mod';

  return (
    <section className="work-management">
      <header className="work-hero">
        <div>
          <span className="work-kicker">Thiết lập · Công việc</span>
          <h2>Sổ công văn &amp; tiến độ</h2>
          <p>
            {isAdminModMode
              ? 'Giao việc cho phòng ban hoặc cá nhân; task chỉ hiện sau khi công văn được duyệt.'
              : 'Gửi đúng người duyệt, giao đúng phòng ban; cấp trên sẽ chia việc cho cấp dưới.'}
          </p>
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
        {allowCreate ? (
          <button type="button" className="work-primary-button" onClick={() => setOpen((value) => !value)}>
            <span>{open ? '×' : '+'}</span> {open ? 'Đóng biểu mẫu' : 'Thêm công văn'}
          </button>
        ) : null}
      </div>

      {allowCreate && open ? (
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
                <h4>Người nhận việc</h4>
              </div>
              <div className="work-assignment-actions">
                <button type="button" className="work-outline-button" onClick={() => setAssignmentModal('department')}>
                  ＋ Phòng ban
                </button>
                {isAdminModMode ? (
                  <button type="button" className="work-outline-button" onClick={() => setAssignmentModal('individual')}>
                    ＋ Cá nhân
                  </button>
                ) : null}
              </div>
            </header>
            {assignments.length ? (
              <div className="work-assignment-table">
                <div className="work-assignment-table-head">
                  <span>Đối tượng</span>
                  <span>Nội dung công việc</span>
                  <span>Hạn chót</span>
                  <span />
                </div>
                {assignments.map((assignment, index) => (
                  <div className="work-assignment-row" key={`${assignment.type}-${assignment.departmentId || assignment.userIds?.join('-')}-${index}`}>
                    <strong>
                      {assignment.type === 'individual'
                        ? `Cá nhân · ${assignment.userNames?.join(', ')}`
                        : assignment.departmentName}
                    </strong>
                    <span>{assignment.content}</span>
                    <time>{formatWorkDate(assignment.deadline)}</time>
                    <button
                      type="button"
                      onClick={() => setAssignments((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                      aria-label="Xóa phân công"
                      title="Xóa phân công"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="work-assignment-empty">
                <span>⌁</span>
                <p>
                  {isAdminModMode
                    ? 'Chưa có phân công. Thêm phòng ban và/hoặc cá nhân nhận việc.'
                    : 'Chưa có phòng ban nhận việc. Mỗi phòng ban sẽ có nội dung và hạn chót riêng.'}
                </p>
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

      {allowCreate && assignmentModal === 'department' ? (
        <DepartmentAssignmentModal
          departments={options.departments}
          selectedDepartmentIds={selectedDepartmentIds}
          onClose={() => setAssignmentModal('')}
          onDone={(assignment) => {
            setAssignments((current) => [...current, assignment]);
            setAssignmentModal('');
          }}
        />
      ) : null}

      {allowCreate && assignmentModal === 'individual' ? (
        <IndividualAssignmentModal
          users={options.users || []}
          selectedUserIds={selectedUserIds}
          onClose={() => setAssignmentModal('')}
          onDone={(assignment) => {
            setAssignments((current) => [...current, assignment]);
            setAssignmentModal('');
          }}
        />
      ) : null}

      <div className="work-document-grid">
        {documents.length ? documents.map((document) => (
          <article className="work-document-card" key={document._id} data-focus-id={document._id}>
            <div className="work-document-topline">
              <span className={`work-file-badge ${document.fileType.includes('pdf') ? 'pdf' : 'doc'}`}>{document.fileName.split('.').pop().toUpperCase()}</span>
              <WorkStatus status={document.status} />
              <time>{document.assignmentCount} phân công</time>
            </div>
            <h3>{document.fileName}</h3>
            <div className="work-document-meta">
              <span>Tệp đính kèm</span>
              {document.fileUrl ? <a href={document.fileUrl} target="_blank" rel="noreferrer">{document.fileName} · {fileSizeLabel(document.fileSize)}</a> : <strong>{document.fileName}</strong>}
            </div>
            <div className="work-document-assignments">
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
                        </span>
                      ))}
                    </div>
                  ) : null}
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
          <div className="work-empty">
            <span>✦</span>
            <h3>Chưa có công văn nào</h3>
            <p>{allowCreate ? 'Bấm “Thêm công văn” để bắt đầu giao việc.' : 'Công văn được tạo tại Quản trị hệ thống → Quản lý công việc.'}</p>
          </div>
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
  const approveDocument = useMutation(anyApi.work.approveDocument);
  const rejectDocument = useMutation(anyApi.work.rejectDocument);
  const createPersonalTask = useMutation(anyApi.work.createPersonalTask);
  const completePersonalTask = useMutation(anyApi.work.completePersonalTask);
  const completeWorkItem = useMutation(anyApi.work.completeWorkItem);
  const [assigning, setAssigning] = useState(null);
  const [saving, setSaving] = useState(false);
  const [completingId, setCompletingId] = useState('');
  const [decidingId, setDecidingId] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const isApprover = (data?.level || 0) >= 4;
  const isAssigner = data?.level === 2 || data?.level === 3;
  const isAdminMod = (data?.assignerMode || 'admin_mod') === 'admin_mod';

  useNotificationFocus(focusTarget, {
    acceptSourceTypes: ['approval', 'department_work', 'personal_task'],
  });

  const stats = useMemo(() => {
    if (!data) return { total: 0, done: 0 };
    if (isAdminMod) {
      const tasks = data.myTasks || [];
      const approvalsPending = (data.approvals || []).filter((item) => item.status === 'pending').length;
      return {
        total: tasks.length + (data.approvals || []).length,
        done: tasks.filter((item) => item.status === 'completed' || item.status === 'completed_late').length
          + (data.approvals || []).filter((item) => item.status === 'approved' || item.status === 'rejected').length,
        pendingApprovals: approvalsPending,
      };
    }
    if (isApprover) {
      return {
        total: data.approvals.length,
        done: data.approvals.filter((item) => item.status === 'approved' || item.status === 'rejected').length,
      };
    }
    if (isAssigner) {
      return {
        total: data.departmentWorks.length,
        done: data.departmentWorks.filter((item) => item.status === 'completed').length,
      };
    }
    return {
      total: data.personalTasks.length,
      done: data.personalTasks.filter((item) => item.status === 'completed' || item.status === 'completed_late').length,
    };
  }, [data, isAdminMod, isApprover, isAssigner]);

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

  const handleCompleteWorkItem = async (workItemId) => {
    setCompletingId(workItemId);
    setFeedback({ type: '', text: '' });
    try {
      await completeWorkItem({ workItemId });
      setFeedback({ type: 'success', text: 'Đã ghi nhận hoàn thành.' });
    } catch {
      setFeedback({ type: 'error', text: 'Không thể đánh dấu hoàn thành lúc này.' });
    } finally {
      setCompletingId('');
    }
  };

  const handleCompletePersonal = async (taskId) => {
    setCompletingId(taskId);
    setFeedback({ type: '', text: '' });
    try {
      await completePersonalTask({ taskId });
      setFeedback({ type: 'success', text: 'Đã ghi nhận hoàn thành.' });
    } catch {
      setFeedback({ type: 'error', text: 'Không thể hoàn thành đầu mục này.' });
    } finally {
      setCompletingId('');
    }
  };

  const title = isAdminMod
    ? (isApprover ? 'Duyệt công văn & việc của tôi' : 'Công việc cần làm')
    : (isApprover ? 'Công văn cần duyệt' : isAssigner ? 'Công việc phòng ban' : 'Công việc cần làm');

  const subtitle = isAdminMod
    ? (isApprover
      ? 'Duyệt công văn được chỉ định và hoàn thành các task giao đích danh hoặc theo phòng ban.'
      : 'Các công việc được Admin/Mod giao cho bạn hoặc phòng ban; hoàn thành đúng hạn.')
    : (isApprover
      ? 'Duyệt công văn được chỉ định và theo dõi tiến độ hoàn thành của phòng ban nhận việc.'
      : isAssigner
        ? 'Chia nhỏ công việc phòng ban thành các đầu mục rõ người, rõ hạn.'
        : 'Các đầu mục được giao cho bạn, hoàn thành đúng hạn để khép lại công việc phòng ban.');

  return (
    <section className="work-user-view">
      <header className="work-hero">
        <div>
          <span className="work-kicker">Không gian · Công việc</span>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <div className="work-hero-stamp">
          <strong>{stats.done}<small>/{stats.total}</small></strong>
          <span>ĐÃ XONG</span>
        </div>
      </header>

      {feedback.text ? <div className={`work-feedback ${feedback.type}`}>{feedback.text}</div> : null}

      {isApprover ? (
        <div className="work-user-list">
          {!data.approvals.length ? (
            <div className="work-empty"><span>✓</span><h3>Không có công văn cần xử lý</h3><p>Khi Admin chỉ định bạn duyệt, hồ sơ sẽ xuất hiện tại đây.</p></div>
          ) : data.approvals.map((document) => {
            const ownApproval = document.approvers.find((person) => String(person._id) === String(data.userId));
            const canDecide = document.status === 'pending' && ownApproval && !ownApproval.approved && !ownApproval.rejected;
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
                {document.fileUrl ? <a className="work-file-link" href={document.fileUrl} target="_blank" rel="noreferrer">↗ Mở {document.fileName}</a> : null}
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
      ) : null}

      {isAdminMod ? (
        <div className="work-user-list">
          {isApprover ? <h3 className="work-section-title">Công việc được giao</h3> : null}
          {!(data.myTasks || []).length ? (
            <div className="work-empty">
              <span>✓</span>
              <h3>Không có công việc cần làm</h3>
              <p>Khi Admin/Mod giao việc và công văn được duyệt, task sẽ hiện tại đây.</p>
            </div>
          ) : data.myTasks.map((task) => (
            <article className={`work-user-card personal-card ${task.status}`} key={task._id} data-focus-id={task._id}>
              <div className="work-user-card-top">
                <span className="work-card-eyebrow">
                  {task.type === 'individual' ? 'Cá nhân' : task.departmentName}
                </span>
                <WorkStatus status={task.status === 'pending' ? 'pending_task' : task.status} />
              </div>
              <h3>{task.content}</h3>
              <p>{task.documentContent}</p>
              <div className="work-card-meta">
                <span>Hạn hoàn thành <strong>{formatWorkDate(task.deadline)}</strong></span>
                {task.type === 'department' ? (
                  <span>Tập thể · <strong>{workStatusLabel(task.collectiveStatus)}</strong></span>
                ) : null}
              </div>
              {task.fileUrl ? <a className="work-file-link" href={task.fileUrl} target="_blank" rel="noreferrer">↗ Mở công văn</a> : null}
              {task.type === 'department' && task.pendingMembers?.length ? (
                <div className="work-member-progress">
                  <strong className="work-pending-label">Chưa hoàn thành:</strong>
                  {task.pendingMembers.map((member) => (
                    <span key={member._id} className={`work-member-chip status-${member.status}`}>
                      {member.name}
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
                      </span>
                    ))}
                  </div>
                </details>
              ) : null}
              {task.status === 'pending' || task.status === 'pending_task' || task.status === 'overdue' ? (
                <button
                  type="button"
                  className="work-primary-button"
                  disabled={completingId === task._id}
                  onClick={() => void handleCompleteWorkItem(task._id)}
                >
                  {task.status === 'overdue' ? '✓ Hoàn thành (trễ hạn)' : '✓ Đã hoàn thành'}
                </button>
              ) : null}
              {task.status === 'completed_late' ? (
                <small className="work-overdue-note">Đã hoàn thành trễ hạn — sẽ ghi nhận vào KPI.</small>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {!isAdminMod && isAssigner ? (
        <div className="work-user-list">
          {!data.departmentWorks.length ? <div className="work-empty"><span>⌁</span><h3>Chưa có công việc phòng ban</h3><p>Công việc sẽ xuất hiện sau khi công văn được duyệt đủ.</p></div> : data.departmentWorks.map((work) => (
            <article className="work-user-card" key={work._id} data-focus-id={work._id}>
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
                    <WorkStatus status={task.status === 'completed' || task.status === 'completed_late' ? task.status : task.status === 'overdue' ? 'not_completed' : 'in_progress'} />
                  </div>
                ))}
              </div>
              <button type="button" className="work-outline-button" onClick={() => setAssigning(work)}>＋ Chỉ định công việc cá nhân</button>
            </article>
          ))}
        </div>
      ) : null}

      {!isAdminMod && !isApprover && !isAssigner ? (
        <div className="work-user-list">
          {!data.personalTasks.length ? <div className="work-empty"><span>✓</span><h3>Không có đầu mục cần làm</h3><p>Khi cấp trên giao việc, đầu mục sẽ được hiển thị tại đây.</p></div> : data.personalTasks.map((task) => (
            <article className={`work-user-card personal-card ${task.status}`} key={task._id} data-focus-id={task._id}>
              <div className="work-user-card-top"><span className="work-card-eyebrow">{task.departmentName}</span><WorkStatus status={task.status === 'pending' ? 'pending_task' : task.status} /></div>
              <h3>{task.title}</h3>
              <p>{task.documentContent}</p>
              <div className="work-card-meta"><span>Hạn hoàn thành <strong>{formatWorkDate(task.deadline)}</strong></span></div>
              {task.status === 'pending' || task.status === 'overdue' ? (
                <button
                  type="button"
                  className="work-primary-button"
                  disabled={completingId === task._id}
                  onClick={() => void handleCompletePersonal(task._id)}
                >
                  {task.status === 'overdue' ? '✓ Hoàn thành (trễ hạn)' : '✓ Đã hoàn thành'}
                </button>
              ) : null}
              {task.status === 'completed_late' ? (
                <small className="work-overdue-note">Đã hoàn thành trễ hạn — sẽ ghi nhận vào KPI.</small>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {assigning ? <PersonalTaskAssignModal work={assigning} users={data.assignableUsers} onClose={() => setAssigning(null)} onSubmit={handleAssign} saving={saving} /> : null}
    </section>
  );
}
