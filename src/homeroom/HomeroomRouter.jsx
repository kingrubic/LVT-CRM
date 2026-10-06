import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { homeroomPathname } from '../navigationRoutes';
import { homeroomRoles, parseHomeroomPath } from './homeroomRoutes';
import { messageFor } from '../lib/appErrorMessage';
import { vietnamTodayYmd } from './homeroomTime';
import { formatDateLong, isYmd } from './homeroomLabels';
import { HomeroomStudentQueryErrorBoundary } from './studentQueryErrorBoundary';
import { Feedback, HomeroomViewErrorBoundary, Icon, Loading, SilentBoundary } from './homeroomUi';
import HomeroomOverview from './HomeroomOverview';
import HomeroomPendingAbsences from './HomeroomPendingAbsences';
import HomeroomAttendanceImport from './HomeroomAttendanceImport';
import HomeroomClassDetail from './HomeroomClassDetail';
import HomeroomStudentDetail from './HomeroomStudentDetail';
import HomeroomCalendar from './HomeroomCalendar';
import { ClassCatalogPanel } from './HomeroomClassCatalog';
import './homeroom.css';

export { parseHomeroomPath, homeroomRoles };

function readDateParam() {
  const value = new URLSearchParams(window.location.search).get('ngay');
  return isYmd(value) ? value : '';
}

