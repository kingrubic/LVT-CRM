import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ClerkProvider,
  SignIn,
  UserButton,
  useAuth,
  useUser,
} from '@clerk/react';
import { useAction, useMutation, useQuery, ConvexReactClient } from 'convex/react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { anyApi } from 'convex/server';
import './styles.css';

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const convexUrl = import.meta.env.VITE_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

const demoItems = [
  ['dashboard', 'Tổng quan', '▦'],
  ['schedule', 'Lịch công tác', '▣'],
  ['tasks', 'Công việc của tôi', '✓'],
  ['classes', 'Lớp chủ nhiệm', '▤'],
];

const adminItems = [
  ['reports', 'Báo cáo'],
  ['duties', 'Công tác'],
  ['work', 'Công việc'],
  ['homeroom', 'Lớp chủ nhiệm'],
  ['people-review', 'Đánh giá nhân sự'],
  ['settings', 'Cài đặt'],
];

const settingsItems = [
  ['users', 'Quản lý người dùng'],
  ['departments', 'Quản lý Phòng ban'],
  ['roles', 'Quản lý nhóm quyền'],
];

function AuthenticatedApp() {
  const { user } = useUser();
  const current = useQuery(anyApi.users.current);
  const storeCurrent = useMutation(anyApi.users.storeCurrent);
  useEffect(() => { if (user && current === null) storeCurrent().catch(() => undefined); }, [user, current, storeCurrent]);
  if (current === undefined) return <LoadingView label="Đang đồng bộ hồ sơ…" />;
  const role = current?.role === 'admin' ? 'admin' : 'demo';
  return <AppShell user={user} role={role} current={current} />;
}

