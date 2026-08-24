import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { messageFor } from '../lib/appErrorMessage';
import { vietnamTodayYmd } from './homeroomTime';
import {
  ARCHIVED_CLASSES_TITLE,
  ASSIGNMENT_REPLACE_WARNING,
  CURRENT_ASSIGNMENT_TITLE,
  HISTORICAL_ASSIGNMENT_TITLE,
  OPEN_CLASS_ACTION,
  UPCOMING_ASSIGNMENT_TITLE,
  assignmentDateRange,
  assignmentTypeLabel,
  buildClassArchivePayload,
  buildClassAssignmentPayload,
  buildClassCreatePayload,
  buildClassUpdatePayload,
  classStatusLabel,
  groupAssignmentsByEffect,
  userRoleLabel,
} from './classCatalog';

function canManageCatalog(session) {
  return Boolean(session?.isOperationalManager);
}

function Feedback({ error, success }) {
  return (
    <>
      {error ? <p className="homeroom-issue" role="alert">{error}</p> : null}
      {success ? <p className="homeroom-success" role="status">{success}</p> : null}
    </>
  );
}

function ClassForm({
  title,
  submitLabel,
  initial = { code: '', name: '', gradeLevel: 6, notes: '' },
  pending,
  error,
  success,
  onSubmit,
  onCancel = undefined,
}) {
  const [code, setCode] = useState(initial.code || '');
  const [name, setName] = useState(initial.name || '');
  const [gradeLevel, setGradeLevel] = useState(String(initial.gradeLevel || 6));
  const [notes, setNotes] = useState(initial.notes || '');

  return (
    <form
      className="homeroom-class-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        onSubmit({ code, name, gradeLevel, notes });
      }}
    >
      <h3>{title}</h3>
      <label>
        Mã lớp
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          required
          maxLength={20}
          pattern="[A-Za-z0-9_-]+"
          autoComplete="off"
          spellCheck={false}
          title="Chỉ dùng chữ, số, _ hoặc -"
        />
      </label>
      <label>
        Tên lớp
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={120}
          autoComplete="off"
        />
      </label>
      <label>
        Khối
        <select value={gradeLevel} onChange={(event) => setGradeLevel(event.target.value)} required>
          <option value="6">Khối 6</option>
          <option value="7">Khối 7</option>
          <option value="8">Khối 8</option>
          <option value="9">Khối 9</option>
        </select>
      </label>
      <label>
        Ghi chú
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
      </label>
      <Feedback error={error} success={success} />
      <div className="homeroom-class-actions">
        <button type="submit" className="primary-button" disabled={pending}>
          {pending ? 'Đang lưu…' : submitLabel}
        </button>
        {onCancel ? (
          <button type="button" disabled={pending} onClick={onCancel}>Hủy</button>
        ) : null}
      </div>
    </form>
  );
}

export function ClassCatalogPanel({ session, yearId, onOpenClass }) {
  const canManage = canManageCatalog(session);
  const classes = useQuery(
    anyApi.homeroomClasses.listScoped,
    canManage && yearId ? { schoolYearId: yearId, includeArchived: true } : 'skip',
  );
  const createClass = useMutation(anyApi.homeroomClasses.create);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!canManage) return null;

  const empty = classes !== undefined && !classes.length;
  const archived = (classes || []).filter((row) => row.status === 'archived');

  return (
    <section className="homeroom-panel homeroom-catalog-panel" aria-labelledby="homeroom-catalog-title">
      <div className="homeroom-toolbar">
        <div>
          <h3 id="homeroom-catalog-title">Quản lý lớp</h3>
          <p className="muted">
            {empty
              ? 'Chưa có lớp trong năm học này. Tạo lớp để giáo viên và giám thị bắt đầu làm việc.'
              : 'Tạo lớp mới cho năm học đang chọn. Sửa, lưu trữ và phân công nằm ở từng lớp.'}
          </p>
        </div>
        {!open ? (
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setOpen(true);
              setError('');
              setSuccess('');
            }}
          >
            {empty ? 'Tạo lớp đầu tiên' : 'Tạo lớp'}
          </button>
        ) : null}
      </div>
      {classes === undefined ? <p className="homeroom-empty">Đang tải danh sách lớp…</p> : null}
      {!open && success ? <p className="homeroom-success" role="status">{success}</p> : null}
      {open ? (
        <ClassForm
          title="Tạo lớp"
          submitLabel="Lưu lớp"
          pending={pending}
          error={error}
          success={success}
          onCancel={() => {
            if (pending) return;
            setOpen(false);
            setError('');
          }}
          onSubmit={async ({ code, name, gradeLevel, notes }) => {
            setPending(true);
            setError('');
            setSuccess('');
            try {
              await createClass(buildClassCreatePayload({
                schoolYearId: yearId,
                code,
                name,
                gradeLevel,
                notes,
              }));
              setSuccess('Đã tạo lớp.');
              setOpen(false);
            } catch (err) {
              setError(messageFor(err));
            } finally {
              setPending(false);
            }
          }}
        />
      ) : null}
      {archived.length ? (
        <div className="homeroom-archived-catalog">
          <h4>{ARCHIVED_CLASSES_TITLE}</h4>
          <ClassCards classes={archived} canManage={canManage} onOpenClass={onOpenClass} />
        </div>
      ) : null}
    </section>
  );
}