export default function HomeroomRouter({ session }) {
  const [location, setLocation] = useState(() => ({ path: window.location.pathname, date: readDateParam() }));
  const route = useMemo(() => parseHomeroomPath(location.path), [location.path]);
  const years = useQuery(anyApi.schoolYears.list, {});
  const [yearId, setYearId] = useState('');
  const roles = homeroomRoles(session);
  const selectedYearId =
    (yearId && years?.some((item) => item._id === yearId) ? yearId : '') ||
    years?.find((item) => item.active)?._id ||
    years?.[0]?._id ||
    '';
  const selectedYear = years?.find((item) => item._id === selectedYearId);

  useEffect(() => {
    const sync = () => setLocation({ path: window.location.pathname, date: readDateParam() });
    window.addEventListener('popstate', sync);
    window.addEventListener('lvt:locationchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('lvt:locationchange', sync);
    };
  }, []);

  const go = useCallback((next, { date = '', replace = false } = {}) => {
    const url = date ? `${next}?ngay=${date}` : next;
    if (`${window.location.pathname}${window.location.search}` !== url) {
      window.history[replace ? 'replaceState' : 'pushState']({ hr: true }, '', url);
    }
    setLocation({ path: next, date });
    window.scrollTo({ top: 0 });
  }, []);

  const goBack = useCallback(() => {
    if (window.history.state?.hr) window.history.back();
    else go(homeroomPathname());
  }, [go]);

  const nav = {
    overview: () => go(homeroomPathname()),
    pending: () => go(homeroomPathname({ pendingAbsences: true })),
    import: (date = '') => go(homeroomPathname({ importAttendance: true }), { date }),
    manage: () => go(homeroomPathname({ manageClasses: true })),
    calendar: () => go(homeroomPathname({ calendar: true })),
    openClass: (id, tab = '', date = '') => go(homeroomPathname({ classId: id, tab: tab || undefined }), { date }),
    openStudent: (id) => go(homeroomPathname({ studentId: id })),
    back: goBack,
  };

  if (years === undefined) {
    return (
      <section className="homeroom-view">
        <Loading label="Đang tải Lớp chủ nhiệm…" />
      </section>
    );
  }

  const navItems = [
    { key: 'overview', label: 'Tổng quan', icon: 'overview', show: true, onClick: nav.overview },
    { key: 'pending', label: 'Vắng chờ xử lý', icon: 'inbox', show: roles.seesClasses, onClick: nav.pending, badge: true },
    { key: 'import', label: 'Nhập điểm danh', icon: 'upload', show: roles.canImport, onClick: () => nav.import() },
    { key: 'manage', label: 'Quản lý lớp', icon: 'classes', show: roles.isManager, onClick: nav.manage },
    { key: 'calendar', label: 'Lịch học', icon: 'calendar', show: roles.isManager, onClick: nav.calendar },
  ].filter((item) => item.show);
  const activeKey = route.view === 'class' || route.view === 'student' ? '' : route.view;
  const resetKey = `${location.path}|${selectedYearId}`;

  return (
    <section className="homeroom-view">
      <header className="hr-shell-head">
        <div className="hr-shell-title">
          <span className="hr-eyebrow">Lớp chủ nhiệm</span>
          <h1>{selectedYear ? `Năm học ${selectedYear.name}` : 'Chưa có năm học'}</h1>
          <p>{formatDateLong(vietnamTodayYmd())}</p>
        </div>
        <div className="hr-shell-controls">
          <label className="hr-year-select">
            <span>Năm học</span>
            <select
              value={selectedYearId}
              disabled={!years?.length}
              onChange={(event) => {
                setYearId(event.target.value);
                if (route.view === 'class' || route.view === 'student') nav.overview();
              }}
            >
              {!years?.length ? <option value="">Chưa có năm học</option> : null}
              {(years || []).map((year) => (
                <option key={year._id} value={year._id}>
                  {year.name}{year.active ? ' · đang áp dụng' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        {selectedYearId ? (
          <nav className="hr-shell-nav" aria-label="Điều hướng Lớp chủ nhiệm">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className="hr-shell-tab"
                aria-current={activeKey === item.key ? 'page' : undefined}
                onClick={item.onClick}
              >
                <Icon name={item.icon} size={16} />
                <span>{item.label}</span>
                {item.badge ? (
                  <SilentBoundary>
                    <PendingBadge yearId={selectedYearId} />
                  </SilentBoundary>
                ) : null}
              </button>
            ))}
          </nav>
        ) : null}
      </header>

      {!selectedYearId ? (
        <EmptySchoolYearState canCreate={roles.isManager} />
      ) : (
        <HomeroomViewErrorBoundary resetKey={resetKey} onBack={nav.overview}>
          {route.view === 'overview' ? (
            <HomeroomOverview yearId={selectedYearId} roles={roles} nav={nav} />
          ) : route.view === 'pending' ? (
            <HomeroomPendingAbsences yearId={selectedYearId} nav={nav} />
          ) : route.view === 'import' ? (
            roles.canImport ? (
              <HomeroomAttendanceImport yearId={selectedYearId} initialDate={location.date} nav={nav} />
            ) : (
              <Forbidden text="Chỉ Giám thị hoặc quản trị được nhập điểm danh." onBack={nav.overview} />
            )
          ) : route.view === 'manage' ? (
            roles.isManager ? (
              <ClassCatalogPanel session={session} yearId={selectedYearId} schoolYears={years} onOpenClass={(id) => nav.openClass(id)} />
            ) : (
              <Forbidden text="Chỉ quản trị viên mới được quản lý lớp." onBack={nav.overview} />
            )
          ) : route.view === 'calendar' ? (
            roles.isManager ? (
              <HomeroomCalendar yearId={selectedYearId} years={years} />
            ) : (
              <Forbidden text="Chỉ quản trị viên mới được cấu hình lịch học." onBack={nav.overview} />
            )
          ) : route.view === 'class' ? (
            <HomeroomClassDetail
              key={route.classId}
              classId={route.classId}
              tab={route.tab}
              initialDate={location.date}
              session={session}
              nav={nav}
            />
          ) : route.view === 'student' ? (
            <HomeroomStudentQueryErrorBoundary onBack={nav.overview}>
              <HomeroomStudentDetail key={route.studentId} studentId={route.studentId} nav={nav} />
            </HomeroomStudentQueryErrorBoundary>
          ) : null}
        </HomeroomViewErrorBoundary>
      )}
    </section>
  );
}

function PendingBadge({ yearId }) {
  const overview = useQuery(anyApi.homeroomReports.overview, { schoolYearId: yearId });
  const total = overview?.pendingTotal || 0;
  if (!total) return null;
  return <span className="hr-badge" aria-label={`${total} buổi vắng chờ xử lý`}>{total > 99 ? '99+' : total}</span>;
}

function Forbidden({ text, onBack }) {
  return (
    <div className="hr-panel hr-error-panel" role="alert">
      <span className="hr-empty-icon"><Icon name="alert" size={24} /></span>
      <h2>Không có quyền truy cập</h2>
      <p>{text}</p>
      <button type="button" className="primary-button" onClick={onBack}>Về tổng quan</button>
    </div>
  );
}

function EmptySchoolYearState({ canCreate }) {
  const createSchoolYear = useMutation(anyApi.schoolYears.create);
  const year = Number(vietnamTodayYmd().slice(0, 4));
  const [name, setName] = useState(`${year}-${year + 1}`);
  const [startDate, setStartDate] = useState(`${year}-09-05`);
  const [endDate, setEndDate] = useState(`${year + 1}-05-31`);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  if (!canCreate) {
    return (
      <div className="hr-panel hr-error-panel">
        <span className="hr-empty-icon"><Icon name="calendar" size={24} /></span>
        <h2>Chưa cấu hình năm học</h2>
        <p>Vui lòng liên hệ quản trị viên để tạo năm học trước khi sử dụng Lớp chủ nhiệm.</p>
      </div>
    );
  }

  return (
    <form
      className="hr-panel hr-setup-panel"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError('');
        try {
          await createSchoolYear({ name, startDate, endDate, active: true });
        } catch (err) {
          setError(messageFor(err));
        } finally {
          setPending(false);
        }
      }}
    >
      <span className="hr-eyebrow">Bước đầu tiên</span>
      <h2>Thiết lập năm học đầu tiên</h2>
      <p className="hr-muted">
        Năm học quyết định lớp, phân công GVCN và lịch ngày học (mặc định Thứ 2 – Thứ 6). Bạn có thể đánh dấu ngày nghỉ và ngày học bù sau.
      </p>
      <div className="hr-form-grid">
        <label className="hr-field">
          <span>Tên năm học</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: 2026-2027" required />
        </label>
        <label className="hr-field">
          <span>Ngày bắt đầu</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </label>
        <label className="hr-field">
          <span>Ngày kết thúc</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        </label>
      </div>
      <Feedback error={error} />
      <div className="hr-row">
        <button type="submit" className="primary-button" disabled={pending}>
          {pending ? 'Đang tạo năm học…' : 'Tạo năm học'}
        </button>
      </div>
    </form>
  );
}
