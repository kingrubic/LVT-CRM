/** Pure Excel matrix → import row helpers for server-side user import. */

export const USER_IMPORT_HEADERS = [
  "ho_ten",
  "email",
  "ma_phong_ban",
  "ma_chuc_vu",
  "ma_nhom_quyen",
  "mat_khau_tam_thoi",
] as const;

function cellText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value).trim();
  return String(value).trim();
}

function headerKey(value: unknown) {
  return cellText(value)
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export type ParsedImportRow = {
  rowNumber: number;
  ho_ten: string;
  email: string;
  ma_phong_ban: string;
  ma_chuc_vu: string;
  ma_nhom_quyen: string;
  mat_khau_tam_thoi: string;
};

export function rowsFromSheetMatrix(matrix: unknown[][]): {
  headersOk: boolean;
  rows: ParsedImportRow[];
} {
  if (!Array.isArray(matrix) || matrix.length < 2) {
    return { headersOk: false, rows: [] };
  }
  const headers = (matrix[0] || []).map(headerKey);
  const expected = [...USER_IMPORT_HEADERS];
  const exactOk =
    expected.length === headers.length && expected.every((key, i) => headers[i] === key);
  const set = new Set(headers.filter(Boolean));
  const flexibleOk = expected.every((key) => set.has(key));
  if (!exactOk && !flexibleOk) return { headersOk: false, rows: [] };

  const rows: ParsedImportRow[] = [];
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
    rows.push({
      rowNumber: Number(obj.rowNumber),
      ho_ten: String(obj.ho_ten || ""),
      email: String(obj.email || ""),
      ma_phong_ban: String(obj.ma_phong_ban || ""),
      ma_chuc_vu: String(obj.ma_chuc_vu || ""),
      ma_nhom_quyen: String(obj.ma_nhom_quyen || ""),
      mat_khau_tam_thoi: String(obj.mat_khau_tam_thoi || ""),
    });
  }
  return { headersOk: true, rows };
}
