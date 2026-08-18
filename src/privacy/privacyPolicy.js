export const PRIVACY_POLICY_PATHS = Object.freeze(['/privacy', '/chinh-sach-bao-mat']);
export const PRIVACY_POLICY_CANONICAL_PATH = '/privacy';
export const PRIVACY_CONTACT_EMAIL = 'nnqbao@gmail.com';
export const PRIVACY_ORGANIZATION_VI = 'THCS Lê Văn Tám';
export const PRIVACY_ORGANIZATION_EN = 'Le Van Tam Secondary School (THCS Lê Văn Tám)';
export const PRIVACY_APP_NAME = 'CRM Lê Văn Tám';
export const PRIVACY_EFFECTIVE_DATE_VI = '18 tháng 8 năm 2026';
export const PRIVACY_EFFECTIVE_DATE_EN = '18 August 2026';
export const PRIVACY_SITE_ORIGIN = 'https://lvt.vscgroup.io.vn';

export function isPublicPrivacyPath(pathname) {
  const raw = String(pathname || '/').split(/[?#]/, 1)[0] || '/';
  const normalized = raw === '/' ? '/' : `/${raw.replace(/^\/+|\/+$/g, '')}`;
  return PRIVACY_POLICY_PATHS.includes(normalized);
}
