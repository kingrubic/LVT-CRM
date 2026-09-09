export const DUTY_MENU_PATH = '/cong-tac';

export function dutiesPathname(args = {}) {
  if (args.view === 'shared') return `${DUTY_MENU_PATH}/chung`;
  if (args.view === 'create') return `${DUTY_MENU_PATH}/tao`;
  if (args.view === 'edit' && args.dutyId) {
    return `${DUTY_MENU_PATH}/sua/${encodeURIComponent(args.dutyId)}`;
  }
  return DUTY_MENU_PATH;
}

export function parseDutyPath(pathname) {
  const raw = String(pathname || '/').split(/[?#]/, 1)[0] || '/';
  const normalized = `/${raw.replace(/^\/+|\/+$/g, '')}`;
  if (normalized === DUTY_MENU_PATH) {
    return { view: 'personal', dutyId: undefined, dutyPath: normalized };
  }
  if (normalized === `${DUTY_MENU_PATH}/chung`) {
    return { view: 'shared', dutyId: undefined, dutyPath: normalized };
  }
  if (normalized === `${DUTY_MENU_PATH}/tao`) {
    return { view: 'create', dutyId: undefined, dutyPath: normalized };
  }
  const editMatch = normalized.match(/^\/cong-tac\/sua\/([^/]+)$/);
  if (editMatch) {
    return {
      view: 'edit',
      dutyId: decodeURIComponent(editMatch[1]),
      dutyPath: normalized,
    };
  }
  if (normalized.startsWith(`${DUTY_MENU_PATH}/`)) {
    return { view: 'personal', dutyId: undefined, dutyPath: DUTY_MENU_PATH };
  }
  return null;
}
