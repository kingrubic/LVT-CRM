import React, { useEffect, useMemo, useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { homeroomPathname, routeForPathname } from '../navigationRoutes';
import { downloadRosterImportTemplate } from '../lib/rosterImportExcel';
import { downloadAttendanceImportTemplate } from '../lib/attendanceImportExcel';
import {
  attendanceReplaceModeChoices,
  buildAttendancePublishArgs,
  buildAttendanceValidateArgs,
  buildConfirmedAttendanceValidateArgs,
  canExplicitlyConfirmNameMatches,
  isAttendanceReplaceModeRequired,
  proposedUniqueNameMatches,
} from './attendanceImportPreview';
import { AttendanceReportsTable } from './AttendanceReportsTable';
import { downloadAttendancePdf, downloadAttendanceXlsx } from './homeroomExport';
import { vietnamTodayYmd } from './homeroomTime';
import { ClassCards, ClassCatalogPanel, ClassManagePanel } from './HomeroomClassCatalog';
import {
  BACK_TO_OVERVIEW,
  DOWNLOAD_ATTENDANCE_TEMPLATE_ACTION,
  IMPORT_ATTENDANCE_ACTION,
  MANAGE_CLASSES_ACTION,
  TEACHER_OVERVIEW_TITLE,
  filterActiveClasses,
  classStatusLabel,
} from './classCatalog';
import { HomeroomStudentQueryErrorBoundary } from './studentQueryErrorBoundary';
import { messageFor } from '../lib/appErrorMessage';
import './homeroom.css';

const STATUS_TEXT = {
  present: 'Có mặt',
  late: 'Đi trễ',
  absent_excused: 'Vắng có phép',
  absent_unexcused: 'Vắng không phép',
  absent_pending: 'Vắng chờ xử lý',
  no_data: 'Chưa có dữ liệu',
  exempt: 'Miễn',
};

function statusChip(status) {
  const key = status || 'no_data';
  return (
    <span className={`homeroom-status ${key}`}>
      <span aria-hidden="true">●</span>
      {STATUS_TEXT[key] || key}
    </span>
  );
}

function Glyph({ children, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function studentInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

function parseHomeroomPath(pathname) {
  const normalized = routeForPathname(pathname)?.homeroomPath || '/lop-chu-nhiem';
  const parts = normalized.split('/').filter(Boolean);
  if (parts[1] === 'quan-ly-lop') return { view: 'manage' };
  if (parts[1] === 'import-diem-danh') {
    return { view: 'import', classId: parts[2] ? decodeURIComponent(parts[2]) : undefined };
  }
  if (parts[1] === 'hoc-sinh' && parts[2]) return { view: 'student', studentId: decodeURIComponent(parts[2]) };
  if (parts[1] === 'lop' && parts[2]) {
    return { view: 'class', classId: decodeURIComponent(parts[2]), tab: parts[3] || 'danh-sach' };
  }
  return { view: 'overview' };
}

export default function HomeroomRouter({ session }) {
  const [path, setPath] = useState(() => window.location.pathname);
  const route = useMemo(() => parseHomeroomPath(path), [path]);
  const years = useQuery(anyApi.schoolYears.list, {});
  const [yearId, setYearId] = useState('');
  const selectedYearId = yearId || years?.find((item) => item.active)?._id || years?.[0]?._id || '';
  const overview = useQuery(anyApi.homeroomReports.overview, selectedYearId ? { schoolYearId: selectedYearId } : 'skip');
  const createSchoolYear = useMutation(anyApi.schoolYears.create);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = (next) => {
    if (window.location.pathname !== next) window.history.pushState({}, '', next);
    setPath(next);
  };

  if (years === undefined) return <p className="homeroom-empty">Đang tải lớp chủ nhiệm…</p>;

  return (
    <section className="homeroom-view">
      <div className="homeroom-toolbar homeroom-toolbar-main">
        <label className="homeroom-year-field">
          Năm học
          <select value={selectedYearId} onChange={(e) => setYearId(e.target.value)} disabled={!years?.length}>
            {!years?.length ? <option value="">Chưa có năm học</option> : null}
            {(years || []).map((year) => (
              <option key={year._id} value={year._id}>{year.name}</option>
            ))}
          </select>
        </label>
        <div className="homeroom-toolbar-nav">
          <button type="button" className="primary-button" onClick={() => go(homeroomPathname())}>Tổng quan</button>
          {session?.isOperationalManager ? (
            <button type="button" className="homeroom-ghost-button" onClick={() => go(homeroomPathname({ manageClasses: true }))}>
              {MANAGE_CLASSES_ACTION}
            </button>
          ) : null}
          {selectedYearId && (session?.isOperationalManager || session?.menuAccess?.homeroom === 'supervisor') ? (
            <button type="button" className="homeroom-ghost-button" onClick={() => go(homeroomPathname({ importAttendance: true }))}>Nhập điểm danh camera</button>
          ) : null}
        </div>
      </div>
      {!selectedYearId ? (
        <EmptySchoolYearState canCreate={Boolean(session?.isOperationalManager)} onCreate={createSchoolYear} />
      ) : route.view === 'overview' ? (
        <HomeroomOverview
          overview={overview}
          yearId={selectedYearId}
          session={session}
          onOpenClass={(id) => go(homeroomPathname({ classId: id }))}
          onImportClass={(id) => go(homeroomPathname({ importAttendance: true, classId: id }))}
        />
      ) : route.view === 'manage' ? (
        session?.isOperationalManager ? (
          <ClassCatalogPanel
            session={session}
            yearId={selectedYearId}
            onOpenClass={(id) => go(homeroomPathname({ classId: id }))}
          />
        ) : (
          <p className="homeroom-issue" role="alert">Chỉ quản trị viên mới được quản lý lớp.</p>
        )
      ) : route.view === 'class' ? (
        <ClassDetail
          classId={route.classId}
          tab={route.tab}
          yearId={selectedYearId}
          session={session}
          onTab={(tab) => go(homeroomPathname({ classId: route.classId, tab }))}
          onOpenStudent={(id) => go(homeroomPathname({ studentId: id }))}
          onBack={() => go(homeroomPathname())}
          onImportAttendance={() => go(homeroomPathname({ importAttendance: true, classId: route.classId }))}
        />
      ) : route.view === 'student' ? (
        <HomeroomStudentQueryErrorBoundary onBack={() => go(homeroomPathname())}>
          <StudentDetail studentId={route.studentId} />
        </HomeroomStudentQueryErrorBoundary>
      ) : route.view === 'import' ? (
        <AttendanceImportView yearId={selectedYearId} classId={route.classId} session={session} />
      ) : null}
    </section>
  );
}

function EmptySchoolYearState({ canCreate, onCreate }) {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  if (!canCreate) {
    return (
      <div className="homeroom-panel">
        <h2>Chưa cấu hình năm học</h2>
        <p className="homeroom-empty">Vui lòng liên hệ quản trị viên để tạo năm học trước khi sử dụng Lớp chủ nhiệm.</p>
      </div>
    );
  }

  return (
    <form
      className="homeroom-panel"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError('');
        try {
          await onCreate({ name, startDate, endDate, active: true });
        } catch (err) {
          setError(messageFor(err));
        } finally {
          setPending(false);
        }
      }}
    >
      <h2>Thiết lập năm học đầu tiên</h2>
      <p className="muted">Hệ thống chưa có năm học. Nhập đúng thời gian áp dụng; dữ liệu này được dùng để phân lớp và tính điểm danh.</p>
      <div className="homeroom-filters">
        <label>Tên năm học<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: 2026–2027" required /></label>
        <label>Ngày bắt đầu<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></label>
        <label>Ngày kết thúc<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required /></label>
      </div>
      {error ? <p className="homeroom-issue">{error}</p> : null}
      <button type="submit" className="primary-button" disabled={pending}>
        {pending ? 'Đang tạo năm học…' : 'Tạo năm học'}
      </button>
    </form>
  );
}

function HomeroomOverview({ overview, yearId, session, onOpenClass, onImportClass }) {
  if (overview === undefined) return <p className="homeroom-empty">Đang tải tổng quan…</p>;
  const counts = overview.summary?.counts || {};
  const showSupervisorImportPicker = session?.menuAccess?.homeroom === 'supervisor' && !session?.isOperationalManager;
  return (
    <div className="homeroom-overview">
      <div className="homeroom-cards">
        <article className="homeroom-card"><span>Lớp đang chủ nhiệm</span><strong>{overview.classes.length}</strong></article>
        <article className="homeroom-card"><span>Học sinh</span><strong>{overview.studentCount}</strong></article>
        <article className="homeroom-card"><span>Có mặt hôm nay</span><strong>{counts.present || 0}</strong></article>
        <article className="homeroom-card"><span>Trễ</span><strong>{counts.late || 0}</strong></article>
        <article className="homeroom-card"><span>Vắng chờ xử lý</span><strong>{counts.absent_pending || 0}</strong></article>
      </div>
      <div className="homeroom-panel">
        <h3>{TEACHER_OVERVIEW_TITLE}</h3>
        <ClassCards classes={overview.classes} canManage={false} onOpenClass={onOpenClass} />
      </div>
      {showSupervisorImportPicker ? (
        <AttendanceImportClassPicker yearId={yearId} onImportClass={onImportClass} />
      ) : null}
      <div className="homeroom-panel">
        <h3>Cảnh báo</h3>
        {overview.missingUpload?.scopeEmpty ? (
          <p className="muted">Không có lớp đang chủ nhiệm — không có cảnh báo toàn trường.</p>
        ) : overview.missingUpload?.shouldAlert ? (
          <div>
            <p className="homeroom-issue">Chưa có file điểm danh đã công bố sau {overview.missingUpload.cutoffTime}.</p>
            {(overview.missingUpload.missingClasses || []).map((item) => (
              <p key={item.classId} className="homeroom-issue">
                Thiếu file lớp {item.code} — {item.name}
              </p>
            ))}
          </div>
        ) : overview.missingUpload?.calendarStatus === 'unconfigured' ? (
          <p className="muted">Chưa cấu hình lịch ngày học (IN-020). Không suy ngày nghỉ từ thứ trong tuần.</p>
        ) : (
          <p className="muted">Không có cảnh báo thiếu file đã công bố.</p>
        )}
        {overview.unresolvedAbsences?.length ? (
          <p className="homeroom-issue">Còn {overview.unresolvedAbsences.length} buổi vắng chờ phân loại.</p>
        ) : null}
      </div>
    </div>
  );
}

function AttendanceImportClassPicker({ yearId, onImportClass }) {
  const classes = useQuery(
    anyApi.homeroomClasses.listForAttendanceImport,
    yearId ? { schoolYearId: yearId } : 'skip',
  );
  const active = filterActiveClasses(classes);
  return (
    <div className="homeroom-panel">
      <h3>Nhập điểm danh theo lớp</h3>
      <p className="muted">Giám thị và quản trị có thể nhập file điểm danh cho mọi lớp đang hoạt động — không cần phân công chủ nhiệm.</p>
      {classes === undefined ? <p className="homeroom-empty">Đang tải lớp để nhập điểm danh…</p> : null}
      {classes !== undefined && !active.length ? (
        <p className="homeroom-empty">Chưa có lớp đang hoạt động để nhập điểm danh.</p>
      ) : null}
      {active.length ? (
        <ul className="homeroom-class-cards">
          {active.map((item) => (
            <li key={item._id} className="homeroom-card homeroom-class-card">
              <h3>{item.code} — {item.name}</h3>
              <p>Khối {item.gradeLevel}</p>
              <div className="homeroom-class-actions">
                <button type="button" className="primary-button" onClick={() => onImportClass(item._id)}>
                  {IMPORT_ATTENDANCE_ACTION}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ClassDetail({ classId, tab, yearId, session, onTab, onOpenStudent, onBack, onImportAttendance }) {
  const detail = useQuery(anyApi.homeroomClasses.getScoped, { classId });
  const roster = useQuery(anyApi.students.listByClass, { classId });
  const [importOpen, setImportOpen] = useState(false);
  if (detail === undefined) return <p className="homeroom-empty">Đang tải lớp…</p>;
  const archived = detail.class.status === 'archived';
  const rosterTab = tab !== 'diem-danh' && tab !== 'bao-cao';
  const canImportRoster = !archived && Boolean(session?.isOperationalManager);
  const canImportAttendance = !archived && Boolean(session?.isOperationalManager || session?.menuAccess?.homeroom === 'supervisor');
  return (
    <div className="homeroom-class-workspace">
      <div className="homeroom-panel homeroom-class-panel">
        <div className="homeroom-class-header">
          <div>
            <h2>{detail.class.code} — {detail.class.name}</h2>
            <p className="homeroom-class-meta">
              <span>Sĩ số hiện tại: {detail.rosterCount}</span>
              <span className={`homeroom-status ${archived ? 'no_data' : 'present'}`}>
                <span aria-hidden="true">●</span>
                {classStatusLabel(detail.class.status)}
              </span>
            </p>
          </div>
          {rosterTab ? (
            <div className="homeroom-class-header-actions">
              {canImportRoster ? (
                <button type="button" className="homeroom-ghost-button" onClick={() => downloadRosterImportTemplate()}>
                  <Glyph>
                    <path d="M12 3v12" />
                    <path d="m8 11 4 4 4-4" />
                    <path d="M5 21h14" />
                  </Glyph>
                  Tải mẫu Excel
                </button>
              ) : null}
              {canImportRoster ? (
                <button type="button" className="primary-button" onClick={() => setImportOpen(true)}>
                  <Glyph>
                    <path d="M12 21V9" />
                    <path d="m8 13 4-4 4 4" />
                    <path d="M5 3h14" />
                  </Glyph>
                  Nhập danh sách
                </button>
              ) : null}
              {canImportAttendance ? (
                <button type="button" className="homeroom-ghost-button" onClick={() => downloadAttendanceImportTemplate()}>
                  {DOWNLOAD_ATTENDANCE_TEMPLATE_ACTION}
                </button>
              ) : null}
              {canImportAttendance ? (
                <button type="button" className="primary-button" onClick={onImportAttendance}>
                  {IMPORT_ATTENDANCE_ACTION}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {archived ? (
          <p className="homeroom-issue warn" role="status">
            {classStatusLabel('archived')}. Không thể phân công, nhập danh sách hoặc dùng camera.
          </p>
        ) : null}
        <nav className="homeroom-tabs" aria-label="Điều hướng lớp">
          <button type="button" className="homeroom-overview-button" aria-label={BACK_TO_OVERVIEW} onClick={onBack}>
            <Glyph>
              <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
              <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
              <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
              <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
            </Glyph>
            Tổng quan
          </button>
          <button type="button" aria-current={rosterTab ? 'page' : undefined} onClick={() => onTab('danh-sach')}>
            <Glyph>
              <circle cx="9" cy="8" r="3" />
              <path d="M4 19.5c.9-3.2 2.8-4.8 5-4.8s4.1 1.6 5 4.8" />
              <circle cx="16.5" cy="8.5" r="2.2" />
              <path d="M15.4 14.6c2 0 3.6 1.1 4.4 3.4" />
            </Glyph>
            Danh sách học sinh
          </button>
          <button type="button" aria-current={tab === 'diem-danh' ? 'page' : undefined} onClick={() => onTab('diem-danh')}>
            <Glyph>
              <rect x="4" y="5" width="16" height="15" rx="2" />
              <path d="M8 3.5v3M16 3.5v3M4 10h16" />
            </Glyph>
            Điểm danh
          </button>
          <button type="button" aria-current={tab === 'bao-cao' ? 'page' : undefined} onClick={() => onTab('bao-cao')}>
            <Glyph>
              <path d="M4 19.5V10.5" />
              <path d="M10 19.5V5.5" />
              <path d="M16 19.5v-6" />
              <path d="M22 19.5H2" />
            </Glyph>
            Báo cáo
          </button>
        </nav>
        {tab === 'diem-danh' ? (
          <DailyAttendanceRegister classId={classId} session={session} onOpenStudent={onOpenStudent} />
        ) : tab === 'bao-cao' ? (
          <AttendanceReports classId={classId} yearId={yearId} />
        ) : (
          <StudentRoster
            classId={classId}
            roster={roster}
            session={session}
            onOpenStudent={onOpenStudent}
            archived={archived}
            importOpen={importOpen}
            onImportClose={() => setImportOpen(false)}
          />
        )}
      </div>
      {session?.isOperationalManager ? (
        <details className="homeroom-manage-disclosure">
          <summary>Quản lý lớp</summary>
          <ClassManagePanel classId={classId} yearId={yearId} detail={detail} session={session} canManage={session?.isOperationalManager} />
        </details>
      ) : null}
    </div>
  );
}

function StudentRoster({ classId, roster, session, onOpenStudent, archived = false, importOpen = false, onImportClose }) {
  const canImport = !archived && Boolean(session?.isOperationalManager);
  return (
    <div>
      {importOpen && canImport ? <StudentRosterImportDialog classId={classId} onClose={onImportClose} /> : null}
      {!roster ? <p className="homeroom-empty">Đang tải danh sách…</p> : !roster.length ? (
        <p className="homeroom-empty">Chưa có học sinh trong lớp.</p>
      ) : (
        <div className="homeroom-table-wrap">
          <table className="homeroom-table">
            <thead>
              <tr><th>STT</th><th>Mã học sinh</th><th>Họ tên</th><th>Thao tác</th></tr>
            </thead>
            <tbody>
              {roster.map((row) => (
                <tr key={row.student._id}>
                  <td>{row.enrollment.rosterNumber || '—'}</td>
                  <td>
                    <span className="homeroom-student-id">
                      <span className="homeroom-avatar" aria-hidden="true">{studentInitials(row.student.fullName)}</span>
                      {row.student.studentCode}
                    </span>
                  </td>
                  <td>{row.student.fullName}</td>
                  <td>
                    <button type="button" className="homeroom-detail-button" onClick={() => onOpenStudent(row.student._id)}>
                      <Glyph size={15}>
                        <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
                        <circle cx="12" cy="12" r="2.4" />
                      </Glyph>
                      Chi tiết
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StudentRosterImportDialog({ classId, onClose }) {
  const classDetail = useQuery(anyApi.homeroomClasses.getScoped, { classId });
  const generate = useMutation(anyApi.studentRosterImport.generateUploadUrl);
  const register = useMutation(anyApi.studentRosterImport.registerUpload);
  const validateUpload = useAction(anyApi.studentRosterImport.validateUpload);
  const commitUpload = useAction(anyApi.studentRosterImport.commit);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [pending, setPending] = useState(false);
  const uploadIdRef = React.useRef('');

  const onFile = async (file) => {
    setError('');
    setPreview(null);
    if (!file?.name.toLowerCase().endsWith('.xlsx')) {
      setError('Chỉ chấp nhận file Excel (.xlsx).');
      return;
    }
    setPending(true);
    try {
      const uploadUrl = await generate({ classId });
      const uploaded = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
      const { storageId } = await uploaded.json();
      if (!classDetail?.class) throw new Error('CLASS_NOT_FOUND');
      const registered = await register({
        storageId,
        fileName: file.name,
        fileSize: file.size,
        schoolYearId: classDetail.class.schoolYearId,
        classId,
      });
      uploadIdRef.current = registered.uploadId;
      const validated = await validateUpload({ uploadId: registered.uploadId });
      setPreview(validated);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setPending(false);
    }
  };

  const commit = async () => {
    setPending(true);
    try {
      await commitUpload({ uploadId: uploadIdRef.current });
      onClose();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="homeroom-panel" role="dialog" aria-label="Nhập danh sách học sinh">
      <div className="homeroom-toolbar">
        <strong>Nhập danh sách học sinh</strong>
        <button type="button" className="text-button" onClick={onClose}>Đóng</button>
      </div>
      <input type="file" accept=".xlsx" onChange={(e) => void onFile(e.target.files?.[0])} />
      {pending ? <p>Đang xử lý trên máy chủ…</p> : null}
      {error ? <p className="homeroom-issue">{error}</p> : null}
      {preview?.blockers?.length ? (
        <div>
          <p className="homeroom-issue">File có lỗi — chưa nhập dòng nào. Hãy sửa từng dòng rồi tải lại.</p>
          {preview.blockers.map((item) => (
            <p key={`${item.rowNumber}-${item.code}`} className="homeroom-issue">
              Dòng {item.rowNumber || 'file'} · {item.column || item.field}: {item.message}
              {item.rejectedValue ? ` (giá trị: ${item.rejectedValue})` : ''} [{item.code}]
            </p>
          ))}
        </div>
      ) : null}
      {preview?.issues?.filter((item) => item.severity === 'warning').map((item) => (
        <p key={`${item.rowNumber}-${item.code}`} className="homeroom-issue warn">Cảnh báo dòng {item.rowNumber}: {item.message}</p>
      ))}
      {preview?.ok ? (
        <button type="button" className="primary-button" onClick={() => void commit()} disabled={pending}>
          Xác nhận nhập {preview.preview.length} học sinh
        </button>
      ) : null}
    </div>
  );
}

function DailyAttendanceRegister({ classId, session, onOpenStudent }) {
  const [date, setDate] = useState(() => vietnamTodayYmd());
  const [filter, setFilter] = useState('all');
  const rows = useQuery(anyApi.studentAttendance.listDailyClass, { classId, attendanceDate: date });
  const setDisposition = useMutation(anyApi.studentAttendance.setDisposition);
  const canCorrect = Boolean(session?.isOperationalManager);
  const filtered = (rows || []).filter((row) => filter === 'all' || row.day?.effectiveStatus === filter);
  return (
    <div>
      <div className="homeroom-filters">
        <label>Ngày <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>
          Lọc
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Tất cả</option>
            <option value="absent_pending">Vắng chờ xử lý</option>
            <option value="absent_excused">Có phép</option>
            <option value="absent_unexcused">Không phép</option>
            <option value="late">Trễ</option>
            <option value="no_data">Chưa có dữ liệu</option>
          </select>
        </label>
      </div>
      {!rows ? <p className="homeroom-empty">Đang tải điểm danh…</p> : (
        <div className="homeroom-table-wrap">
          <table className="homeroom-table">
            <thead>
              <tr>
                <th>Học sinh</th><th>Mã</th><th>Camera</th><th>Hiệu lực</th><th>Ghi chú</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.student._id}>
                  <td><button type="button" className="text-button" onClick={() => onOpenStudent(row.student._id)}>{row.student.fullName}</button></td>
                  <td>{row.student.studentCode}</td>
                  <td>{row.day?.rawObservation || '—'}</td>
                  <td>{statusChip(row.day?.effectiveStatus)}</td>
                  <td>{row.day?.note || '—'}</td>
                  <td>
                    {canCorrect && row.day ? (
                      <CorrectionForm dayId={row.day._id} onSave={setDisposition} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CorrectionForm({ dayId, onSave }) {
  const [disposition, setDisposition] = useState('excused');
  const [note, setNote] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({ attendanceDayId: dayId, nextDisposition: disposition, note });
      }}
    >
      <select value={disposition} onChange={(e) => setDisposition(e.target.value)}>
        <option value="excused">Có phép</option>
        <option value="unexcused">Không phép</option>
        <option value="pending">Chờ xử lý</option>
      </select>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lý do / ghi chú" required />
      <button type="submit">Lưu</button>
    </form>
  );
}

function StudentDetail({ studentId }) {
  const data = useQuery(anyApi.students.getScoped, { studentId });
  const history = useQuery(anyApi.studentAttendance.getStudentHistory, { studentId });
  if (!data) return <p className="homeroom-empty">Đang tải học sinh…</p>;
  return (
    <div className="homeroom-panel">
      <h2>{data.student.fullName}</h2>
      <p>Mã: {data.student.studentCode}</p>
      <h3>Lịch sử điểm danh</h3>
      {(history?.days || []).map((day) => (
        <p key={day._id}>{day.attendanceDate}: {statusChip(day.effectiveStatus)} — camera {day.rawObservation}</p>
      ))}
    </div>
  );
}

function AttendanceReports({ classId, yearId }) {
  const today = vietnamTodayYmd();
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const report = useQuery(anyApi.homeroomReports.attendanceSummary, { classId, schoolYearId: yearId, from, to });
  return (
    <div>
      <div className="homeroom-filters">
        <label>Từ <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Đến <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button type="button" disabled={!report} onClick={() => downloadAttendanceXlsx(report.exportPayload)}>Xuất XLSX</button>
        <button type="button" disabled={!report} onClick={() => downloadAttendancePdf(report.exportPayload)}>Xuất PDF</button>
      </div>
      {!report ? <p className="homeroom-empty">Đang tải báo cáo…</p> : (
        <>
          <p>Tỷ lệ chuyên cần: {(report.summary.attendanceRate * 100).toFixed(1)}% ({report.summary.ratedRows} buổi tính tỷ lệ)</p>
          <div className="homeroom-table-wrap">
            <AttendanceReportsTable days={report.summary.days} />
          </div>
        </>
      )}
    </div>
  );
}

function AttendanceImportView({ yearId, classId: initialClassId, session }) {
  const allowed = Boolean(session?.isOperationalManager || session?.menuAccess?.homeroom === 'supervisor');
  const classes = useQuery(
    anyApi.homeroomClasses.listForAttendanceImport,
    allowed && yearId ? { schoolYearId: yearId } : 'skip',
  );
  const generate = useMutation(anyApi.attendanceImport.generateUploadUrl);
  const register = useMutation(anyApi.attendanceImport.registerUpload);
  const inspectColumns = useAction(anyApi.attendanceImport.inspectColumns);
  const validateImport = useAction(anyApi.attendanceImport.validate);
  const publishImport = useMutation(anyApi.attendanceImport.publish);
  const [classId, setClassId] = useState(initialClassId || '');
  const [date, setDate] = useState(() => vietnamTodayYmd());
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [replaceModeRequired, setReplaceModeRequired] = useState(false);

  useEffect(() => {
    if (initialClassId) setClassId(initialClassId);
  }, [initialClassId]);

  if (!allowed) {
    return <p className="homeroom-issue" role="alert">Chỉ Giám thị hoặc quản trị được nhập điểm danh camera.</p>;
  }

  return (
    <div className="homeroom-panel">
      <h2>Nhập file camera</h2>
      <p className="muted">Chưa có workbook camera nhà trường (IN-017/IN-018). Hệ thống chỉ đọc header trong giới hạn và yêu cầu xác nhận mapping.</p>
      <div className="homeroom-class-actions">
        <button type="button" className="homeroom-ghost-button" onClick={() => downloadAttendanceImportTemplate()}>
          {DOWNLOAD_ATTENDANCE_TEMPLATE_ACTION}
        </button>
      </div>
      <div className="homeroom-filters">
        <label>
          Lớp
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Chọn lớp</option>
            {filterActiveClasses(classes).map((item) => <option key={item._id} value={item._id}>{item.code} — {item.name}</option>)}
          </select>
        </label>
        <label>Ngày <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      <input
        type="file"
        accept=".xlsx"
        disabled={!classId || pending}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file || !classId) return;
          setError('');
          setReplaceModeRequired(false);
          setPending(true);
          try {
            const uploadUrl = await generate({ classId, attendanceDate: date });
            const uploaded = await fetch(uploadUrl, { method: 'POST', body: file });
            const { storageId } = await uploaded.json();
            const registered = await register({
              storageId,
              fileName: file.name,
              fileSize: file.size,
              schoolYearId: yearId,
              classId,
              attendanceDate: date,
            });
            const inspected = await inspectColumns({ uploadId: registered.uploadId });
            setState({
              uploadId: registered.uploadId,
              fileName: file.name,
              inspect: inspected,
              mapping: { ...inspected.suggestedMapping },
              sheetName: inspected.headerCandidates?.[0]?.sheetName || '',
              headerRowIndex: inspected.headerCandidates?.[0]?.rowIndex || 0,
            });
          } catch (err) {
            setError(messageFor(err));
          } finally {
            setPending(false);
          }
        }}
      />
      {error ? <p className="homeroom-issue">{error}</p> : null}
      {state?.inspect ? (
        <AttendanceImportPreview
          state={state}
          pending={pending}
          onMapping={(mapping) => setState((current) => ({ ...current, mapping }))}
          onValidate={async () => {
            setPending(true);
            setError('');
            try {
              const result = await validateImport(buildAttendanceValidateArgs({
                uploadId: state.uploadId,
                sheetName: state.sheetName,
                headerRowIndex: state.headerRowIndex,
                mapping: state.mapping,
              }));
              setState((current) => ({ ...current, result }));
            } catch (err) {
              setError(messageFor(err));
            } finally {
              setPending(false);
            }
          }}
          onConfirmNameMatches={async () => {
            setPending(true);
            setError('');
            try {
              const result = await validateImport(buildConfirmedAttendanceValidateArgs({
                uploadId: state.uploadId,
                sheetName: state.sheetName,
                headerRowIndex: state.headerRowIndex,
                mapping: state.mapping,
              }));
              setState((current) => ({ ...current, result }));
            } catch (err) {
              setError(messageFor(err));
            } finally {
              setPending(false);
            }
          }}
          replaceModeRequired={replaceModeRequired}
          onPublish={async (replaceMode) => {
            setPending(true);
            setError('');
            try {
              const result = await publishImport(buildAttendancePublishArgs({
                uploadId: state.uploadId,
                replaceMode,
              }));
              setReplaceModeRequired(false);
              setState((current) => ({
                ...current,
                published: !result?.cancelled,
                cancelled: Boolean(result?.cancelled),
              }));
            } catch (err) {
              if (isAttendanceReplaceModeRequired(err)) {
                setReplaceModeRequired(true);
              }
              setError(messageFor(err));
            } finally {
              setPending(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function AttendanceImportPreview({ state, pending, replaceModeRequired, onMapping, onValidate, onConfirmNameMatches, onPublish }) {
  const mapping = state.mapping || {};
  const blockers = state.result?.blockers || [];
  const nameMatches = proposedUniqueNameMatches(state.result);
  const canConfirmNames = canExplicitlyConfirmNameMatches(state.result);
  return (
    <div>
      <p>File: {state.fileName}. Mapping chỉ là gợi ý — chưa phải layout camera chính thức.</p>
      {['studentCode', 'studentName', 'classCode', 'observedAt', 'sourceStatus'].map((key) => (
        <label key={key}>
          {key}
          <input
            value={mapping[key] || ''}
            onChange={(e) => onMapping({ ...mapping, [key]: e.target.value })}
          />
        </label>
      ))}
      <button type="button" onClick={() => void onValidate()} disabled={pending}>Xem trước đối soát</button>
      {blockers.map((item) => (
        <p key={`${item.rowNumber}-${item.code}`} className="homeroom-issue">
          Dòng {item.rowNumber} · {item.field}: {item.message} [{item.code}]
        </p>
      ))}
      {nameMatches.map((item) => (
        <p key={`name-match-${item.rowNumber}`} className="homeroom-issue warn">
          Dòng {item.rowNumber} · họ tên nguồn: {item.sourceName} → {item.studentCode} {item.fullName} ({item.classCode}) [CAMERA_NAME_MATCH_UNCONFIRMED]
        </p>
      ))}
      {canConfirmNames ? (
        <button type="button" onClick={() => void onConfirmNameMatches()} disabled={pending}>
          Xác nhận khớp họ tên
        </button>
      ) : null}
      {state.result && !state.result.ok ? (
        <p className="homeroom-issue">Còn dòng chặn — chưa công bố.</p>
      ) : null}
      <button type="button" className="primary-button" disabled={pending || !state.result?.ok || replaceModeRequired} onClick={() => void onPublish()}>
        Công bố điểm danh
      </button>
      {replaceModeRequired ? (
        <div role="group" aria-label="Chọn cách xử lý file đã công bố">
          <p className="homeroom-issue warn">Ngày này đã có file công bố. Hãy chọn một cách xử lý — hệ thống không tự chọn.</p>
          {attendanceReplaceModeChoices().map((choice) => (
            <button
              key={choice.replaceMode}
              type="button"
              disabled={pending}
              onClick={() => void onPublish(choice.replaceMode)}
            >
              {choice.label} — {choice.description}
            </button>
          ))}
        </div>
      ) : null}
      {state.published ? <p>Đã công bố file này.</p> : null}
      {state.cancelled ? <p>Đã hủy công bố file này.</p> : null}
    </div>
  );
}