function AppShell({ user, role, current }) {
  const [active, setActive] = useState('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);

  const title = useMemo(() => {
    const all = [...demoItems, ...adminItems, ...settingsItems];
    return all.find(([id]) => id === active)?.[1] || 'Tổng quan';
  }, [active]);

  const choose = (id) => {
    setActive(id);
    setMobileOpen(false);
  };

  return (
    <div className="shell">
      <aside className={`shell-sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <div className="school-brand">
          <img src="/assets/logo-thcs-le-van-tam.png" alt="Logo Trường THCS Lê Văn Tám" />
          <div><strong>Trường THCS<br />Lê Văn Tám</strong><span>CRM nội bộ</span></div>
        </div>
        <nav className="shell-nav" aria-label="Điều hướng CRM">
          <p className="nav-label">Không gian làm việc</p>
          {demoItems.map(([id, label, icon]) => <NavButton key={id} id={id} label={label} icon={icon} active={active} onClick={choose} />)}
          {role === 'admin' && <>
            <p className="nav-label admin-label">Quản trị hệ thống</p>
            {adminItems.map(([id, label]) => <NavButton key={id} id={id} label={label} active={active} onClick={choose} />)}
            <p className="nav-label admin-label">Cài đặt</p>
            {settingsItems.map(([id, label]) => <NavButton key={id} id={id} label={label} active={active} onClick={choose} nested />)}
          </>}
        </nav>
        <div className="sidebar-note"><b>{role === 'admin' ? 'Vai trò quản trị' : 'Không gian demo'}</b><span>{role === 'admin' ? 'Bạn đang xem các menu dành cho quản trị viên.' : 'Menu quản trị sẽ xuất hiện theo role từ Clerk.'}</span></div>
      </aside>
      <main className="shell-main">
        <header className="shell-header">
          <button className="mobile-menu" onClick={() => setMobileOpen((open) => !open)} aria-label="Mở menu">☰</button>
          <div><p className="eyebrow">Lê Văn Tám CRM</p><h1>{title}</h1></div>
          <div className="header-user"><span className="user-greeting">{user?.firstName || 'Người dùng'}</span><UserButton /></div>
        </header>
        {current?.mustChangePassword ? <MustChangePasswordView /> : active === 'dashboard' ? <DemoView /> : active === 'users' ? <UserManagement /> : <PlaceholderView title={title} role={role} />}
      </main>
    </div>
  );
}

function NavButton({ id, label, icon = '→', active, onClick, nested }) {
  return <button className={`shell-nav-button ${active === id ? 'active' : ''} ${nested ? 'nested' : ''}`} onClick={() => onClick(id)}><span className="nav-icon">{icon}</span><span>{label}</span>{id === 'users' && <em>Mới</em>}</button>;
}

function DemoView() {
  return <section className="demo-view">
    <div className="demo-banner"><div><span className="status-pill">Đã xác thực</span><h2>Chào mừng trở lại không gian làm việc.</h2><p>Prototype hiện tại được giữ nguyên trong vùng đã đăng nhập để đội ngũ tiếp tục duyệt luồng nghiệp vụ.</p></div><span className="banner-mark">LVT</span></div>
    <div className="demo-frame-wrap"><div className="frame-caption"><span>Demo giao diện CRM</span><span>Authenticated view · static prototype</span></div><iframe title="LVT CRM demo" src="/demo/index.html" /></div>
  </section>;
}

function UserManagement() {
  const users = useQuery(anyApi.users.list);
  const create = useAction(anyApi.users.create);
  const setDisabled = useAction(anyApi.users.setDisabled);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const addUser = async () => { if (!username || !name || temporaryPassword.length < 12) return; await create({ username, email: email || undefined, name, role: 'user', temporaryPassword }); setUsername(''); setEmail(''); setName(''); setTemporaryPassword(''); };
  return <section className="admin-view"><div className="section-intro"><div><span className="status-pill blue">Quản trị người dùng</span><h2>Quản lý người dùng</h2><p>Admin tạo tài khoản nội bộ bằng username và mật khẩu tạm thời; hệ thống không tự đăng ký và không gửi mật khẩu qua email.</p></div></div><div className="notice"><strong>Thêm tài khoản</strong><span className="invite-form"><input aria-label="Username" placeholder="Username" value={username} onChange={(event) => setUsername(event.target.value)} /><input aria-label="Họ tên" placeholder="Họ tên" value={name} onChange={(event) => setName(event.target.value)} /><input aria-label="Email tùy chọn" type="email" placeholder="Email tùy chọn" value={email} onChange={(event) => setEmail(event.target.value)} /><input aria-label="Mật khẩu tạm thời" type="password" placeholder="Mật khẩu tạm thời (12+ ký tự)" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} /><button className="primary-button" onClick={addUser}>+ Tạo tài khoản</button></span></div><div className="user-table"><div className="user-table-head"><span>Người dùng</span><span>Vai trò</span><span>Trạng thái</span></div>{(users ?? []).map((item) => <div className="user-row" key={item._id}><div><strong>{item.name}</strong><span>{item.username}{item.email ? ` · ${item.email}` : ''}</span></div><span className="role-tag">{item.role}</span><button className={item.status === 'active' ? 'live-tag' : 'pending-tag'} onClick={() => setDisabled({ id: item._id, disabled: item.status === 'active' })}>{item.status === 'active' ? 'Hoạt động · khóa' : item.status}</button></div>)}</div></section>;
}

function MustChangePasswordView() { return <section className="placeholder-view"><span className="placeholder-icon">!</span><span className="status-pill blue">Bảo mật tài khoản</span><h2>Cần đổi mật khẩu</h2><p>Quản trị viên đã yêu cầu bạn đổi mật khẩu. Hãy dùng luồng đổi mật khẩu của Clerk từ menu tài khoản trước khi tiếp tục.</p><div className="placeholder-grid"><span>Mở menu tài khoản ở góc phải</span><span>Chọn đổi mật khẩu</span><span>Đăng nhập lại nếu được yêu cầu</span></div></section>; }

function PlaceholderView({ title, role }) {
  return <section className="placeholder-view"><span className="placeholder-icon">⌁</span><span className="status-pill blue">Admin scaffold</span><h2>{title}</h2><p>Không gian <b>{title}</b> đã có trong điều hướng role-based. Nội dung nghiệp vụ sẽ được bổ sung sau khi chốt schema và quyền backend.</p><div className="placeholder-grid"><span>Frontend route: sẵn sàng</span><span>Backend data: chưa nối</span><span>Role hiện tại: {role}</span></div></section>;
}

function SignedOutView() {
  return <main className="auth-page"><div className="auth-card"><img src="/assets/logo-thcs-le-van-tam.png" alt="Logo Trường THCS Lê Văn Tám" /><p className="eyebrow">Lê Văn Tám CRM</p><h1>Đăng nhập không gian nội bộ</h1><p>Đăng nhập bằng tài khoản trường để mở dashboard và các chức năng theo vai trò.</p><SignIn routing="hash" fallbackRedirectUrl="/" /></div></main>;
}

function MissingKeyView() {
  return <main className="auth-page"><div className="auth-card setup-card"><img src="/assets/logo-thcs-le-van-tam.png" alt="Logo Trường THCS Lê Văn Tám" /><p className="eyebrow">Lê Văn Tám CRM</p><h1>Đã sẵn sàng kết nối Clerk</h1><p>Frontend auth scaffold đã được cài. Thêm <code>VITE_CLERK_PUBLISHABLE_KEY</code> vào file <code>.env.local</code> (không commit file này) để bật màn hình đăng nhập.</p><div className="setup-list"><span>✓ Vite + React shell</span><span>✓ Signed-in / signed-out boundaries</span><span>✓ Role đọc từ <code>publicMetadata.role</code></span></div></div></main>;
}

function Root() {
  if (!clerkKey || clerkKey.includes('replace_me')) return <MissingKeyView />;
  if (!convex) return <MissingKeyView />;
  return <ClerkProvider publishableKey={clerkKey}><ConvexProviderWithClerk client={convex} useAuth={useAuth}><AuthBoundary /></ConvexProviderWithClerk></ClerkProvider>;
}

function AuthBoundary() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <main className="auth-page"><div className="auth-card"><p className="eyebrow">Lê Văn Tám CRM</p><h1>Đang kiểm tra phiên đăng nhập…</h1></div></main>;
  return isSignedIn ? <AuthenticatedApp /> : <SignedOutView />;
}

function LoadingView({ label }) { return <main className="auth-page"><div className="auth-card"><p className="eyebrow">Lê Văn Tám CRM</p><h1>{label}</h1></div></main>; }

createRoot(document.getElementById('root')).render(<Root />);
