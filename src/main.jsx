import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexAuthProvider, useAuthActions } from '@convex-dev/auth/react';
import { Authenticated, AuthLoading, Unauthenticated, useAction, useMutation, useQuery, ConvexReactClient } from 'convex/react';
import { anyApi } from 'convex/server';
import '@fontsource-variable/montserrat';
import './styles.css';
import DutyReportsView from './reports/DutyReportsView';
import BoardingManagement from './boarding/BoardingManagement';
import BoardingReportsView from './boarding/BoardingReportsView';
import { WorkManagement, WorkUserView } from './work/WorkViews';
import './management/managementTheme.css';
import './duties/duties.css';
import './profile/profile.css';

const configuredConvexUrl = import.meta.env.VITE_CONVEX_URL;
const publicConvexUrl = window.location.hostname === 'lvt.vscgroup.io.vn' ? window.location.origin : configuredConvexUrl;
const convex = publicConvexUrl ? new ConvexReactClient(publicConvexUrl) : null;

const PRIMARY_MENUS = [
  ['reports', 'Báo cáo'],
  ['duties', 'Công tác'],
  ['work', 'Công việc'],
  ['homeroom', 'Lớp chủ nhiệm'],
  ['people-review', 'Đánh giá nhân sự'],
];
const SYSTEM_MANAGEMENT_MENUS = [
  ['duties-management', 'Quản lý công tác'],
  ['boarding', 'Quản lý bán trú'],
  ['work-management', 'Quản lý công việc'],
];
const SUPREME_SETTINGS = [
  ['users', 'Quản lý người dùng'],
  ['departments', 'Quản lý phòng ban'],
  ['locations', 'Quản lý địa điểm'],
  ['roles', 'Quản lý nhóm quyền'],
  ['positions', 'Quản lý chức vụ'],
];
const ROLE_LABELS = { admin: 'Administrator', moderator: 'Moderator', user: 'User' };
const ACCESS_LABELS = { hidden: 'Ẩn', view: 'Xem', view_all: 'Xem tối cao', edit: 'Sửa' };

function messageFor(error) {
  // Convex often wraps codes: "[Request ID] Server Error\nCODE", "Uncaught Error: CODE", etc.
  const raw = String(error?.data ?? error?.message ?? error ?? 'UNKNOWN_ERROR');
  const messages = {
    USER_NOT_ACTIVE: 'Tài khoản không còn hoạt động. Vui lòng liên hệ quản trị viên.',
    EMAIL_TAKEN: 'Email này đã được sử dụng. Vui lòng chọn email khác.',
    TEMP_PASSWORD_TOO_SHORT: 'Mật khẩu tạm thời phải có ít nhất 8 ký tự.',
    PASSWORD_TOO_SHORT: 'Mật khẩu mới phải có ít nhất 8 ký tự.',
    CANNOT_DISABLE_OWN_ACTIVE_ACCOUNT: 'Bạn không thể khóa chính tài khoản đang đăng nhập.',
    CANNOT_DELETE_OWN_ACTIVE_ACCOUNT: 'Bạn không thể xóa chính tài khoản đang đăng nhập.',
    USER_REMOVE_FAILED: 'Không thể xóa tài khoản. Vui lòng thử lại hoặc liên hệ kỹ thuật.',
    USER_CREATE_FAILED: 'Không thể tạo tài khoản. Vui lòng thử lại.',
    USER_UPDATE_FAILED: 'Không thể cập nhật tài khoản. Vui lòng thử lại.',
    PASSWORD_CHANGED_SYNC_PENDING: 'Mật khẩu đã đổi nhưng hệ thống chưa cập nhật xong. Vui lòng liên hệ quản trị viên.',
    PASSWORD_RESET_FAILED: 'Không thể đặt lại mật khẩu. Vui lòng thử lại.',
    PASSWORD_CHANGE_FAILED: 'Không thể đổi mật khẩu. Vui lòng thử lại.',
    EMAIL_CHANGE_UNSUPPORTED: 'Hiện chưa hỗ trợ đổi email đăng nhập. Vui lòng tạo tài khoản mới nếu cần.',
    PUBLIC_SIGNUP_DISABLED: 'Hệ thống không cho phép tự đăng ký.',
    'Invalid credentials': 'Email hoặc mật khẩu không đúng.',
    INVALID_EMAIL: 'Email không hợp lệ.',
    INVALID_ROLE: 'Vai trò chỉ được chọn Administrator, Moderator hoặc User.',
    INVALID_DEPARTMENT: 'Phòng ban không hợp lệ hoặc đã ngưng sử dụng.',
    INVALID_PERMISSION_GROUP: 'Nhóm quyền không hợp lệ hoặc đã ngưng sử dụng.',
    INVALID_POSITION: 'Chức vụ không hợp lệ hoặc đã ngưng sử dụng.',
    INVALID_POSITION_LEVEL: 'Cấp bậc chức vụ phải từ 1 đến 5 sao.',
    INVALID_CODE: 'Mã không hợp lệ. Chỉ dùng chữ in hoa, số, gạch ngang hoặc gạch dưới.',
    INVALID_NAME: 'Tên không hợp lệ. Vui lòng nhập lại.',
    CODE_TAKEN: 'Mã này đã được sử dụng. Vui lòng chọn mã khác.',
    DEPARTMENT_NAME_TAKEN: 'Đã có phòng ban trùng tên, vui lòng đặt tên khác.',
    LOCATION_NAME_TAKEN: 'Đã có địa điểm trùng tên, vui lòng đặt tên khác.',
    PERMISSION_GROUP_NAME_TAKEN: 'Đã có nhóm quyền trùng tên, vui lòng đặt tên khác.',
    POSITION_NAME_TAKEN: 'Đã có chức vụ trùng tên, vui lòng đặt tên khác.',
    DEPARTMENT_NOT_FOUND: 'Không tìm thấy phòng ban.',
    LOCATION_NOT_FOUND: 'Không tìm thấy địa điểm.',
    PERMISSION_GROUP_NOT_FOUND: 'Không tìm thấy nhóm quyền.',
    POSITION_NOT_FOUND: 'Không tìm thấy chức vụ.',
    USER_NOT_FOUND: 'Không tìm thấy người dùng.',
    INVALID_DESCRIPTION: 'Mô tả quá dài hoặc không hợp lệ.',
    INVALID_DATE: 'Ngày không hợp lệ.',
    INVALID_TIME: 'Giờ không hợp lệ.',
    INVALID_CONTENT: 'Nội dung bắt buộc và tối đa 200 ký tự.',
    END_BEFORE_START: 'Thời gian kết thúc phải sau thời gian bắt đầu.',
    INVALID_LOCATION: 'Địa điểm không hợp lệ hoặc đã ngưng.',
    INVALID_PARTICIPANT: 'Người tham gia không hợp lệ.',
    DUTY_NOT_FOUND: 'Không tìm thấy công tác.',
    NOT_A_PARTICIPANT: 'Bạn không nằm trong danh sách tham gia công tác này.',
    NOT_A_SUBORDINATE: 'Bạn chỉ được cập nhật trạng thái của cấp dưới cùng phòng ban.',
    ATTENDANCE_OUTSIDE_WINDOW: 'Chỉ xác nhận tham gia trong thời gian diễn ra công tác.',
    INVALID_WORK_FILE: 'Tệp công văn không đúng định dạng được hỗ trợ.',
    WORK_FILE_TOO_LARGE: 'Tệp công văn không được vượt quá 20MB.',
    WORK_UPLOAD_FAILED: 'Không thể tải tệp công văn lên.',
    INVALID_WORK_DEADLINE: 'Hạn chót công việc không hợp lệ.',
    INVALID_WORK_CONTENT: 'Nội dung công việc bắt buộc và tối đa 2.000 ký tự.',
    WORK_DEPARTMENTS_REQUIRED: 'Vui lòng thêm ít nhất một phòng ban nhận việc.',
    WORK_DEPARTMENT_DUPLICATE: 'Mỗi phòng ban chỉ được nhận một đầu việc trong cùng công văn.',
    WORK_APPROVERS_REQUIRED: 'Vui lòng chọn ít nhất một người duyệt.',
    INVALID_WORK_APPROVER: 'Người duyệt phải là user đang hoạt động cấp 4 hoặc 5 sao.',
    WORK_APPROVER_REQUIRED: 'Chỉ user cấp 4 hoặc 5 sao mới được duyệt công văn.',
    WORK_APPROVER_FORBIDDEN: 'Bạn không nằm trong danh sách duyệt công văn này.',
    WORK_NOT_APPROVED: 'Công văn chưa được duyệt đủ.',
    INVALID_PERSONAL_WORK_TITLE: 'Tên công việc cá nhân bắt buộc và tối đa 200 ký tự.',
    WORK_ASSIGNEES_REQUIRED: 'Vui lòng chọn người thực hiện.',
    INVALID_WORK_ASSIGNEE: 'Người thực hiện phải cùng phòng ban và có cấp sao thấp hơn bạn.',
    WORK_ASSIGNER_REQUIRED: 'Chỉ user cấp 2 hoặc 3 mới được chỉ định công việc.',
    WORK_EXECUTOR_REQUIRED: 'Chỉ user cấp 1 sao mới được hoàn thành đầu mục.',
    PERSONAL_WORK_OVERDUE: 'Đầu mục đã quá hạn và không thể xác nhận.',
  };

  // Prefer longest known code match inside the raw error text (handles Convex wrappers).
  const knownCodes = Object.keys(messages).sort((a, b) => b.length - a.length);
  for (const key of knownCodes) {
    if (raw.includes(key)) return messages[key];
  }

  const stripped = raw
    .replace(/^Uncaught Error:\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .replace(/^\[Request ID:[^\]]+\]\s*/i, '')
    .replace(/^Server Error\s*/i, '')
    .trim()
    .split(/[\n\r]/)[0]
    .trim();
  if (messages[stripped]) return messages[stripped];

  if (/invalid credentials|invalidsecret/i.test(raw)) return messages['Invalid credentials'];
  if (/FORBIDDEN/i.test(raw)) return 'Bạn không có quyền thực hiện thao tác này.';
  return 'Không thể hoàn tất thao tác. Vui lòng thử lại hoặc liên hệ quản trị viên.';
}

