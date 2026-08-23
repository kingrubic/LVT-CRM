import React, { useEffect, useMemo, useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { homeroomPathname, routeForPathname } from '../navigationRoutes';
import { downloadRosterImportTemplate } from '../lib/rosterImportExcel';
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

function parseHomeroomPath(pathname) {
  const normalized = routeForPathname(pathname)?.homeroomPath || '/lop-chu-nhiem';
  const parts = normalized.split('/').filter(Boolean);
  if (parts[1] === 'import-diem-danh') return { view: 'import' };
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
      <div className="homeroom-toolbar">
        <label>
          Năm học
          <select value={selectedYearId} onChange={(e) => setYearId(e.target.value)} disabled={!years?.length}>
            {!years?.length ? <option value="">Chưa có năm học</option> : null}
            {(years || []).map((year) => (
              <option key={year._id} value={year._id}>{year.name}</option>
            ))}
          </select>
        </label>
        <button type="button" className="primary-button" onClick={() => go(homeroomPathname())}>Tổng quan</button>
        {selectedYearId && (session?.isOperationalManager || session?.menuAccess?.homeroom === 'supervisor') ? (
          <button type="button" onClick={() => go(homeroomPathname({ importAttendance: true }))}>Nhập điểm danh camera</button>
        ) : null}
      </div>
      {!selectedYearId ? (
        <EmptySchoolYearState canCreate={Boolean(session?.isOperationalManager)} onCreate={createSchoolYear} />
      ) : route.view === 'overview' ? (
        <HomeroomOverview
          overview={overview}
          yearId={selectedYearId}
          session={session}
          onOpenClass={(id) => go(homeroomPathname({ classId: id }))}
        />
      ) : route.view === 'class' ? (
        <ClassDetail
          classId={route.classId}
          tab={route.tab}
          yearId={selectedYearId}
          session={session}
          onTab={(tab) => go(homeroomPathname({ classId: route.classId, tab }))}
          onOpenStudent={(id) => go(homeroomPathname({ studentId: id }))}
          onBack={() => go(homeroomPathname())}
        />
      ) : route.view === 'student' ? (
        <HomeroomStudentQueryErrorBoundary onBack={() => go(homeroomPathname())}>
          <StudentDetail studentId={route.studentId} />
        </HomeroomStudentQueryErrorBoundary>
      ) : route.view === 'import' ? (
        <AttendanceImportView yearId={selectedYearId} />
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

function HomeroomOverview({ overview, yearId, session, onOpenClass }) {
  if (overview === undefined) return <p className="homeroom-empty">Đang tải tổng quan…</p>;
  const counts = overview.summary?.counts || {};
  const canManage = Boolean(session?.isOperationalManager);
  return (
    <>
      <div className="homeroom-cards">
        <article className="homeroom-card"><span>Lớp đang hoạt động</span><strong>{overview.classes.length}</strong></article>
        <article className="homeroom-card"><span>Học sinh</span><strong>{overview.studentCount}</strong></article>
        <article className="homeroom-card"><span>Có mặt hôm nay</span><strong>{counts.present || 0}</strong></article>
        <article className="homeroom-card"><span>Trễ</span><strong>{counts.late || 0}</strong></article>
        <article className="homeroom-card"><span>Vắng chờ xử lý</span><strong>{counts.absent_pending || 0}</strong></article>
      </div>
      <ClassCatalogPanel session={session} yearId={yearId} onOpenClass={onOpenClass} />
      <div className="homeroom-panel">
        <h3>Cảnh báo</h3>
        {overview.missingUpload?.scopeEmpty ? (
          <p className="muted">Không có lớp trong phạm vi — không có cảnh báo toàn trường.</p>
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
      {overview.classes.length || !canManage ? (
        <div className="homeroom-panel">
          <h3>Lớp trong phạm vi</h3>
          <ClassCards classes={overview.classes} canManage={canManage} onOpenClass={onOpenClass} />
        </div>
      ) : null}
    </>
  );
}

function ClassDetail({ classId, tab, yearId, session, onTab, onOpenStudent, onBack }) {
  const detail = useQuery(anyApi.homeroomClasses.getScoped, { classId });
  const roster = useQuery(anyApi.students.listByClass, { classId });
  if (detail === undefined) return <p className="homeroom-empty">Đang tải lớp…</p>;
  const archived = detail.class.status === 'archived';
  return (
    <div className="homeroom-panel">
      <h2>{detail.class.code} — {detail.class.name}</h2>
      {archived ? (
        <p className="homeroom-issue warn" role="status">
          {classStatusLabel('archived')}. Không thể phân công, nhập danh sách hoặc dùng camera.
        </p>
      ) : null}
      <p className="muted">Sĩ số hiện tại: {detail.rosterCount} · {classStatusLabel(detail.class.status)}</p>
      <div className="homeroom-class-actions">
        <button type="button" onClick={onBack}>{BACK_TO_OVERVIEW}</button>
      </div>
      <div className="homeroom-tabs" role="tablist">
        <button type="button" onClick={() => onTab('danh-sach')}>Danh sách học sinh</button>
        <button type="button" onClick={() => onTab('diem-danh')}>Điểm danh</button>
        <button type="button" onClick={() => onTab('bao-cao')}>Báo cáo</button>
      </div>
      {tab === 'diem-danh' ? (
        <DailyAttendanceRegister classId={classId} session={session} onOpenStudent={onOpenStudent} />
      ) : tab === 'bao-cao' ? (
        <AttendanceReports classId={classId} yearId={yearId} />
      ) : (
        <StudentRoster classId={classId} roster={roster} session={session} onOpenStudent={onOpenStudent} archived={archived} />
      )}
      {session?.isOperationalManager ? (
        <details className="homeroom-manage-disclosure">
          <summary>Quản lý lớp</summary>
          <ClassManagePanel classId={classId} yearId={yearId} detail={detail} session={session} canManage={session?.isOperationalManager} />
        </details>
      ) : null}
    </div>
  );
}

function StudentRoster({ classId, roster, session, onOpenStudent, archived = false }) {
  const [open, setOpen] = useState(false);
  const canImport = !archived && (session?.isOperationalManager || session?.menuAccess?.homeroom === 'view' || session?.menuAccess?.homeroom === 'view_all');
  return (
    <div>
      <div className="homeroom-toolbar">
        <button type="button" onClick={() => downloadRosterImportTemplate()}>Tải mẫu Excel</button>
        {canImport ? <button type="button" className="primary-button" onClick={() => setOpen(true)}>Nhập danh sách</button> : null}
      </div>
      {open ? <StudentRosterImportDialog classId={classId} onClose={() => setOpen(false)} /> : null}
      {!roster ? <p className="homeroom-empty">Đang tải danh sách…</p> : !roster.length ? (
        <p className="homeroom-empty">Chưa có học sinh trong lớp.</p>
      ) : (
        <div className="homeroom-table-wrap">
          <table className="homeroom-table">
            <thead>
              <tr><th>STT</th><th>Mã</th><th>Họ tên</th><th></th></tr>
            </thead>
            <tbody>
              {roster.map((row) => (
                <tr key={row.student._id}>
                  <td>{row.enrollment.rosterNumber || '—'}</td>
                  <td>{row.student.studentCode}</td>
                  <td>{row.student.fullName}</td>
                  <td><button type="button" onClick={() => onOpenStudent(row.student._id)}>Chi tiết</button></td>
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
  const canCorrect = session?.isOperationalManager || session?.menuAccess?.homeroom === 'supervisor';
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

function AttendanceImportView({ yearId }) {
  const classes = useQuery(anyApi.homeroomClasses.listScoped, yearId ? { schoolYearId: yearId } : {});
  const generate = useMutation(anyApi.attendanceImport.generateUploadUrl);
  const register = useMutation(anyApi.attendanceImport.registerUpload);
  const inspectColumns = useAction(anyApi.attendanceImport.inspectColumns);
  const validateImport = useAction(anyApi.attendanceImport.validate);
  const publishImport = useMutation(anyApi.attendanceImport.publish);
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(() => vietnamTodayYmd());
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [replaceModeRequired, setReplaceModeRequired] = useState(false);
  return (
    <div className="homeroom-panel">
      <h2>Nhập file camera</h2>
      <p className="muted">Chưa có workbook camera nhà trường (IN-017/IN-018). Hệ thống chỉ đọc header trong giới hạn và yêu cầu xác nhận mapping.</p>
      <div className="homeroom-filters">
        <label>
          Lớp
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Chọn lớp</option>
            {filterActiveClasses(classes).map((item) => <option key={item._id} value={item._id}>{item.code}</option>)}
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
