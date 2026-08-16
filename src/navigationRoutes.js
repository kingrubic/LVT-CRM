const MENU_PATHS = Object.freeze({
  reports: '/bao-cao/cong-tac',
  notifications: '/thong-bao',
  duties: '/cong-tac',
  work: '/cong-viec',
  homeroom: '/lop-chu-nhiem',
  'people-review': '/danh-gia-nhan-su',
  profile: '/thong-tin-ca-nhan',
  'duties-management': '/quan-ly-cong-tac',
  boarding: '/quan-ly-ban-tru',
  'work-management': '/quan-ly-cong-viec',
  users: '/thiet-lap-nguoi-dung',
  departments: '/thiet-lap-phong-ban',
  locations: '/thiet-lap-dia-diem',
  roles: '/thiet-lap-nhom-quyen',
  positions: '/thiet-lap-chuc-vu',
  'display-settings': '/thiet-lap-hien-thi',
});

const REPORT_PATHS = Object.freeze({
  duties: '/bao-cao/cong-tac',
  work: '/bao-cao/cong-viec',
  boarding: '/bao-cao/ban-tru',
});

const HIDDEN_MENU_ALIASES = Object.freeze({
  '/quan-ly-cong-tac': { menu: 'duties' },
  '/quan-ly-cong-viec': { menu: 'work' },
  '/quan-ly-ban-tru': { menu: 'reports', reportSection: 'duties' },
  '/bao-cao/ban-tru': { menu: 'reports', reportSection: 'duties' },
  '/thiet-lap-dia-diem': { menu: 'departments' },
});

/** @type {Map<string, { menu: string, reportSection?: string }>} */
const PATH_ROUTES = new Map(
  Object.entries(MENU_PATHS).map(([menu, pathname]) => [pathname, { menu }]),
);
for (const [reportSection, pathname] of Object.entries(REPORT_PATHS)) {
  PATH_ROUTES.set(pathname, { menu: 'reports', reportSection });
}

function normalizePathname(pathname) {
  const raw = String(pathname || '/').split(/[?#]/, 1)[0] || '/';
  if (raw === '/') return '/';
  return `/${raw.replace(/^\/+|\/+$/g, '')}`;
}

export function routeForPathname(pathname) {
  const normalized = normalizePathname(pathname);
  const alias = HIDDEN_MENU_ALIASES[normalized];
  if (alias) return { menu: alias.menu, reportSection: alias.reportSection };
  const route = PATH_ROUTES.get(normalized);
  return route ? { menu: route.menu, reportSection: route.reportSection } : null;
}

export function pathnameForMenu(menu, reportSection = 'duties') {
  if (menu === 'reports') return REPORT_PATHS[reportSection] || REPORT_PATHS.duties;
  return MENU_PATHS[menu] || '/';
}

export function pathnameForReportSection(reportSection) {
  return REPORT_PATHS[reportSection] || REPORT_PATHS.duties;
}

export { MENU_PATHS, REPORT_PATHS, HIDDEN_MENU_ALIASES };
