/** Pure Excel matrix → import row helpers for server-side duty import. */

export const DUTY_IMPORT_HEADERS = [
  "ten_cong_tac",
  "noi_dung",
  "dia_diem",
  "ngay_bat_dau",
  "gio_bat_dau",
  "ngay_ket_thuc",
  "gio_ket_thuc",
  "ca_ngay",
  "ma_phong_ban",
  "email_tham_gia",
  "thanh_phan_khac",
] as const;

export const DUTY_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const DUTY_IMPORT_MAX_ROWS = 200;
export const DUTY_IMPORT_TTL_MS = 60 * 60 * 1000;
export const DUTY_IMPORT_DEFAULT_START_TIME = "08:00";
export const DUTY_IMPORT_DEFAULT_END_TIME = "17:00";

export type DutySheetRow = {
  rowNumber: number;
} & Record<(typeof DUTY_IMPORT_HEADERS)[number], string>;

export function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value).trim();
  return String(value).trim();
}

function headerKey(value: unknown) {
  return cellText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

export function rowsFromDutyMatrix(matrix: unknown[][]): {
  headersOk: boolean;
  rows: DutySheetRow[];
} {
  if (!Array.isArray(matrix) || matrix.length < 2) {
    return { headersOk: false, rows: [] };
  }
  const headers = (matrix[0] || []).map(headerKey);
  const expected = [...DUTY_IMPORT_HEADERS];
  const exactOk =
    expected.length === headers.length && expected.every((key, i) => headers[i] === key);
  const set = new Set(headers.filter(Boolean));
  const flexibleOk = expected.every((key) => set.has(key));
  if (!exactOk && !flexibleOk) return { headersOk: false, rows: [] };

  const rows: DutySheetRow[] = [];
  for (let r = 1; r < matrix.length; r += 1) {
    const line = (matrix[r] || []) as unknown[];
    if (line.every((cell) => cellText(cell) === "")) continue;
    const obj: Record<string, string | number> = { rowNumber: r + 1 };
    if (exactOk) {
      expected.forEach((key, i) => {
        obj[key] = cellText(line[i]);
      });
    } else {
      headers.forEach((key, i) => {
        if (key) obj[key] = cellText(line[i]);
      });
    }
    const row = { rowNumber: Number(obj.rowNumber) } as DutySheetRow;
    for (const key of expected) {
      row[key] = String(obj[key] || "");
    }
    rows.push(row);
  }
  return { headersOk: true, rows };
}

export function splitCommaList(value: string): string[] {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
