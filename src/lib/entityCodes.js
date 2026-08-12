/** Shared entity-code helpers for departments, positions, and permission groups. */

export const ENTITY_CODE_MAX_LENGTH = 20;
export const ENTITY_CODE_PATTERN = /^[A-Z0-9_-]+$/;

export function stripDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/** Normalize user/admin input to uppercase storage form. Empty string if invalid after trim. */
export function normalizeEntityCode(raw) {
  return stripDiacritics(String(raw || ''))
    .trim()
    .toUpperCase();
}

export function isValidEntityCode(code) {
  const normalized = normalizeEntityCode(code);
  return Boolean(normalized) && normalized.length <= ENTITY_CODE_MAX_LENGTH && ENTITY_CODE_PATTERN.test(normalized);
}

export function assertEntityCode(raw) {
  const code = normalizeEntityCode(raw);
  if (!isValidEntityCode(code)) {
    throw new Error('INVALID_CODE');
  }
  return code;
}

function isCodeTaken(code, usedCodes) {
  return usedCodes.has(normalizeEntityCode(code));
}

/**
 * Generate a unique code for a legacy permission group name.
 * 1) Initials of words (Giáo viên chủ nhiệm → GVCN)
 * 2) First 3 compact chars, then 4
 * 3) Append numeric suffix
 */
export function generateCodeFromName(name, usedCodes = new Set()) {
  const used = new Set([...usedCodes].map((c) => normalizeEntityCode(c)).filter(Boolean));
  const take = (candidate) => {
    const code = normalizeEntityCode(candidate).replace(/[^A-Z0-9_-]/g, '');
    if (!code) return null;
    const clipped = code.slice(0, ENTITY_CODE_MAX_LENGTH);
    if (!ENTITY_CODE_PATTERN.test(clipped)) return null;
    if (isCodeTaken(clipped, used)) return null;
    return clipped;
  };

  const stripped = stripDiacritics(name).trim();
  const words = stripped.split(/\s+/).filter(Boolean);
  const initials = words.map((word) => word[0] || '').join('');
  const fromInitials = take(initials);
  if (fromInitials) return fromInitials;

  const compact = stripped.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  for (const length of [3, 4]) {
    if (compact.length >= length) {
      const fromSlice = take(compact.slice(0, length));
      if (fromSlice) return fromSlice;
    }
  }

  const baseRaw = (initials || compact || 'GRP').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'GRP';
  const base = baseRaw.slice(0, Math.max(1, ENTITY_CODE_MAX_LENGTH - 1));
  let n = 2;
  while (n < 10000) {
    const suffix = String(n);
    const candidate = `${base.slice(0, ENTITY_CODE_MAX_LENGTH - suffix.length)}${suffix}`;
    const got = take(candidate);
    if (got) return got;
    n += 1;
  }
  throw new Error('CODE_GENERATION_FAILED');
}

export function describeInvalidEntityCodes(entities, label) {
  return (entities || [])
    .filter((item) => item.active !== false)
    .filter((item) => !isValidEntityCode(item.code))
    .map((item) => ({
      label,
      name: item.name || '(không tên)',
      code: item.code || '(thiếu mã)',
      id: item._id,
    }));
}

/** Active catalog rows that share a normalized code (legacy/corrupt data). */
export function describeDuplicateActiveCodes(entities, label) {
  const seen = new Map();
  const duplicates = [];
  for (const item of entities || []) {
    if (item.active === false || !item.code) continue;
    const code = normalizeEntityCode(item.code);
    if (!code) continue;
    if (seen.has(code)) {
      duplicates.push({
        label,
        name: item.name || '(không tên)',
        code,
        id: item._id,
      });
    } else {
      seen.set(code, true);
    }
  }
  return duplicates;
}
