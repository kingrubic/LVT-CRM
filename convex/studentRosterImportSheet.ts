export const ROSTER_IMPORT_HEADERS = [
  "ma_hoc_sinh",
  "ho_ten",
  "ngay_sinh",
  "gioi_tinh",
  "so_thu_tu",
  "dien_thoai_hoc_sinh",
  "ho_ten_cha",
  "dien_thoai_cha",
  "ho_ten_me",
  "dien_thoai_me",
  "ho_ten_nguoi_giam_ho",
  "dien_thoai_nguoi_giam_ho",
  "dien_uu_tien",
  "dan_toc",
  "hoan_canh_kho_khan",
  "ghi_chu",
] as const;

export const ROSTER_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const ROSTER_IMPORT_MAX_ROWS = 200;
export const ROSTER_IMPORT_TTL_MS = 60 * 60 * 1000;

export type RosterSheetRow = {
  rowNumber: number;
} & Record<(typeof ROSTER_IMPORT_HEADERS)[number], string>;

export function cellTextPreserve(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  return String(value).trim();
}

function headerKey(value: unknown) {
  return cellTextPreserve(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

export function rowsFromRosterMatrix(matrix: unknown[][]): {
  headersOk: boolean;
  rows: RosterSheetRow[];
} {
  if (!Array.isArray(matrix) || matrix.length < 2) return { headersOk: false, rows: [] };
  const headers = (matrix[0] || []).map(headerKey);
  const expected = [...ROSTER_IMPORT_HEADERS];
  const set = new Set(headers.filter(Boolean));
  const headersOk = expected.every((key) => set.has(key));
  if (!headersOk) return { headersOk: false, rows: [] };

  const rows: RosterSheetRow[] = [];
  for (let r = 1; r < matrix.length; r += 1) {
    const line = (matrix[r] || []) as unknown[];
    if (line.every((cell) => cellTextPreserve(cell) === "")) continue;
    const obj = { rowNumber: r + 1 } as RosterSheetRow;
    headers.forEach((key, i) => {
      if (expected.includes(key as (typeof ROSTER_IMPORT_HEADERS)[number])) {
        obj[key as (typeof ROSTER_IMPORT_HEADERS)[number]] = cellTextPreserve(line[i]);
      }
    });
    for (const key of expected) {
      if (obj[key] == null) obj[key] = "";
    }
    rows.push(obj);
  }
  return { headersOk: true, rows };
}
