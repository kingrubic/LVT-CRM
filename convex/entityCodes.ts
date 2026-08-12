/** Convex-side entity code helpers (mirrors src/lib/entityCodes.js). */

export const ENTITY_CODE_MAX_LENGTH = 20;
export const ENTITY_CODE_PATTERN = /^[A-Z0-9_-]+$/;

export function stripDiacritics(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

export function normalizeEntityCode(raw: string | undefined | null): string {
  return stripDiacritics(String(raw || ""))
    .trim()
    .toUpperCase();
}

export function isValidEntityCode(code: string | undefined | null): boolean {
  const normalized = normalizeEntityCode(code);
  return Boolean(normalized) && normalized.length <= ENTITY_CODE_MAX_LENGTH && ENTITY_CODE_PATTERN.test(normalized);
}

export function assertEntityCode(raw: string): string {
  const code = normalizeEntityCode(raw);
  if (!isValidEntityCode(code)) {
    throw new Error("INVALID_CODE");
  }
  return code;
}

function isCodeTaken(code: string, usedCodes: Set<string>): boolean {
  return usedCodes.has(normalizeEntityCode(code));
}

export function generateCodeFromName(name: string, usedCodes: Iterable<string> = []): string {
  const used = new Set(
    [...usedCodes].map((c) => normalizeEntityCode(c)).filter(Boolean),
  );
  const take = (candidate: string): string | null => {
    const code = normalizeEntityCode(candidate).replace(/[^A-Z0-9_-]/g, "");
    if (!code) return null;
    const clipped = code.slice(0, ENTITY_CODE_MAX_LENGTH);
    if (!ENTITY_CODE_PATTERN.test(clipped)) return null;
    if (isCodeTaken(clipped, used)) return null;
    return clipped;
  };

  const stripped = stripDiacritics(name).trim();
  const words = stripped.split(/\s+/).filter(Boolean);
  const initials = words.map((word) => word[0] || "").join("");
  const fromInitials = take(initials);
  if (fromInitials) return fromInitials;

  const compact = stripped.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  for (const length of [3, 4]) {
    if (compact.length >= length) {
      const fromSlice = take(compact.slice(0, length));
      if (fromSlice) return fromSlice;
    }
  }

  const baseRaw = (initials || compact || "GRP").toUpperCase().replace(/[^A-Z0-9]/g, "") || "GRP";
  const base = baseRaw.slice(0, Math.max(1, ENTITY_CODE_MAX_LENGTH - 1));
  let n = 2;
  while (n < 10000) {
    const suffix = String(n);
    const candidate = `${base.slice(0, ENTITY_CODE_MAX_LENGTH - suffix.length)}${suffix}`;
    const got = take(candidate);
    if (got) return got;
    n += 1;
  }
  throw new Error("CODE_GENERATION_FAILED");
}

export function listInvalidActiveCodes(
  entities: { _id?: string; name?: string; code?: string; active?: boolean }[],
  label: string,
) {
  return (entities || [])
    .filter((item) => item.active !== false)
    .filter((item) => !isValidEntityCode(item.code))
    .map((item) => ({
      label,
      name: item.name || "(không tên)",
      code: item.code || "(thiếu mã)",
      id: item._id,
    }));
}

/** Active catalog rows that share a normalized code (legacy/corrupt data). */
export function listDuplicateActiveCodes(
  entities: { _id?: string; name?: string; code?: string; active?: boolean }[],
  label: string,
) {
  const seen = new Map<string, { name: string; code: string }>();
  const duplicates: { label: string; name: string; code: string; id?: string }[] = [];
  for (const item of entities || []) {
    if (item.active === false || !item.code) continue;
    const code = normalizeEntityCode(item.code);
    if (!code) continue;
    const previous = seen.get(code);
    if (previous) {
      duplicates.push({
        label,
        name: item.name || "(không tên)",
        code,
        id: item._id,
      });
    } else {
      seen.set(code, { name: item.name || "", code });
    }
  }
  return duplicates;
}