export function ClassCards({ classes, canManage, onOpenClass }) {
  if (!classes.length) {
    if (canManage) return null;
    return <p className="homeroom-empty">Không có lớp trong phạm vi của bạn.</p>;
  }

  return (
    <ul className="homeroom-class-cards">
      {classes.map((item) => (
        <li key={item._id} className="homeroom-card homeroom-class-card">
          <h3>{item.code} — {item.name}</h3>
          <p>Khối {item.gradeLevel}</p>
          <p>{classStatusLabel(item.status)}</p>
          <p>Sĩ số: {item.rosterCount ?? 0}</p>
          <div className="homeroom-class-actions">
            <button type="button" className="primary-button" onClick={() => onOpenClass(item._id)}>
              {OPEN_CLASS_ACTION}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AssignmentGroup({ title, empty, rows }) {
  return (
    <>
      <h4>{title}</h4>
      {!rows.length ? <p className="muted">{empty}</p> : (
        <ul className="homeroom-assignment-list">
          {rows.map((row) => (
            <li key={row._id} className="homeroom-assignment-item">
              <strong>{row.user?.name || 'Người dùng không còn hoạt động'}</strong>
              <span>{assignmentTypeLabel(row.assignmentType)} · {userRoleLabel(row.user?.role)}</span>
              <span>{assignmentDateRange(row)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function AssignmentList({ assignments, today }) {
  if (!assignments.length) return <p className="homeroom-empty">Chưa có phân công cho lớp này.</p>;
  const { current, upcoming, historical } = groupAssignmentsByEffect(assignments, today);
  return (
    <div className="homeroom-assignment-groups">
      <AssignmentGroup title={CURRENT_ASSIGNMENT_TITLE} empty="Chưa có phân công đang hiệu lực." rows={current} />
      <AssignmentGroup title={UPCOMING_ASSIGNMENT_TITLE} empty="Chưa có phân công sắp hiệu lực." rows={upcoming} />
      <AssignmentGroup title={HISTORICAL_ASSIGNMENT_TITLE} empty="Chưa có phân công đã kết thúc." rows={historical} />
    </div>
  );
}

export function ClassManagePanel({ classId, yearId: _yearId, detail, session, canManage }) {
  const allowed = canManage || canManageCatalog(session);
  const candidates = useQuery(anyApi.homeroomClasses.listAssignmentCandidates, allowed ? {} : 'skip');
  const updateClass = useMutation(anyApi.homeroomClasses.update);
  const archiveClass = useMutation(anyApi.homeroomClasses.archive);
  const assignUser = useMutation(anyApi.homeroomClasses.assignUser);
  const [pending, setPending] = useState(false);
  const [classError, setClassError] = useState('');
  const [classSuccess, setClassSuccess] = useState('');
  const [assignError, setAssignError] = useState('');
  const [assignSuccess, setAssignSuccess] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [userId, setUserId] = useState('');
  const [assignmentType, setAssignmentType] = useState('homeroom_teacher');
  const [effectiveFrom, setEffectiveFrom] = useState(() => vietnamTodayYmd());
  const today = vietnamTodayYmd();

  const classAssignments = useMemo(() => {
    return (detail?.assignments || [])
      .filter((row) => row.classId === classId && row.scopeKind === 'class')
      .slice()
      .sort((a, b) => String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)));
  }, [classId, detail?.assignments]);

  if (!allowed || !detail?.class) return null;

  const klass = detail.class;
  const archived = klass.status === 'archived';

  return (
    <section className="homeroom-manage-panel" aria-labelledby="homeroom-manage-title">
      <h3 id="homeroom-manage-title">Quản lý lớp</h3>
      <ClassForm
        title="Sửa thông tin lớp"
        submitLabel="Lưu thay đổi"
        initial={klass}
        pending={pending}
        error={classError}
        success={classSuccess}
        onSubmit={async ({ code, name, gradeLevel, notes }) => {
          setPending(true);
          setClassError('');
          setClassSuccess('');
          try {
            await updateClass(buildClassUpdatePayload({
              id: classId,
              code,
              name,
              gradeLevel,
              notes,
            }));
            setClassSuccess('Đã cập nhật lớp.');
          } catch (err) {
            setClassError(messageFor(err));
          } finally {
            setPending(false);
          }
        }}
      />
      {klass.status === 'archived' ? (
        <p className="muted">Lớp đã lưu trữ.</p>
      ) : confirmArchive ? (
        <div className="homeroom-class-actions">
          <p>Lưu trữ lớp này? Lớp sẽ không còn hiện trên tổng quan.</p>
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setClassError('');
              setClassSuccess('');
              try {
                await archiveClass(buildClassArchivePayload(classId));
                setClassSuccess('Đã lưu trữ lớp.');
                setConfirmArchive(false);
              } catch (err) {
                setClassError(messageFor(err));
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? 'Đang lưu trữ…' : 'Xác nhận lưu trữ'}
          </button>
          <button type="button" disabled={pending} onClick={() => setConfirmArchive(false)}>Không lưu trữ</button>
        </div>
      ) : (
        <button type="button" disabled={pending} onClick={() => setConfirmArchive(true)}>Lưu trữ lớp</button>
      )}

      {archived ? (
        <p className="muted">Lớp đã lưu trữ — không thể thêm phân công.</p>
      ) : (
      <form
        className="homeroom-assignment-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (pending || archived) return;
          setPending(true);
          setAssignError('');
          setAssignSuccess('');
          try {
            await assignUser(buildClassAssignmentPayload({
              classId,
              userId,
              assignmentType,
              effectiveFrom,
            }));
            setAssignSuccess('Đã lưu phân công.');
            setUserId('');
          } catch (err) {
            setAssignError(messageFor(err));
          } finally {
            setPending(false);
          }
        }}
      >
        <h3>Phân công giáo viên / giám thị</h3>
        <p className="muted">Chỉ phân công theo từng lớp. Ngày hiệu lực dùng lịch Việt Nam.</p>
        <label>
          Người được phân công
          <select value={userId} onChange={(event) => setUserId(event.target.value)} required>
            <option value="">{candidates === undefined ? 'Đang tải người dùng…' : 'Chọn người dùng đang hoạt động'}</option>
            {(candidates || []).map((user) => (
              <option key={user._id} value={user._id}>
                {user.name} — {userRoleLabel(user.role)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Vai trò tại lớp
          <select value={assignmentType} onChange={(event) => setAssignmentType(event.target.value)} required>
            <option value="homeroom_teacher">Giáo viên chủ nhiệm</option>
            <option value="supervisor">Giám thị</option>
          </select>
        </label>
        <label>
          Hiệu lực từ
          <input
            type="date"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
            required
          />
        </label>
        {assignmentType === 'homeroom_teacher' ? (
          <p className="homeroom-issue warn" role="note">{ASSIGNMENT_REPLACE_WARNING}</p>
        ) : null}
        <Feedback error={assignError} success={assignSuccess} />
        <button type="submit" className="primary-button" disabled={pending || archived || !userId || candidates === undefined}>
          {pending ? 'Đang lưu phân công…' : 'Lưu phân công'}
        </button>
      </form>
      )}

      <AssignmentList assignments={classAssignments} today={today} />
    </section>
  );
}
