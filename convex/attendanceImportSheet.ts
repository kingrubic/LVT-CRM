import { cellTextPreserve } from "./studentRosterImportSheet.ts";

export const ATTENDANCE_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const ATTENDANCE_IMPORT_MAX_ROWS = 2000;
export const ATTENDANCE_IMPORT_MAX_SHEETS = 10;
export const ATTENDANCE_IMPORT_MAX_HEADER_SCAN = 20;
export const ATTENDANCE_IMPORT_TTL_MS = 60 * 60 * 1000;

export const ATTENDANCE_COLUMN_KEYS = [
  "studentCode",
  "studentName",
  "classCode",
  "observedAt",
  "sourceStatus",
] as const;

export type AttendanceColumnKey = (typeof ATTENDANCE_COLUMN_KEYS)[number];

/** Suggested aliases only — not an approved production camera mapping (IN-017/IN-018). */
export const ATTENDANCE_HEADER_ALIASES: Record<AttendanceColumnKey, string[]> = {
  studentCode: ["ma_hoc_sinh", "student_code", "studentid", "id", "ma"],
  studentName: ["ho_ten", "hoten", "student_name", "name", "ten"],
  classCode: ["lop", "class", "class_code", "ma_lop"],
  observedAt: ["thoi_gian", "time", "observed_at", "gio", "timestamp"],
  sourceStatus: ["trang_thai", "status", "state", "ket_qua"],
};

export type AttendanceInspectResult = {
  sheetNames: string[];
  headerCandidates: { sheetName: string; rowIndex: number; headers: string[] }[];
  suggestedMapping: Partial<Record<AttendanceColumnKey, string>>;
  mappingConfirmed: boolean;
  blockedReason?: string;
};

function headerKey(value: unknown) {
  return cellTextPreserve(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function inspectAttendanceWorkbook(args: {
  sheetNames: string[];
  sheets: Record<string, unknown[][]>;
}): AttendanceInspectResult {
  const sheetNames = args.sheetNames.slice(0, ATTENDANCE_IMPORT_MAX_SHEETS);
  if (!sheetNames.length) {
    return {
      sheetNames: [],
      headerCandidates: [],
      suggestedMapping: {},
      mappingConfirmed: false,
      blockedReason: "CAMERA_WORKBOOK_EMPTY",
    };
  }

  const headerCandidates = [];
  for (const sheetName of sheetNames) {
    const matrix = args.sheets[sheetName] || [];
    const limit = Math.min(matrix.length, ATTENDANCE_IMPORT_MAX_HEADER_SCAN);
    for (let i = 0; i < limit; i += 1) {
      const headers = (matrix[i] || []).map(headerKey).filter(Boolean);
      if (headers.length >= 2) {
        headerCandidates.push({ sheetName, rowIndex: i, headers });
        break;
      }
    }
  }

  const first = headerCandidates[0];
  const suggestedMapping: Partial<Record<AttendanceColumnKey, string>> = {};
  if (first) {
    for (const key of ATTENDANCE_COLUMN_KEYS) {
      const match = first.headers.find((header) => ATTENDANCE_HEADER_ALIASES[key].includes(header));
      if (match) suggestedMapping[key] = match;
    }
  }

  const ambiguous = !suggestedMapping.studentCode && !suggestedMapping.studentName;
  return {
    sheetNames,
    headerCandidates,
    suggestedMapping,
    mappingConfirmed: false,
    blockedReason: ambiguous ? "CAMERA_MAPPING_AMBIGUOUS" : undefined,
  };
}

export function rowsFromMappedAttendanceMatrix(
  matrix: unknown[][],
  args: { headerRowIndex: number; mapping: Partial<Record<AttendanceColumnKey, string>> },
) {
  const headerLine = (matrix[args.headerRowIndex] || []).map(headerKey);
  const indexFor = (key: AttendanceColumnKey) => {
    const wanted = args.mapping[key];
    if (!wanted) return -1;
    return headerLine.findIndex((header) => header === headerKey(wanted));
  };
  const rows = [];
  for (let r = args.headerRowIndex + 1; r < matrix.length; r += 1) {
    const line = matrix[r] || [];
    if (line.every((cell) => cellTextPreserve(cell) === "")) continue;
    rows.push({
      rowNumber: r + 1,
      rawStudentCode: indexFor("studentCode") >= 0 ? cellTextPreserve(line[indexFor("studentCode")]) : "",
      rawStudentName: indexFor("studentName") >= 0 ? cellTextPreserve(line[indexFor("studentName")]) : "",
      rawClassCode: indexFor("classCode") >= 0 ? cellTextPreserve(line[indexFor("classCode")]) : "",
      rawObservedAt: indexFor("observedAt") >= 0 ? cellTextPreserve(line[indexFor("observedAt")]) : "",
      rawStatus: indexFor("sourceStatus") >= 0 ? cellTextPreserve(line[indexFor("sourceStatus")]) : "",
    });
    if (rows.length > ATTENDANCE_IMPORT_MAX_ROWS) break;
  }
  return rows;
}