function StarRating({ level, max = 5 }) {
  const n = Math.min(max, Math.max(0, Number(level) || 0));
  return (
    <span className="star-rating" aria-label={`${n} trên ${max} sao`} title={`Cấp ${n}/${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < n ? 'star on' : 'star'}>★</span>
      ))}
    </span>
  );
}

function AuthenticatedApp() {
  const session = useQuery(anyApi.users.sessionContext);

  if (session === undefined) return <LoadingView label="Đang kiểm tra quyền truy cập…" />;
  if (!session?.user) return <AccessDeniedView message="Phiên đăng nhập không gắn với hồ sơ người dùng hợp lệ." />;
  if (session.user.status !== 'active') {
    return <AccessDeniedView message="Tài khoản này đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên." />;
  }
  if (session.user.mustChangePassword) {
    return (
      <main className="auth-page">
        <div className="auth-card password-gate-card">
          <MustChangePasswordView />
        </div>
      </main>
    );
  }
  return <AppShell session={session} />;
}

function AppShell({ session }) {
  const { signOut } = useAuthActions();
  const { user, isAdmin, isModerator, isOperationalManager, menuAccess } = session;
  const canManageOperations = Boolean(isOperationalManager || isAdmin || isModerator);
  const workBadge = useQuery(anyApi.work.badge, canManageOperations || menuAccess?.work !== 'hidden' ? {} : 'skip');
  const visiblePrimaryMenus = useMemo(() => {
    if (canManageOperations) return PRIMARY_MENUS;
    return PRIMARY_MENUS.filter(([id]) => menuAccess?.[id] && menuAccess[id] !== 'hidden');
  }, [canManageOperations, menuAccess]);

  const defaultActive = canManageOperations
    ? 'reports'
    : visiblePrimaryMenus[0]?.[0] || 'profile';
  const [active, setActive] = useState(defaultActive);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [reportSection, setReportSection] = useState('duties');

  useEffect(() => {
    const allowed = new Set([
      ...visiblePrimaryMenus.map(([id]) => id),
      ...(canManageOperations ? SYSTEM_MANAGEMENT_MENUS.map(([id]) => id) : []),
      ...(isAdmin ? SUPREME_SETTINGS.map(([id]) => id) : []),
      'profile',
      'settings',
    ]);
    if (!allowed.has(active)) setActive(defaultActive);
  }, [active, canManageOperations, defaultActive, isAdmin, visiblePrimaryMenus]);

  const title = useMemo(() => {
    if (active === 'profile' || active === 'settings') return 'Thông tin cá nhân';
    const all = [...PRIMARY_MENUS, ...SYSTEM_MANAGEMENT_MENUS, ...SUPREME_SETTINGS];
    return all.find(([id]) => id === active)?.[1] || 'Lê Văn Tám CRM';
  }, [active]);

  const choose = (id) => {
    setActive(id);
    setMobileOpen(false);
  };

  return (
    <div className={`shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`shell-sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <div className="school-brand">
          <img src="/assets/logo-thcs-le-van-tam.png" alt="Logo Trường THCS Lê Văn Tám" />
          <div>
            <strong>
              Trường THCS
              <br />
              Lê Văn Tám
            </strong>
            <span>CRM nội bộ</span>
          </div>
        </div>
        <nav className="shell-nav" aria-label="Điều hướng CRM">
          <p className="nav-label">Chức năng chính</p>
          {visiblePrimaryMenus.length === 0 && !canManageOperations ? (
            <p className="nav-empty">Chưa được gán menu. Liên hệ quản trị viên.</p>
          ) : (
            visiblePrimaryMenus.map(([id, label]) => (
              <React.Fragment key={id}>
                <NavButton id={id} label={label} badge={id === 'work' ? workBadge?.count : 0} active={active} onClick={choose} />
                {id === 'reports' && active === 'reports' ? (
                  <ReportSubmenu
                    active={reportSection}
                    onChoose={(section) => {
                      setReportSection(section);
                      setMobileOpen(false);
                    }}
                  />
                ) : null}
              </React.Fragment>
            ))
          )}
          <NavButton id="profile" label="Thông tin cá nhân" active={active} onClick={choose} />
          {canManageOperations ? (
            <>
              <p className="nav-label admin-label">Quản trị hệ thống</p>
              {SYSTEM_MANAGEMENT_MENUS.map(([id, label]) => (
                <NavButton key={id} id={id} label={label} active={active} onClick={choose} nested />
              ))}
            </>
          ) : null}
          {isAdmin ? (
            <>
              <p className="nav-label admin-label">Cài đặt tối cao</p>
              {SUPREME_SETTINGS.map(([id, label]) => (
                <NavButton key={id} id={id} label={label} active={active} onClick={choose} nested />
              ))}
            </>
          ) : null}
        </nav>
        <div className="sidebar-note">
          <b>{ROLE_LABELS[user.role] || user.role}</b>
          <span>
            {isAdmin
              ? 'Toàn quyền hệ thống, bao gồm Cài đặt tối cao và quản lý tài khoản.'
              : isModerator
                ? 'Toàn quyền nghiệp vụ và Quản trị hệ thống; không truy cập Cài đặt tối cao.'
                : 'Quyền chức năng phụ thuộc nhóm quyền. Quên mật khẩu: liên hệ Administrator.'}
          </span>
        </div>
      </aside>
      <main className="shell-main">
        <header className="shell-header">
          <button
            type="button"
            className="sidebar-collapse-button"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={sidebarCollapsed ? 'Hiện menu bên trái' : 'Ẩn menu bên trái'}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? 'Hiện menu bên trái' : 'Ẩn menu bên trái'}
          >
            {sidebarCollapsed ? '›' : '‹'}
          </button>
          <button className="mobile-menu" onClick={() => setMobileOpen((open) => !open)} aria-label="Mở menu" aria-expanded={mobileOpen}>
            ☰
          </button>
          <div>
            <p className="eyebrow">Lê Văn Tám CRM</p>
            <h1>{title}</h1>
          </div>
          <div className="header-user">
            <span className="user-greeting">{user.name || user.email || 'Người dùng'}</span>
            <button type="button" className="text-button" onClick={() => void signOut()}>
              Đăng xuất
            </button>
          </div>
        </header>
        {active === 'users' && isAdmin ? (
          <UserManagement />
        ) : active === 'departments' && isAdmin ? (
          <DepartmentManagement />
        ) : active === 'locations' && isAdmin ? (
          <LocationManagement />
        ) : active === 'roles' && isAdmin ? (
          <PermissionGroupManagement />
        ) : active === 'positions' && isAdmin ? (
          <PositionManagement />
        ) : active === 'duties-management' && canManageOperations ? (
          <DutiesAdminView currentUserId={user._id} />
        ) : active === 'boarding' && canManageOperations ? (
          <BoardingManagement />
        ) : active === 'work-management' && canManageOperations ? (
          <WorkManagement />
        ) : active === 'duties' ? (
          canManageOperations
            ? <DutiesAdminView currentUserId={user._id} allowManage={false} />
            : <DutiesUserView access={menuAccess?.duties || 'view'} />
        ) : active === 'work' ? (
          canManageOperations ? <WorkManagement allowCreate={false} /> : <WorkUserView />
        ) : active === 'reports' ? (
          reportSection === 'boarding' ? <BoardingReportsView /> : <DutyReportsView />
        ) : active === 'profile' || (active === 'settings' && !isAdmin) ? (
          <ProfileView session={session} />
        ) : (
          <PlaceholderView
            title={title}
            access={canManageOperations ? 'edit' : menuAccess?.[active] || 'view'}
            isAdmin={canManageOperations}
          />
        )}
      </main>
    </div>
  );
}

function ReportSubmenu({ active, onChoose }) {
  return (
    <div className="report-submenu" aria-label="Loại báo cáo">
      <button type="button" className={active === 'duties' ? 'active' : ''} onClick={() => onChoose('duties')}>
        <span>◷</span> Công tác
      </button>
      <button type="button" className={active === 'boarding' ? 'active' : ''} onClick={() => onChoose('boarding')}>
        <span>⌂</span> Bán trú
      </button>
    </div>
  );
}

function NavButton({ id, label, icon = '→', active, onClick, nested, badge = 0 }) {
  return (
    <button type="button" className={`shell-nav-button ${active === id ? 'active' : ''} ${nested ? 'nested' : ''}`} onClick={() => onClick(id)}>
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
      {badge > 0 ? <b className="nav-badge">{badge > 99 ? '99+' : badge}</b> : null}
    </button>
  );
}

function formatViDate(isoDate) {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function statusLabel(status) {
  if (status === 'attended') return 'Đã tham gia';
  if (status === 'absent') return 'Chưa tham gia';
  return 'Chưa xác nhận';
}

function DutyTimingTags({ timing }) {
  if (!timing) return null;
  // Chỉ 1 trạng thái: quá hạn > đang diễn ra > gần đến hạn
  let tag = null;
  if (timing.isOverdue) tag = <span className="duty-tag overdue">Đã quá hạn</span>;
  else if (timing.isOngoing) tag = <span className="duty-tag live">Đang diễn ra</span>;
  else if (timing.nearDeadline) tag = <span className="duty-tag near">Gần đến hạn</span>;
  if (!tag) return null;
  return <span className="tag-row">{tag}</span>;
}

function MultiCheckList({ options, values, onChange, getLabel, emptyText = 'Không có lựa chọn' }) {
  const selected = new Set(values || []);
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };
  if (!options?.length) return <p className="muted multi-empty">{emptyText}</p>;
  return (
    <div className="multi-check-list">
      {options.map((item) => {
        const id = item._id;
        const label = getLabel ? getLabel(item) : item.name;
        return (
          <label key={id} className="multi-check-item">
            <input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} />
            <span>{label}</span>
          </label>
        );
      })}
    </div>
  );
}

function CollapsibleMultiCheckList({ title, options, values, onChange, getLabel, emptyText }) {
  const [open, setOpen] = useState(false);
  const selectedCount = values?.length || 0;
  return (
    <div className={`multi-check-group ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="multi-check-toggle"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <span className="multi-check-summary">
          {selectedCount ? `${selectedCount} đã chọn` : 'Chưa chọn'}
          <span className="multi-check-chevron" aria-hidden="true">⌄</span>
        </span>
      </button>
      {open ? (
        <MultiCheckList
          options={options}
          values={values}
          onChange={onChange}
          getLabel={getLabel}
          emptyText={emptyText}
        />
      ) : null}
    </div>
  );
}

function emptyDutyForm() {
  return {
    startDate: '',
    endDate: '',
    startTime: '08:00',
    endTime: '17:00',
    allDay: false,
    content: '',
    locationIds: [],
    departmentIds: [],
    participantUserIds: [],
  };
}

function DutiesAdminView({ currentUserId, allowManage = true }) {
  const options = useQuery(anyApi.duties.formOptions, allowManage ? {} : 'skip');
  const list = useQuery(anyApi.duties.listAdmin);
  const create = useMutation(anyApi.duties.create);
  const update = useMutation(anyApi.duties.update);
  const remove = useMutation(anyApi.duties.remove);
  const setOwnAttendance = useMutation(anyApi.duties.setAttendance);
  const [form, setForm] = useState(emptyDutyForm);
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [editorOpen, setEditorOpen] = useState(allowManage);
  const { pending, feedback, run } = useFeedback();

  const setField = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'allDay' && value) {
        next.endDate = prev.startDate || prev.endDate;
      }
      if (field === 'startDate' && prev.allDay) {
        next.endDate = value;
      }
      return next;
    });
  };

  const startEdit = (item) => {
    setEditing(item);
    setExpanded(item._id);
    setEditorOpen(true);
    setForm({
      startDate: item.startDate,
      endDate: item.endDate,
      startTime: item.startTime,
      endTime: item.endTime,
      allDay: Boolean(item.allDay),
      content: item.content || '',
      locationIds: [...(item.locationIds || [])],
      departmentIds: [...(item.departmentIds || [])],
      participantUserIds: [...(item.participantUserIds || [])],
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    const payload = {
      startDate: form.startDate,
      endDate: form.allDay ? form.startDate : form.endDate,
      startTime: form.startTime,
      endTime: form.endTime,
      allDay: form.allDay,
      content: form.content,
      locationIds: form.locationIds,
      departmentIds: form.departmentIds,
      participantUserIds: form.participantUserIds,
    };
    if (editing) {
      const ok = await run('save', () => update({ id: editing._id, ...payload }), 'Đã cập nhật công tác.');
      if (ok) {
        setEditing(null);
        setForm(emptyDutyForm());
      }
    } else {
      const ok = await run('save', () => create(payload), 'Đã thêm công tác.');
      if (ok) setForm(emptyDutyForm());
    }
  };

  if ((allowManage && options === undefined) || list === undefined) return <LoadingView label="Đang tải công tác…" />;

  return (
    <section className="work-management duty-workspace">
      <header className="work-hero duty-hero">
        <div>
          <span className="work-kicker">{allowManage ? 'Thiết lập · Công tác' : 'Không gian · Công tác'}</span>
          <h2>{allowManage ? 'Sổ công tác & lịch trình' : 'Công tác toàn hệ thống'}</h2>
          <p>
            {allowManage
              ? 'Lập lịch, phân công người tham gia và theo dõi trạng thái trong một không gian tập trung.'
              : 'Theo dõi lịch trình và trạng thái tham gia; mọi thao tác quản trị được tách riêng, rõ ràng.'}
          </p>
        </div>
        <div className="work-hero-stamp">
          <strong>{list.length}</strong>
          <span>CÔNG TÁC</span>
        </div>
      </header>

      {feedback.text ? (
        <div className={`work-feedback ${feedback.type}`} role="status" aria-live="polite">
          {feedback.text}
        </div>
      ) : null}

      <div className="work-page-actions duty-page-actions">
        <div>
          <span>{allowManage ? 'QUẢN LÝ CÔNG TÁC' : 'LỊCH TRÌNH'}</span>
          <h3>Kho công tác</h3>
        </div>
        {allowManage ? (
          <button
            type="button"
            className="work-primary-button"
            onClick={() => {
              if (editorOpen && editing) {
                setEditing(null);
                setForm(emptyDutyForm());
              }
              setEditorOpen((open) => !open);
            }}
          >
            <span>{editorOpen ? '×' : '+'}</span> {editorOpen ? 'Đóng biểu mẫu' : 'Thêm công tác'}
          </button>
        ) : null}
      </div>

      {allowManage && editorOpen ? <form className="work-editor duty-modern-editor" onSubmit={submit}>
        <div className="work-editor-title">
          <div>
            <span>{editing ? 'CẬP NHẬT LỊCH' : 'LỊCH MỚI'}</span>
            <h3>{editing ? 'Sửa công tác' : 'Thêm công tác'}</h3>
          </div>
          {editing && (
            <button type="button" className="work-ghost-button" onClick={() => { setEditing(null); setForm(emptyDutyForm()); }}>
              Hủy chỉnh sửa
            </button>
          )}
        </div>

        <label>
          Từ ngày
          <div className="inline-fields">
            <input required type="date" value={form.startDate} onChange={(e) => setField('startDate', e.target.value)} />
            <label className="check-inline">
              <input type="checkbox" checked={form.allDay} onChange={(e) => setField('allDay', e.target.checked)} />
              Cả ngày
            </label>
          </div>
        </label>

        <label className={form.allDay ? 'field-disabled' : undefined}>
          Đến ngày
          <input
            required
            type="date"
            value={form.allDay ? form.startDate : form.endDate}
            disabled={form.allDay}
            onChange={(e) => setField('endDate', e.target.value)}
          />
          {form.allDay ? <small>Đã chọn Cả ngày — Đến ngày trùng Từ ngày.</small> : null}
        </label>

        <label>
          Từ giờ
          <input required type="time" value={form.startTime} onChange={(e) => setField('startTime', e.target.value)} />
        </label>

        <label>
          Đến giờ
          <input required type="time" value={form.endTime} onChange={(e) => setField('endTime', e.target.value)} />
        </label>

        <label>
          Nội dung
          <textarea
            required
            maxLength={200}
            rows={3}
            value={form.content}
            onChange={(e) => setField('content', e.target.value)}
            placeholder="Nội dung công tác (tối đa 200 ký tự)"
          />
          <small>{form.content.length}/200</small>
        </label>

        <div className="duty-field">
          <span className="duty-field-label">Địa điểm</span>
          <CollapsibleMultiCheckList
            title="Chọn địa điểm"
            options={options.locations}
            values={form.locationIds}
            onChange={(ids) => setField('locationIds', ids)}
            emptyText="Chưa có địa điểm. Tạo trong Quản lý địa điểm."
          />
        </div>

        <div className="duty-field">
          <span className="duty-field-label">Phòng ban tham gia</span>
          <CollapsibleMultiCheckList
            title="Chọn phòng ban"
            options={options.departments}
            values={form.departmentIds}
            onChange={(ids) => setField('departmentIds', ids)}
            getLabel={(d) => `${d.name}${d.code ? ` (${d.code})` : ''}`}
            emptyText="Chưa có phòng ban."
          />
        </div>

        <div className="duty-field">
          <span className="duty-field-label">Cá nhân tham gia</span>
          <CollapsibleMultiCheckList
            title="Chọn cá nhân"
            options={options.users}
            values={form.participantUserIds}
            onChange={(ids) => setField('participantUserIds', ids)}
            getLabel={(u) => `${u.name || '—'} · ${u.email || ''}`}
            emptyText="Chưa có người dùng."
          />
        </div>

        <div className="work-editor-actions duty-editor-actions">
          <button type="button" className="work-ghost-button" onClick={() => setForm(emptyDutyForm())}>
            Xóa biểu mẫu
          </button>
          <button className="work-primary-button" disabled={Boolean(pending)}>
            {pending === 'save' ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Lưu công tác'}
          </button>
        </div>
      </form> : null}

      <div className="duty-modern-list">
        {list.length === 0 ? (
          <div className="work-empty">
            <span>◷</span>
            <h3>Chưa có công tác nào</h3>
            <p>{allowManage ? 'Bấm “Thêm công tác” để lập lịch đầu tiên.' : 'Công tác được tạo tại Quản trị hệ thống → Quản lý công tác.'}</p>
          </div>
        ) : (
          list.map((item) => {
            const open = expanded === item._id;
            return (
              <article className={`duty-modern-card ${open ? 'is-open' : ''}`} key={item._id}>
                <button type="button" className="duty-card-toggle" onClick={() => setExpanded(open ? null : item._id)}>
                  <span className="duty-date-tile" aria-hidden="true">
                    <strong>{item.startDate.slice(8, 10)}</strong>
                    <small>THÁNG {Number(item.startDate.slice(5, 7))}</small>
                  </span>
                  <div className="duty-card-main">
                    <strong>{item.content}</strong>
                    <DutyTimingTags timing={item.timing} />
                    <div className="duty-meta-grid">
                      <span>Từ ngày: {formatViDate(item.startDate)}</span>
                      <span>Đến ngày: {formatViDate(item.endDate)}</span>
                      <span>Từ giờ: {item.startTime}</span>
                      <span>Đến giờ: {item.endTime}</span>
                      <span>Địa điểm: {item.locationNames?.length ? item.locationNames.join(', ') : '—'}</span>
                      <span>Phòng ban: {item.departmentNames?.length ? item.departmentNames.join(', ') : '—'}</span>
                      <span>Cá nhân: {item.participantNames?.length ? item.participantNames.join(', ') : '—'}</span>
                      <span>Tham gia: {item.participants?.length || 0} người</span>
                    </div>
                  </div>
                  <span className="duty-expand-hint">{open ? 'Thu gọn' : 'Chi tiết'}</span>
                </button>
                {allowManage ? (
                  <div className="row-actions duty-actions">
                    <button type="button" className="work-outline-button" onClick={() => startEdit(item)} disabled={Boolean(pending)}>Sửa</button>
                    <button
                      type="button"
                      className="work-reject-button"
                      disabled={Boolean(pending)}
                      onClick={() => {
                        if (window.confirm('Xóa công tác này?')) {
                          void run(`del-${item._id}`, () => remove({ id: item._id }), 'Đã xóa công tác.');
                        }
                      }}
                    >
                      Xóa
                    </button>
                  </div>
                ) : null}
                {open && (
                  <div className="duty-detail">
                    <h4>Người tham gia & trạng thái</h4>
                    {!item.participants?.length ? (
                      <p className="muted">Chưa có người tham gia (chọn phòng ban hoặc cá nhân khi tạo công tác).</p>
                    ) : (
                      <ul className="member-list">
                        {item.participants.map((p) => {
                          const isCurrentUser = String(p._id) === String(currentUserId);
                          return (
                            <li key={p._id} className={isCurrentUser ? 'admin-self-row' : undefined}>
                              <span>
                                <strong>{p.name || '—'} {isCurrentUser ? <em className="current-user-tag">Bạn</em> : null}</strong>
                                <small>{p.email || ''}</small>
                              </span>
                              {isCurrentUser ? (
                                <span className="subordinate-actions admin-self-attendance">
                                  <span className={`attendance-pill ${p.status}`}>{statusLabel(p.status)}</span>
                                  <button
                                    type="button"
                                    className={`attend-btn ${p.status === 'attended' ? 'active' : ''}`}
                                    disabled={Boolean(pending) || !item.timing.isOngoing}
                                    title={!item.timing.isOngoing ? 'Chỉ xác nhận trong thời gian diễn ra công tác' : 'Xác nhận đã tham gia'}
                                    onClick={() =>
                                      void run(
                                        `admin-att-${item._id}-yes`,
                                        () => setOwnAttendance({ dutyId: item._id, status: 'attended' }),
                                        'Đã ghi nhận trạng thái của bạn: Đã tham gia.',
                                      )
                                    }
                                  >
                                    Đã tham gia
                                  </button>
                                  <button
                                    type="button"
                                    className={`attend-btn absent ${p.status === 'absent' ? 'active' : ''}`}
                                    disabled={Boolean(pending) || !item.timing.isOngoing}
                                    title={!item.timing.isOngoing ? 'Chỉ xác nhận trong thời gian diễn ra công tác' : 'Xác nhận chưa tham gia'}
                                    onClick={() =>
                                      void run(
                                        `admin-att-${item._id}-no`,
                                        () => setOwnAttendance({ dutyId: item._id, status: 'absent' }),
                                        'Đã ghi nhận trạng thái của bạn: Chưa tham gia.',
                                      )
                                    }
                                  >
                                    Chưa tham gia
                                  </button>
                                </span>
                              ) : (
                                <span className={`attendance-pill ${p.status}`}>{statusLabel(p.status)}</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function ViewAllDutyParticipants({ participants }) {
  const [expanded, setExpanded] = useState(false);
  const groups = useMemo(() => {
    const byDepartment = new Map();
    for (const participant of participants || []) {
      const departmentName = participant.departmentName || 'Chưa gán phòng ban';
      const people = byDepartment.get(departmentName) || [];
      people.push(participant);
      byDepartment.set(departmentName, people);
    }
    return [...byDepartment.entries()]
      .map(([departmentName, people]) => ({ departmentName, people }))
      .sort((a, b) => a.departmentName.localeCompare(b.departmentName, 'vi'));
  }, [participants]);

  if (!participants?.length) return null;

  return (
    <div className="view-all-participants">
      <button
        type="button"
        className="view-all-participants-toggle"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span>
          <strong>Nhân sự tham gia</strong>
          <small>{participants.length} người · {groups.length} phòng ban</small>
        </span>
        <i aria-hidden="true">{expanded ? '⌃' : '⌄'}</i>
      </button>
      {expanded ? (
        <div className="view-all-department-list">
          {groups.map((group) => (
            <section className="view-all-department" key={group.departmentName}>
              <header>
                <strong>{group.departmentName}</strong>
                <span>{group.people.length}</span>
              </header>
              <ul className="member-list">
                {group.people.map((participant) => (
                  <li key={participant._id}>
                    <span>
                      <strong>{participant.name || participant.email || '—'}</strong>
                      <small>
                        {participant.email || ''}
                        {participant.positionName ? ` · ${participant.positionName}` : ''}
                      </small>
                    </span>
                    <span className={`attendance-pill ${participant.status}`}>
                      {statusLabel(participant.status)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DutiesUserView({ access }) {
  const data = useQuery(anyApi.duties.listMine);
  const setAttendance = useMutation(anyApi.duties.setAttendance);
  const setSubordinateAttendance = useMutation(anyApi.duties.setAttendanceForUser);
  const { pending, feedback, run } = useFeedback();
  const canEdit = access === 'edit' || data?.canEdit;

  if (data === undefined) return <LoadingView label="Đang tải danh sách công tác…" />;
  const assignedDuties = data.duties.filter((item) => item.isMine);
  const confirmedDuties = assignedDuties.filter((item) => item.myStatus !== 'pending');
  const isGlobalView = data.canViewAll || data.isAdmin;

  return (
    <section className="work-user-view duty-workspace">
      <header className="work-hero duty-hero">
        <div>
          <span className="work-kicker">Không gian · Công tác</span>
          <h2>{isGlobalView ? 'Công tác toàn hệ thống' : 'Lịch công tác của tôi'}</h2>
          <p>
            {data.isAdmin
              ? 'Theo dõi toàn bộ lịch trình và trạng thái tham gia trên một dòng thời gian rõ ràng.'
              : data.canViewAll
              ? 'Bạn đang dùng quyền Xem tối cao: có thể xem công tác và trạng thái tham gia của mọi user, được nhóm theo phòng ban.'
              : 'Danh sách sắp theo thời hạn gần nhất. Lịch cá nhân và lịch của cấp dưới cùng phòng ban (theo cấp Chức vụ) đều hiển thị tại đây.'}
            {!data.canViewAll && canEdit
              ? ' Bạn có quyền xác nhận tham gia trong thời gian diễn ra sự kiện.'
              : ' Đây là chế độ chỉ xem — không thể thay đổi dữ liệu.'}
          </p>
        </div>
        <div className="work-hero-stamp">
          <strong>
            {isGlobalView ? data.duties.length : confirmedDuties.length}
            {!isGlobalView ? <small>/{assignedDuties.length}</small> : null}
          </strong>
          <span>{isGlobalView ? 'CÔNG TÁC' : 'ĐÃ XÁC NHẬN'}</span>
        </div>
      </header>

      {feedback.text ? (
        <div className={`work-feedback ${feedback.type}`} role="status" aria-live="polite">
          {feedback.text}
        </div>
      ) : null}

      <div className="work-user-list duty-modern-list">
        {!data.duties?.length ? (
          <div className="work-empty">
            <span>✓</span>
            <h3>Lịch công tác đang trống</h3>
            <p>Không có công tác nào được gán cho bạn trong thời gian này.</p>
          </div>
        ) : (
          data.duties.map((item) => (
            <article className="work-user-card duty-modern-card user-duty-card" key={item._id}>
              <div className="duty-card-main">
                <div className="duty-title-row">
                  <span className="duty-date-tile" aria-hidden="true">
                    <strong>{item.startDate.slice(8, 10)}</strong>
                    <small>THÁNG {Number(item.startDate.slice(5, 7))}</small>
                  </span>
                  <strong>{item.content}</strong>
                  <DutyTimingTags timing={item.timing} />
                </div>
                <div className="duty-meta-grid view-only">
                  <div><span className="meta-label">Từ ngày</span><span>{formatViDate(item.startDate)}</span></div>
                  <div><span className="meta-label">Đến ngày</span><span>{formatViDate(item.endDate)}</span></div>
                  <div><span className="meta-label">Từ giờ</span><span>{item.startTime}</span></div>
                  <div><span className="meta-label">Đến giờ</span><span>{item.endTime}</span></div>
                  <div><span className="meta-label">Nội dung</span><span>{item.content}</span></div>
                  <div><span className="meta-label">Địa điểm</span><span>{item.locationNames?.length ? item.locationNames.join(', ') : '—'}</span></div>
                  <div><span className="meta-label">Phòng ban tham gia</span><span>{item.departmentNames?.length ? item.departmentNames.join(', ') : '—'}</span></div>
                  <div><span className="meta-label">Cá nhân tham gia</span><span>{item.participantNames?.length ? item.participantNames.join(', ') : '—'}</span></div>
                </div>
                {item.isMine && canEdit ? (
                  <div className="attendance-actions">
                    <span className={`attendance-pill ${item.myStatus}`}>{statusLabel(item.myStatus)}</span>
                    <button
                      type="button"
                      className={`attend-btn ${item.myStatus === 'attended' ? 'active' : ''}`}
                      disabled={Boolean(pending) || !item.timing.canMarkAttendance}
                      title={!item.timing.canMarkAttendance ? 'Chỉ bấm được khi công tác đang diễn ra' : 'Xác nhận đã tham gia'}
                      onClick={() =>
                        run(`att-${item._id}-yes`, () => setAttendance({ dutyId: item._id, status: 'attended' }), 'Đã ghi nhận: Đã tham gia.')
                      }
                    >
                      Đã tham gia
                    </button>
                    <button
                      type="button"
                      className={`attend-btn absent ${item.myStatus === 'absent' ? 'active' : ''}`}
                      disabled={Boolean(pending) || !item.timing.canMarkAttendance}
                      title={!item.timing.canMarkAttendance ? 'Chỉ bấm được khi công tác đang diễn ra' : 'Xác nhận chưa tham gia'}
                      onClick={() =>
                        run(`att-${item._id}-no`, () => setAttendance({ dutyId: item._id, status: 'absent' }), 'Đã ghi nhận: Chưa tham gia.')
                      }
                    >
                      Chưa tham gia
                    </button>
                    {!item.timing.canMarkAttendance ? (
                      <small className="muted">
                        {item.timing.isUpcoming
                          ? 'Chưa đến giờ diễn ra — chưa thể xác nhận tham gia.'
                          : item.timing.isOverdue
                            ? 'Đã kết thúc — không thể đổi trạng thái tham gia.'
                            : ''}
                      </small>
                    ) : null}
                  </div>
                ) : null}
                {item.subordinateParticipants?.length ? (
                  <div className="subordinate-attendance">
                    <div className="subordinate-heading">
                      <strong>Cấp dưới cùng phòng ban</strong>
                      <span>{item.subordinateParticipants.length} người</span>
                    </div>
                    <ul className="member-list">
                      {item.subordinateParticipants.map((participant) => {
                        const canMark = Boolean(
                          data.canManageSubordinates &&
                          item.timing.canMarkAttendance,
                        );
                        return (
                          <li key={participant._id} className="subordinate-row">
                            <span>
                              <strong>{participant.name || '—'}</strong>
                              <small>
                                {participant.email || ''}
                                {participant.positionName ? ` · ${participant.positionName}` : ''}
                              </small>
                            </span>
                            <span className="subordinate-actions">
                              <span className={`attendance-pill ${participant.status}`}>{statusLabel(participant.status)}</span>
                              <button
                                type="button"
                                className={`attend-btn ${participant.status === 'attended' ? 'active' : ''}`}
                                disabled={Boolean(pending) || !canMark}
                                title={!canMark ? 'Chỉ cấp trên cùng phòng ban mới được cập nhật trong thời gian diễn ra' : 'Xác nhận đã tham gia'}
                                onClick={() =>
                                  run(
                                    `sub-att-${item._id}-${participant._id}-yes`,
                                    () => setSubordinateAttendance({ dutyId: item._id, userId: participant._id, status: 'attended' }),
                                    `Đã ghi nhận ${participant.name || 'người tham gia'}: Đã tham gia.`,
                                  )
                                }
                              >
                                Đã tham gia
                              </button>
                              <button
                                type="button"
                                className={`attend-btn absent ${participant.status === 'absent' ? 'active' : ''}`}
                                disabled={Boolean(pending) || !canMark}
                                title={!canMark ? 'Chỉ cấp trên cùng phòng ban mới được cập nhật trong thời gian diễn ra' : 'Xác nhận chưa tham gia'}
                                onClick={() =>
                                  run(
                                    `sub-att-${item._id}-${participant._id}-no`,
                                    () => setSubordinateAttendance({ dutyId: item._id, userId: participant._id, status: 'absent' }),
                                    `Đã ghi nhận ${participant.name || 'người tham gia'}: Chưa tham gia.`,
                                  )
                                }
                              >
                                Chưa tham gia
                              </button>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    {!data.canManageSubordinates ? (
                      <small className="muted">Bạn đang ở chế độ chỉ xem hoặc chưa được gán cấp chức vụ cao hơn.</small>
                    ) : !item.timing.canMarkAttendance ? (
                      <small className="muted">
                        {item.timing.isUpcoming
                          ? 'Chưa đến giờ diễn ra — chưa thể cập nhật cấp dưới.'
                          : 'Đã kết thúc — không thể cập nhật cấp dưới.'}
                      </small>
                    ) : null}
                  </div>
                ) : null}
                {data.canViewAll ? (
                  <ViewAllDutyParticipants participants={item.visibleParticipants} />
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function useFeedback() {
  const [pending, setPending] = useState('');
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const run = async (name, operation, success) => {
    setPending(name);
    setFeedback({ type: '', text: '' });
    try {
      await operation();
      setFeedback({ type: 'success', text: success });
      return true;
    } catch (error) {
      setFeedback({ type: 'error', text: messageFor(error) });
      return false;
    } finally {
      setPending('');
    }
  };
  return { pending, feedback, setFeedback, run };
}

function emptyUserForm() {
  return {
    name: '',
    email: '',
    role: 'user',
    departmentId: '',
    permissionGroupId: '',
    positionId: '',
    temporaryPassword: '',
  };
}

function UserManagement() {
  const data = useQuery(anyApi.users.bootstrap);
  const create = useAction(anyApi.users.create);
  const update = useAction(anyApi.users.update);
  const setDisabled = useAction(anyApi.users.setDisabled);
  const remove = useAction(anyApi.users.remove);
  const resetPassword = useAction(anyApi.users.resetPassword);
  const [form, setForm] = useState(emptyUserForm);
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const { pending, feedback, run } = useFeedback();

  const departments = (data?.departments || []).filter((d) => d.active);
  const groups = (data?.permissionGroups || []).filter((g) => g.active);
  const positions = (data?.positions || []).filter((p) => p.active);
  const users = data?.users || [];
  const systemRoles = data?.systemRoles || [
    { key: 'admin', name: 'Administrator' },
    { key: 'moderator', name: 'Moderator' },
    { key: 'user', name: 'User' },
  ];

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const usesPermissionGroup = form.role === 'user';
  const payload = () => ({
    name: form.name,
    email: form.email,
    role: form.role,
    departmentId: form.departmentId || undefined,
    // Administrator and Moderator have full feature access and ignore permission groups.
    permissionGroupId: usesPermissionGroup ? form.permissionGroupId || undefined : undefined,
    positionId: form.positionId || undefined,
  });

  const submitCreate = async (event) => {
    event.preventDefault();
    const ok = await run(
      'create',
      () => create({ ...payload(), temporaryPassword: form.temporaryPassword }),
      'Đã tạo tài khoản. Chuyển mật khẩu tạm thời qua kênh nội bộ an toàn.',
    );
    if (ok) setForm(emptyUserForm());
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    const ok = await run('update', () => update({ id: editing._id, ...payload() }), 'Đã cập nhật tài khoản.');
    if (ok) {
      setEditing(null);
      setForm(emptyUserForm());
    }
  };

  const startEdit = (item) => {
    setEditing(item);
    setResetting(null);
    setForm({
      name: item.name || '',
      email: item.email || '',
      role: ['admin', 'moderator', 'user'].includes(item.role) ? item.role : 'user',
      departmentId: item.departmentId || '',
      permissionGroupId: item.permissionGroupId || '',
      positionId: item.positionId || '',
      temporaryPassword: '',
    });
  };

  const confirmDelete = (item) => {
    if (window.confirm(`Xóa tài khoản ${item.email}? Thao tác này không thể hoàn tác.`)) {
      void run(`delete-${item._id}`, () => remove({ id: item._id }), 'Đã xóa tài khoản.');
    }
  };

  const submitReset = async (event) => {
    event.preventDefault();
    const ok = await run(
      `reset-${resetting._id}`,
      () => resetPassword({ id: resetting._id, temporaryPassword: form.temporaryPassword }),
      'Đã đặt mật khẩu tạm thời, thu hồi phiên và yêu cầu đổi mật khẩu khi đăng nhập.',
    );
    if (ok) {
      setResetting(null);
      setForm(emptyUserForm());
    }
  };

  if (data === undefined) return <LoadingView label="Đang tải danh sách người dùng…" />;

  return (
    <section className="admin-view modern-management users-management">
      <div className="section-intro">
        <div>
          <span className="status-pill blue">Quản trị người dùng</span>
          <h2>Quản lý người dùng</h2>
          <p>
            Administrator có toàn quyền; Moderator quản trị toàn bộ nghiệp vụ nhưng không truy cập Cài đặt tối cao; User phụ thuộc nhóm quyền.
          </p>
        </div>
      </div>
      <div className={`feedback ${feedback.type}`} role="status" aria-live="polite">
        {feedback.text}
      </div>
      <form className="admin-form" onSubmit={editing ? submitEdit : submitCreate}>
        <div className="form-heading">
          <strong>{editing ? `Chỉnh sửa: ${editing.email}` : 'Tạo tài khoản'}</strong>
          {editing && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setEditing(null);
                setForm(emptyUserForm());
              }}
            >
              Hủy chỉnh sửa
            </button>
          )}
        </div>
        <label>
          Họ tên
          <input required maxLength="120" value={form.name} onChange={(e) => setField('name', e.target.value)} />
        </label>
        <label>
          Email (đăng nhập)
          <input required type="email" autoComplete="off" value={form.email} onChange={(e) => setField('email', e.target.value)} disabled={Boolean(editing)} />
          <small>{editing ? 'Email đăng nhập không đổi qua form này.' : 'Email được chuẩn hóa (trim + lowercase) và phải duy nhất.'}</small>
        </label>
        <label>
          Vai trò
          <select
            value={form.role}
            onChange={(e) => {
              const role = e.target.value;
              setForm((prev) => ({
                ...prev,
                role,
                // Nhóm quyền chỉ áp dụng cho User.
                permissionGroupId: role === 'user' ? prev.permissionGroupId : '',
              }));
            }}
          >
            {systemRoles.map((role) => (
              <option key={role.key} value={role.key}>
                {role.name}
              </option>
            ))}
          </select>
          <small>Administrator và Moderator không dùng nhóm quyền. User phụ thuộc nhóm quyền được gán.</small>
        </label>
        <label>
          Phòng ban
          <select value={form.departmentId} onChange={(e) => setField('departmentId', e.target.value)}>
            <option value="">Chưa gán</option>
            {departments.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Chức vụ
          <select value={form.positionId} onChange={(e) => setField('positionId', e.target.value)}>
            <option value="">Chưa gán</option>
            {positions.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} ({p.level}★)
              </option>
            ))}
          </select>
        </label>
        <label className={!usesPermissionGroup ? 'field-disabled' : undefined}>
          Nhóm quyền
          <select
            value={usesPermissionGroup ? form.permissionGroupId : ''}
            onChange={(e) => setField('permissionGroupId', e.target.value)}
            disabled={!usesPermissionGroup}
          >
            <option value="">{usesPermissionGroup ? 'Chưa gán' : `Không áp dụng (${ROLE_LABELS[form.role]})`}</option>
            {usesPermissionGroup &&
              groups.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
          </select>
          <small>
            {usesPermissionGroup
              ? 'Chỉ áp dụng cho User. Quyết định menu Ẩn / Xem / Xem tối cao / Sửa.'
              : `${ROLE_LABELS[form.role]} có toàn quyền chức năng — không cần gán nhóm quyền.`}
          </small>
        </label>
        {!editing && (
          <label>
            Mật khẩu tạm thời
            <input required minLength="8" type="password" autoComplete="new-password" value={form.temporaryPassword} onChange={(e) => setField('temporaryPassword', e.target.value)} />
            <small>Ít nhất 8 ký tự. Không gửi qua email hoặc chat công khai.</small>
          </label>
        )}
        <button className="primary-button" disabled={Boolean(pending)}>
          {pending === 'create' ? 'Đang tạo…' : pending === 'update' ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : '+ Tạo tài khoản'}
        </button>
      </form>
      {resetting && (
        <form className="admin-form compact-form" onSubmit={submitReset}>
          <div className="form-heading">
            <strong>Đặt lại mật khẩu: {resetting.email}</strong>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setResetting(null);
                setForm(emptyUserForm());
              }}
            >
              Hủy
            </button>
          </div>
          <label>
            Mật khẩu tạm thời mới
            <input required minLength="8" type="password" autoComplete="new-password" value={form.temporaryPassword} onChange={(e) => setField('temporaryPassword', e.target.value)} />
          </label>
          <button className="primary-button" disabled={Boolean(pending)}>
            {pending ? 'Đang đặt lại…' : 'Đặt lại mật khẩu'}
          </button>
        </form>
      )}
      <div className="user-table wide-table" aria-label="Danh sách người dùng">
        <div className="user-table-head user-table-head-5">
          <span>Người dùng</span>
          <span>Vai trò</span>
          <span>PB / Chức vụ / Nhóm quyền</span>
          <span>Trạng thái</span>
          <span>Thao tác</span>
        </div>
        {users.map((item) => (
          <div className="user-row user-row-5" key={item._id}>
            <div>
              <strong>{item.name}</strong>
              <span>{item.email}</span>
            </div>
            <div>
              <span className="role-tag">{ROLE_LABELS[item.role] || item.role}</span>
            </div>
            <div className="meta-stack">
              <span>{departments.find((d) => d._id === item.departmentId)?.name || 'Chưa gán PB'}</span>
              <span>{positions.find((p) => p._id === item.positionId)?.name || 'Chưa gán chức vụ'}</span>
              <span>{groups.find((g) => g._id === item.permissionGroupId)?.name || 'Chưa gán nhóm quyền'}</span>
            </div>
            <span className={item.status === 'active' ? 'live-tag' : 'pending-tag'}>
              {item.status === 'active' ? (item.mustChangePassword ? 'Cần đổi MK' : 'Hoạt động') : item.status === 'disabled' ? 'Đã khóa' : item.status}
            </span>
            <div className="row-actions">
              <button type="button" onClick={() => startEdit(item)} disabled={Boolean(pending)}>
                Sửa
              </button>
              <button type="button" onClick={() => setResetting(item)} disabled={Boolean(pending) || !item.email}>
                Đặt lại MK
              </button>
              <button
                type="button"
                onClick={() =>
                  run(
                    `status-${item._id}`,
                    () => setDisabled({ id: item._id, disabled: item.status === 'active' }),
                    item.status === 'active' ? 'Đã khóa tài khoản.' : 'Đã mở lại tài khoản.',
                  )
                }
                disabled={Boolean(pending)}
              >
                {item.status === 'active' ? 'Khóa' : 'Mở khóa'}
              </button>
              <button type="button" className="danger-button" onClick={() => confirmDelete(item)} disabled={Boolean(pending)}>
                Xóa
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AssignUserPanel({ users, filterId, idField, onAssign, onUnassign, pending, label }) {
  const [userId, setUserId] = useState('');
  const members = users.filter((u) => u[idField] === filterId);
  const candidates = users.filter((u) => u.status === 'active' && u[idField] !== filterId);
  return (
    <div className="assign-panel">
      <div className="assign-row">
        <select value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Chọn người dùng…</option>
          {candidates.map((u) => (
            <option key={u._id} value={u._id}>
              {u.name || u.email} ({u.email})
            </option>
          ))}
        </select>
        <button
          type="button"
          className="primary-button small-btn"
          disabled={!userId || Boolean(pending)}
          onClick={async () => {
            if (!userId) return;
            await onAssign(userId);
            setUserId('');
          }}
        >
          + Thêm user vào {label}
        </button>
      </div>
      {members.length === 0 ? (
        <p className="muted">Chưa có user trong mục này.</p>
      ) : (
        <ul className="member-list">
          {members.map((u) => (
            <li key={u._id}>
              <span>
                <strong>{u.name || '—'}</strong> · {u.email}
              </span>
              <button type="button" className="text-button" disabled={Boolean(pending)} onClick={() => onUnassign(u._id)}>
                Gỡ
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DepartmentManagement() {
  const data = useQuery(anyApi.departments.list);
  const create = useMutation(anyApi.departments.create);
  const update = useMutation(anyApi.departments.update);
  const remove = useMutation(anyApi.departments.remove);
  const assignUser = useMutation(anyApi.departments.assignUser);
  const unassignUser = useMutation(anyApi.departments.unassignUser);
  const [form, setForm] = useState({ name: '', code: '' });
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const { pending, feedback, run } = useFeedback();

  const departments = (data?.departments || []).filter((d) => d.active);
  const users = data?.users || [];

  const submit = async (event) => {
    event.preventDefault();
    if (editing) {
      const ok = await run('save', () => update({ id: editing._id, name: form.name, code: form.code }), 'Đã cập nhật phòng ban.');
      if (ok) {
        setEditing(null);
        setForm({ name: '', code: '' });
      }
    } else {
      const ok = await run('save', () => create({ name: form.name, code: form.code }), 'Đã thêm phòng ban. Có thể thêm user bên dưới.');
      if (ok) setForm({ name: '', code: '' });
    }
  };

  if (data === undefined) return <LoadingView label="Đang tải phòng ban…" />;

  return (
    <section className="admin-view modern-management departments-management">
      <div className="section-intro">
        <div>
          <span className="status-pill blue">Phòng ban</span>
          <h2>Quản lý phòng ban</h2>
          <p>Thêm, sửa, xóa phòng ban. Sau khi tạo có thể gán user vào phòng ban.</p>
        </div>
      </div>
      <div className={`feedback ${feedback.type}`} role="status" aria-live="polite">
        {feedback.text}
      </div>
      <form className="admin-form" onSubmit={submit}>
        <div className="form-heading">
          <strong>{editing ? `Sửa: ${editing.name}` : 'Thêm phòng ban'}</strong>
          {editing && (
            <button type="button" className="text-button" onClick={() => { setEditing(null); setForm({ name: '', code: '' }); }}>
              Hủy
            </button>
          )}
        </div>
        <label>
          Tên phòng ban
          <input required maxLength="120" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </label>
        <label>
          Mã
          <input required maxLength="32" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
        </label>
        <button className="primary-button" disabled={Boolean(pending)}>
          {editing ? 'Lưu' : '+ Thêm phòng ban'}
        </button>
      </form>
      <div className="card-list">
        {departments.map((item) => (
          <article className="mgmt-card" key={item._id}>
            <div className="mgmt-card-head">
              <div>
                <strong>{item.name}</strong>
                <span className="code-tag">{item.code}</span>
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(item);
                    setForm({ name: item.name, code: item.code });
                  }}
                  disabled={Boolean(pending)}
                >
                  Sửa
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    if (window.confirm(`Xóa phòng ban ${item.name}? User trong phòng ban sẽ được gỡ gán.`)) {
                      void run(`del-${item._id}`, () => remove({ id: item._id }), 'Đã xóa phòng ban.');
                    }
                  }}
                  disabled={Boolean(pending)}
                >
                  Xóa
                </button>
                <button type="button" onClick={() => setExpanded(expanded === item._id ? null : item._id)}>
                  {expanded === item._id ? 'Ẩn user' : 'Thêm user'}
                </button>
              </div>
            </div>
            {expanded === item._id && (
              <AssignUserPanel
                users={users}
                filterId={item._id}
                idField="departmentId"
                label="phòng ban"
                pending={pending}
                onAssign={(userId) => run('assign', () => assignUser({ departmentId: item._id, userId }), 'Đã gán user vào phòng ban.')}
                onUnassign={(userId) => run('unassign', () => unassignUser({ userId }), 'Đã gỡ user khỏi phòng ban.')}
              />
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function LocationManagement() {
  const data = useQuery(anyApi.locations.list);
  const create = useMutation(anyApi.locations.create);
  const update = useMutation(anyApi.locations.update);
  const remove = useMutation(anyApi.locations.remove);
  const [form, setForm] = useState({ name: '', description: '' });
  const [editing, setEditing] = useState(null);
  const { pending, feedback, run } = useFeedback();

  const locations = (data?.locations || []).filter((item) => item.active);

  const submit = async (event) => {
    event.preventDefault();
    const payload = {
      name: form.name,
      description: form.description.trim() ? form.description : undefined,
    };
    if (editing) {
      const ok = await run('save', () => update({ id: editing._id, ...payload }), 'Đã cập nhật địa điểm.');
      if (ok) {
        setEditing(null);
        setForm({ name: '', description: '' });
      }
    } else {
      const ok = await run('save', () => create(payload), 'Đã thêm địa điểm.');
      if (ok) setForm({ name: '', description: '' });
    }
  };

  if (data === undefined) return <LoadingView label="Đang tải địa điểm…" />;

  return (
    <section className="admin-view modern-management locations-management">
      <div className="section-intro">
        <div>
          <span className="status-pill blue">Địa điểm</span>
          <h2>Quản lý địa điểm</h2>
          <p>Thêm, sửa, xóa địa điểm dùng trong các nghiệp vụ nhà trường.</p>
        </div>
      </div>
      <div className={`feedback ${feedback.type}`} role="status" aria-live="polite">
        {feedback.text}
      </div>
      <form className="admin-form" onSubmit={submit}>
        <div className="form-heading">
          <strong>{editing ? `Sửa: ${editing.name}` : 'Thêm địa điểm'}</strong>
          {editing && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setEditing(null);
                setForm({ name: '', description: '' });
              }}
            >
              Hủy
            </button>
          )}
        </div>
        <label>
          Tên địa điểm
          <input required maxLength="120" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </label>
        <label>
          Mô tả
          <textarea
            maxLength="1000"
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Mô tả ngắn về địa điểm (tùy chọn)"
          />
        </label>
        <button className="primary-button" disabled={Boolean(pending)}>
          {editing ? 'Lưu' : '+ Thêm địa điểm'}
        </button>
      </form>
      <div className="card-list">
        {locations.length === 0 ? (
          <p className="muted">Chưa có địa điểm nào. Thêm địa điểm đầu tiên ở form trên.</p>
        ) : (
          locations.map((item) => (
            <article className="mgmt-card" key={item._id}>
              <div className="mgmt-card-head">
                <div>
                  <strong>{item.name}</strong>
                  {item.description ? <span className="muted-block">{item.description}</span> : <span className="muted-block">Không có mô tả</span>}
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(item);
                      setForm({ name: item.name, description: item.description || '' });
                    }}
                    disabled={Boolean(pending)}
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => {
                      if (window.confirm(`Xóa địa điểm ${item.name}?`)) {
                        void run(`del-${item._id}`, () => remove({ id: item._id }), 'Đã xóa địa điểm.');
                      }
                    }}
                    disabled={Boolean(pending)}
                  >
                    Xóa
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function defaultAccessForm() {
  return Object.fromEntries(PRIMARY_MENUS.map(([id]) => [id, 'hidden']));
}

function PermissionGroupManagement() {
  const data = useQuery(anyApi.permissionGroups.list);
  const create = useMutation(anyApi.permissionGroups.create);
  const update = useMutation(anyApi.permissionGroups.update);
  const remove = useMutation(anyApi.permissionGroups.remove);
  const assignUser = useMutation(anyApi.permissionGroups.assignUser);
  const unassignUser = useMutation(anyApi.permissionGroups.unassignUser);
  const [form, setForm] = useState({ name: '', description: '', access: defaultAccessForm() });
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const { pending, feedback, run } = useFeedback();

  const groups = (data?.groups || []).filter((g) => g.active);
  const menus = data?.menus || PRIMARY_MENUS.map(([id, label]) => ({ id, label }));
  const users = data?.users || [];

  const toMenuAccess = (accessMap) => menus.map((m) => ({ menu: m.id, access: accessMap[m.id] || 'hidden' }));

  const startEdit = (item) => {
    setEditing(item);
    const access = defaultAccessForm();
    for (const entry of item.menuAccess || []) access[entry.menu] = entry.access;
    setForm({ name: item.name, description: item.description || '', access });
  };

  const submit = async (event) => {
    event.preventDefault();
    const menuAccess = toMenuAccess(form.access);
    if (editing) {
      const ok = await run(
        'save',
        () => update({ id: editing._id, name: form.name, description: form.description || undefined, menuAccess }),
        'Đã cập nhật nhóm quyền.',
      );
      if (ok) {
        setEditing(null);
        setForm({ name: '', description: '', access: defaultAccessForm() });
      }
    } else {
      const ok = await run(
        'save',
        () => create({ name: form.name, description: form.description || undefined, menuAccess }),
        'Đã tạo nhóm quyền. Có thể thêm user bên dưới.',
      );
      if (ok) setForm({ name: '', description: '', access: defaultAccessForm() });
    }
  };

  if (data === undefined) return <LoadingView label="Đang tải nhóm quyền…" />;

  return (
    <section className="admin-view modern-management permission-groups-management">
      <div className="section-intro">
        <div>
          <span className="status-pill blue">Nhóm quyền</span>
          <h2>Quản lý nhóm quyền</h2>
          <p>
            Mỗi nhóm quy định quyền trên menu Quản trị hệ thống: Ẩn, Xem, Xem tối cao (xem mọi user nhưng không chỉnh sửa), hoặc Sửa.
          </p>
        </div>
      </div>
      <div className={`feedback ${feedback.type}`} role="status" aria-live="polite">
        {feedback.text}
      </div>
      <form className="admin-form wide-form" onSubmit={submit}>
        <div className="form-heading">
          <strong>{editing ? `Sửa: ${editing.name}` : 'Thêm nhóm quyền'}</strong>
          {editing && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setEditing(null);
                setForm({ name: '', description: '', access: defaultAccessForm() });
              }}
            >
              Hủy
            </button>
          )}
        </div>
        <label>
          Tên nhóm quyền
          <input required maxLength="120" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </label>
        <label>
          Mô tả (tùy chọn)
          <input maxLength="500" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </label>
        <div className="perm-matrix" role="group" aria-label="Quyền menu">
          <div className="perm-matrix-head">
            <span>Menu</span>
            <span>Ẩn</span>
            <span>Xem</span>
            <span>Xem tối cao</span>
            <span>Sửa</span>
          </div>
          {menus.map((menu) => (
            <div className="perm-matrix-row" key={menu.id}>
              <span>{menu.label}</span>
              {['hidden', 'view', 'view_all', 'edit'].map((level) => (
                <label key={level} className="radio-cell">
                  <input
                    type="radio"
                    name={`access-${menu.id}`}
                    checked={(form.access[menu.id] || 'hidden') === level}
                    onChange={() => setForm((f) => ({ ...f, access: { ...f.access, [menu.id]: level } }))}
                  />
                  <span className="sr-only">{ACCESS_LABELS[level]}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
        <button className="primary-button" disabled={Boolean(pending)}>
          {editing ? 'Lưu nhóm quyền' : '+ Thêm nhóm quyền'}
        </button>
      </form>
      <div className="card-list">
        {groups.map((item) => {
          const accessMap = Object.fromEntries((item.menuAccess || []).map((e) => [e.menu, e.access]));
          return (
            <article className="mgmt-card" key={item._id}>
              <div className="mgmt-card-head">
                <div>
                  <strong>{item.name}</strong>
                  {item.description && <span className="muted-block">{item.description}</span>}
                </div>
                <div className="row-actions">
                  <button type="button" onClick={() => startEdit(item)} disabled={Boolean(pending)}>
                    Sửa
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => {
                      if (window.confirm(`Xóa nhóm quyền ${item.name}? User trong nhóm sẽ được gỡ gán.`)) {
                        void run(`del-${item._id}`, () => remove({ id: item._id }), 'Đã xóa nhóm quyền.');
                      }
                    }}
                    disabled={Boolean(pending)}
                  >
                    Xóa
                  </button>
                  <button type="button" onClick={() => setExpanded(expanded === item._id ? null : item._id)}>
                    {expanded === item._id ? 'Ẩn user' : 'Thêm user'}
                  </button>
                </div>
              </div>
              <div className="perm-summary">
                {menus.map((menu) => (
                  <span key={menu.id} className={`access-chip ${accessMap[menu.id] || 'hidden'}`}>
                    {menu.label}: {ACCESS_LABELS[accessMap[menu.id] || 'hidden']}
                  </span>
                ))}
              </div>
              {expanded === item._id && (
                <AssignUserPanel
                  users={users}
                  filterId={item._id}
                  idField="permissionGroupId"
                  label="nhóm quyền"
                  pending={pending}
                  onAssign={(userId) =>
                    run('assign', () => assignUser({ permissionGroupId: item._id, userId }), 'Đã gán user vào nhóm quyền.')
                  }
                  onUnassign={(userId) => run('unassign', () => unassignUser({ userId }), 'Đã gỡ user khỏi nhóm quyền.')}
                />
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PositionManagement() {
  const data = useQuery(anyApi.positions.list);
  const create = useMutation(anyApi.positions.create);
  const update = useMutation(anyApi.positions.update);
  const remove = useMutation(anyApi.positions.remove);
  const assignUser = useMutation(anyApi.positions.assignUser);
  const unassignUser = useMutation(anyApi.positions.unassignUser);
  const [form, setForm] = useState({ name: '', code: '', level: 3 });
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const { pending, feedback, run } = useFeedback();

  const positions = (data?.positions || []).filter((p) => p.active);
  const users = data?.users || [];

  const submit = async (event) => {
    event.preventDefault();
    const level = Number(form.level);
    if (editing) {
      const ok = await run(
        'save',
        () => update({ id: editing._id, name: form.name, code: form.code, level }),
        'Đã cập nhật chức vụ.',
      );
      if (ok) {
        setEditing(null);
        setForm({ name: '', code: '', level: 3 });
      }
    } else {
      const ok = await run('save', () => create({ name: form.name, code: form.code, level }), 'Đã tạo chức vụ. Có thể thêm user bên dưới.');
      if (ok) setForm({ name: '', code: '', level: 3 });
    }
  };

  if (data === undefined) return <LoadingView label="Đang tải chức vụ…" />;

  return (
    <section className="admin-view modern-management positions-management">
      <div className="section-intro">
        <div>
          <span className="status-pill blue">Chức vụ</span>
          <h2>Quản lý chức vụ</h2>
          <p>
            Cấp bậc 1–5 sao quyết định quy trình duyệt: cấp cao hơn duyệt được cấp thấp hơn; có thể duyệt thay cấp thấp hơn (ghi log người duyệt và thời điểm).
          </p>
        </div>
      </div>
      <div className={`feedback ${feedback.type}`} role="status" aria-live="polite">
        {feedback.text}
      </div>
      <div className="notice approval-note">
        <strong>Quy tắc duyệt:</strong>
        <span>Người có cấp sao cao hơn sẽ được phép duyệt người có cấp sao thấp hơn.</span>
        <span>Ví dụ: 5 sao duyệt cho 4 sao trở xuống, 4 sao duyệt cho 3 sao trở xuống… 1 sao không thể duyệt cho ai.</span>
      </div>
      <form className="admin-form" onSubmit={submit}>
        <div className="form-heading">
          <strong>{editing ? `Sửa: ${editing.name}` : 'Thêm chức vụ'}</strong>
          {editing && (
            <button type="button" className="text-button" onClick={() => { setEditing(null); setForm({ name: '', code: '', level: 3 }); }}>
              Hủy
            </button>
          )}
        </div>
        <label>
          Tên chức vụ
          <input required maxLength="120" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </label>
        <label>
          Mã
          <input required maxLength="32" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
        </label>
        <label>
          Cấp bậc (1–5 sao)
          <select value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: Number(e.target.value) }))}>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} sao {n === 5 ? '(cao nhất)' : n === 1 ? '(thấp nhất)' : ''}
              </option>
            ))}
          </select>
          <StarRating level={form.level} />
        </label>
        <button className="primary-button" disabled={Boolean(pending)}>
          {editing ? 'Lưu chức vụ' : '+ Thêm chức vụ'}
        </button>
      </form>
      <div className="card-list">
        {positions.map((item) => (
          <article className="mgmt-card" key={item._id}>
            <div className="mgmt-card-head">
              <div>
                <strong>{item.name}</strong>
                <span className="code-tag">{item.code}</span>
                <div className="star-row">
                  <StarRating level={item.level} />
                  <span className="muted">Cấp {item.level}/5</span>
                </div>
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(item);
                    setForm({ name: item.name, code: item.code, level: item.level });
                  }}
                  disabled={Boolean(pending)}
                >
                  Sửa
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    if (window.confirm(`Xóa chức vụ ${item.name}? User mang chức vụ này sẽ được gỡ gán.`)) {
                      void run(`del-${item._id}`, () => remove({ id: item._id }), 'Đã xóa chức vụ.');
                    }
                  }}
                  disabled={Boolean(pending)}
                >
                  Xóa
                </button>
                <button type="button" onClick={() => setExpanded(expanded === item._id ? null : item._id)}>
                  {expanded === item._id ? 'Ẩn user' : 'Thêm user'}
                </button>
              </div>
            </div>
            {expanded === item._id && (
              <AssignUserPanel
                users={users}
                filterId={item._id}
                idField="positionId"
                label="chức vụ"
                pending={pending}
                onAssign={(userId) => run('assign', () => assignUser({ positionId: item._id, userId }), 'Đã gán user vào chức vụ.')}
                onUnassign={(userId) => run('unassign', () => unassignUser({ userId }), 'Đã gỡ user khỏi chức vụ.')}
              />
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function ProfileView({ session }) {
  const changeOwnPassword = useAction(anyApi.users.changeOwnPassword);
  const { user, department, permissionGroup, position, isOperationalManager } = session;
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setFeedback('');
    if (password.length < 8) return setFeedback('Mật khẩu mới phải có ít nhất 8 ký tự.');
    if (password !== confirmation) return setFeedback('Xác nhận mật khẩu không khớp.');
    setPending(true);
    try {
      await changeOwnPassword({ newPassword: password });
      setFeedback('Đã đổi mật khẩu thành công.');
      setPassword('');
      setConfirmation('');
    } catch (error) {
      setFeedback(messageFor(error));
    } finally {
      setPending(false);
    }
  };

  const displayName = user.name || user.email || 'Chưa đặt tên';
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join('');
  const roleLabel = ROLE_LABELS[user.role] || user.role;
  const feedbackType = feedback === 'Đã đổi mật khẩu thành công.' ? 'success' : 'error';

  return (
    <section className="work-user-view profile-workspace">
      <header className="work-hero profile-hero">
        <div>
          <span className="work-kicker">Không gian · Cá nhân</span>
          <h2>Hồ sơ của {displayName}</h2>
          <p>Thông tin định danh, vai trò và bảo mật tài khoản trong một không gian riêng tư, rõ ràng.</p>
        </div>
        <div className="work-hero-stamp profile-hero-stamp">
          <strong>{initials || 'LV'}</strong>
          <span>{roleLabel}</span>
        </div>
      </header>

      <div className="profile-modern-grid">
        <article className="profile-paper profile-overview">
          <header className="profile-identity">
            <span className="profile-avatar" aria-hidden="true">{initials || 'LV'}</span>
            <div>
              <span className="profile-eyebrow">HỒ SƠ NỘI BỘ</span>
              <h3>{displayName}</h3>
              <p>{user.email || 'Chưa có email đăng nhập'}</p>
            </div>
            <span className={`profile-role profile-role-${user.role}`}>{roleLabel}</span>
          </header>

          <dl className="profile-modern-dl">
            <div>
              <dt><i>01</i> Họ tên</dt>
              <dd>{displayName}</dd>
            </div>
            <div>
              <dt><i>02</i> Email đăng nhập</dt>
              <dd>{user.email || '—'}</dd>
            </div>
            <div>
              <dt><i>03</i> Vai trò</dt>
              <dd>{roleLabel}</dd>
            </div>
            <div>
              <dt><i>04</i> Phòng ban</dt>
              <dd>{department?.name || 'Chưa gán'}</dd>
            </div>
            <div>
              <dt><i>05</i> Chức vụ</dt>
              <dd>
                {position ? (
                  <span className="profile-position">
                    {position.name}
                    <StarRating level={position.level} />
                  </span>
                ) : (
                  'Chưa gán'
                )}
              </dd>
            </div>
            {!isOperationalManager && (
              <div>
                <dt><i>06</i> Nhóm quyền</dt>
                <dd>{permissionGroup?.name || 'Chưa gán'}</dd>
              </div>
            )}
          </dl>

          <footer className="profile-help">
            <span aria-hidden="true">?</span>
            <p><strong>Cần hỗ trợ tài khoản?</strong> Liên hệ Administrator để được đặt lại mật khẩu an toàn.</p>
          </footer>
        </article>

        <form className="profile-paper profile-security" onSubmit={submit}>
          <header className="profile-panel-heading">
            <span className="profile-shield" aria-hidden="true">✓</span>
            <div>
              <span className="profile-eyebrow">BẢO MẬT TÀI KHOẢN</span>
              <h3>Đổi mật khẩu</h3>
              <p>Sử dụng ít nhất 8 ký tự và không chia sẻ mật khẩu qua kênh công khai.</p>
            </div>
          </header>

          <label className="profile-field">
            <span>Mật khẩu mới</span>
            <input required minLength="8" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="profile-field">
            <span>Xác nhận mật khẩu</span>
            <input required minLength="8" type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
          </label>

          <div className="profile-password-hint">
            <span className={password.length >= 8 ? 'is-ready' : ''} />
            <p>{password.length >= 8 ? 'Độ dài mật khẩu đã đạt yêu cầu.' : 'Mật khẩu cần có tối thiểu 8 ký tự.'}</p>
          </div>

          {feedback ? (
            <p className={`profile-feedback ${feedbackType}`} role="status" aria-live="polite">
              {feedback}
            </p>
          ) : null}

          <button className="work-primary-button profile-submit" disabled={pending}>
            {pending ? 'Đang cập nhật…' : 'Đổi mật khẩu'}
          </button>
        </form>
      </div>
    </section>
  );
}

function MustChangePasswordView() {
  const changeOwnPassword = useAction(anyApi.users.changeOwnPassword);
  const { signOut } = useAuthActions();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    setFeedback('');
    if (password.length < 8) return setFeedback('Mật khẩu mới phải có ít nhất 8 ký tự.');
    if (password !== confirmation) return setFeedback('Xác nhận mật khẩu không khớp.');
    setPending(true);
    try {
      await changeOwnPassword({ newPassword: password });
      setFeedback('Đã đổi mật khẩu. Đang mở không gian làm việc…');
      setPassword('');
      setConfirmation('');
    } catch (error) {
      setFeedback(messageFor(error));
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="placeholder-view">
      <span className="placeholder-icon">!</span>
      <span className="status-pill blue">Bảo mật tài khoản</span>
      <h2>Đổi mật khẩu trước khi tiếp tục</h2>
      <p>Đây là lần đăng nhập đầu tiên hoặc mật khẩu vừa được quản trị viên đặt lại. Đổi mật khẩu của chính bạn để vào ứng dụng.</p>
      <form className="password-form" onSubmit={submit}>
        <label>
          Mật khẩu mới
          <input required minLength="8" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>
          Xác nhận mật khẩu
          <input required minLength="8" type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
        </label>
        <p className="form-message" role="status" aria-live="polite">
          {feedback}
        </p>
        <button className="primary-button" disabled={pending}>
          {pending ? 'Đang cập nhật…' : 'Đổi mật khẩu và tiếp tục'}
        </button>
        <button type="button" className="text-button" onClick={() => void signOut()} disabled={pending}>
          Đăng xuất
        </button>
      </form>
    </section>
  );
}

function PlaceholderView({ title, access, isAdmin }) {
  const accessLabel = isAdmin
    ? 'Quản trị'
    : access === 'edit'
      ? 'Được sửa'
      : access === 'view_all'
        ? 'Xem tối cao'
        : 'Chỉ xem';
  return (
    <section className="placeholder-view">
      <span className="placeholder-icon">⌁</span>
      <span className="status-pill blue">{accessLabel}</span>
      <h2>{title}</h2>
      <p>
        Nội dung nghiệp vụ đang được hoàn thiện.
        {!isAdmin && access === 'view' ? ' Bạn chỉ có quyền xem mục này.' : ''}
        {!isAdmin && access === 'view_all' ? ' Bạn có thể xem dữ liệu của mọi user nhưng không thể chỉnh sửa.' : ''}
        {!isAdmin && access === 'edit' ? ' Bạn có quyền thêm/sửa nội dung khi module sẵn sàng.' : ''}
      </p>
    </section>
  );
}

function AccessDeniedView({ message }) {
  const { signOut } = useAuthActions();
  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">Lê Văn Tám CRM</p>
        <h1>Chưa thể truy cập</h1>
        <p>{message}</p>
        <button type="button" className="text-button" onClick={() => void signOut()}>
          Đăng xuất
        </button>
      </div>
    </main>
  );
}

function SignedOutView() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await signIn('password', { email: email.trim().toLowerCase(), password, flow: 'signIn' });
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <main className="auth-page">
      <div className="auth-card">
        <img src="/assets/logo-thcs-le-van-tam.png" alt="Logo Trường THCS Lê Văn Tám" />
        <p className="eyebrow">Lê Văn Tám CRM</p>
        <h1>Đăng nhập không gian nội bộ</h1>
        <p>Đăng nhập bằng email và mật khẩu do nhà trường cấp. Không có đăng ký công khai. Quên mật khẩu: liên hệ Quản trị viên.</p>
        <form className="password-form sign-in-form" onSubmit={submit}>
          <label>
            Email
            <input required type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Mật khẩu
            <input required type="password" autoComplete="current-password" minLength="8" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <p className="form-message" role="status" aria-live="polite">
            {error}
          </p>
          <button className="primary-button" disabled={pending}>
            {pending ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </main>
  );
}

function MissingKeyView() {
  return (
    <main className="auth-page">
      <div className="auth-card setup-card">
        <img src="/assets/logo-thcs-le-van-tam.png" alt="Logo Trường THCS Lê Văn Tám" />
        <p className="eyebrow">Lê Văn Tám CRM</p>
        <h1>Cần cấu hình hệ thống</h1>
        <p>Hệ thống chưa được cấu hình để xác thực người dùng. Vui lòng liên hệ quản trị viên để được hỗ trợ.</p>
      </div>
    </main>
  );
}

function Root() {
  if (!convex) return <MissingKeyView />;
  return (
    <ConvexAuthProvider client={convex}>
      <AuthLoading>
        <LoadingView label="Đang kiểm tra phiên đăng nhập…" />
      </AuthLoading>
      <Unauthenticated>
        <SignedOutView />
      </Unauthenticated>
      <Authenticated>
        <AuthenticatedApp />
      </Authenticated>
    </ConvexAuthProvider>
  );
}

function LoadingView({ label }) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">Lê Văn Tám CRM</p>
        <h1>{label}</h1>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Root />);
