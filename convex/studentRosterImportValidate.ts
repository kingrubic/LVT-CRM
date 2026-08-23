import { parseFlexibleSchoolDate } from "./homeroomTime.ts";
import { ROSTER_IMPORT_HEADERS, ROSTER_IMPORT_MAX_ROWS, type RosterSheetRow } from "./studentRosterImportSheet.ts";

export const ROSTER_IMPORT_MODE_CREATE = "create";
export const ROSTER_IMPORT_MODE_MERGE = "merge";

export type RosterImportIssue = {
  rowNumber: number;
  field: string;
  column: string;
  rejectedValue: string | null;
  code: string;
  message: string;
  severity: "error" | "warning";
};

const GENDERS = new Set(["female", "male", "other", "unknown", "nu", "nam"]);

const GENDER_MAP: Record<string, "female" | "male" | "other" | "unknown"> = {
  female: "female",
  male: "male",
  other: "other",
  unknown: "unknown",
  nu: "female",
  "nữ": "female",
  nam: "male",
};

export const ROSTER_ERROR_MESSAGES: Record<string, string> = {
  STUDENT_CODE_REQUIRED: "Mã học sinh bắt buộc. Hãy điền cột ma_hoc_sinh.",
  STUDENT_CODE_DUPLICATE_FILE: "Mã học sinh bị trùng trong file. Mỗi mã chỉ được xuất hiện một lần.",
  STUDENT_CODE_EXISTS: "Mã học sinh đã tồn tại. Chế độ tạo mới không ghi đè; hãy dùng chế độ cập nhật hoặc sửa mã.",
  FULL_NAME_REQUIRED: "Họ tên học sinh bắt buộc.",
  INVALID_DATE_OF_BIRTH: "Ngày sinh không hợp lệ. Dùng YYYY-MM-DD hoặc dd/mm/yyyy.",
  INVALID_GENDER: "Giới tính không hợp lệ. Dùng nữ/nam/khác/không rõ — không suy từ họ tên.",
  INVALID_ROSTER_NUMBER: "Số thứ tự phải là số nguyên dương.",
  INVALID_PHONE: "Số điện thoại không hợp lệ. Giữ nguyên số 0 đầu nếu có.",
  TOO_MANY_ROWS: `File vượt quá ${ROSTER_IMPORT_MAX_ROWS} dòng. Hãy tách theo lớp.`,
  EMPTY_FILE: "File không có dòng dữ liệu.",
  STUDENT_ENROLLED_OTHER_CLASS: "Học sinh đang học lớp khác. Không nhập chéo lớp trong chế độ cập nhật.",
  ENROLLMENT_YEAR_MISMATCH: "Năm học của học sinh không khớp lớp đang nhập.",
};

function normalizeStudentCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "");
}

function isSafeRejectedValue(value: string) {
  return value.length <= 80 && !/password|secret|token/i.test(value);
}

function pushIssue(
  issues: RosterImportIssue[],
  args: Omit<RosterImportIssue, "message"> & { message?: string },
) {
  issues.push({
    ...args,
    rejectedValue: args.rejectedValue && isSafeRejectedValue(args.rejectedValue) ? args.rejectedValue : null,
    message: args.message || ROSTER_ERROR_MESSAGES[args.code] || args.code,
  });
}

export type ExistingRosterEnrollment = {
  studentCode: string;
  classId: string;
  schoolYearId: string;
  status: string;
};

export function validateRosterImportRows(
  rows: RosterSheetRow[],
  context: {
    mode?: string;
    existingStudentCodes?: string[];
    existingEnrollments?: ExistingRosterEnrollment[];
    targetClassId?: string;
    targetSchoolYearId?: string;
  } = {},
) {
  const issues: RosterImportIssue[] = [];
  const mode = context.mode === ROSTER_IMPORT_MODE_MERGE ? ROSTER_IMPORT_MODE_MERGE : ROSTER_IMPORT_MODE_CREATE;
  const existing = new Set((context.existingStudentCodes || []).map(normalizeStudentCode));
  const seen = new Map<string, number>();

  if (!rows.length) {
    pushIssue(issues, {
      rowNumber: 0,
      field: "file",
      column: "",
      rejectedValue: null,
      code: "EMPTY_FILE",
      severity: "error",
    });
    return { ok: false as const, issues, preview: [] as const, blockers: issues };
  }

  if (rows.length > ROSTER_IMPORT_MAX_ROWS) {
    pushIssue(issues, {
      rowNumber: 0,
      field: "file",
      column: "",
      rejectedValue: String(rows.length),
      code: "TOO_MANY_ROWS",
      severity: "error",
    });
    return { ok: false as const, issues, preview: [] as const, blockers: issues };
  }

  const preview = [];
  for (const row of rows) {
    const studentCode = normalizeStudentCode(row.ma_hoc_sinh || "");
    if (!studentCode) {
      pushIssue(issues, {
        rowNumber: row.rowNumber,
        field: "studentCode",
        column: "ma_hoc_sinh",
        rejectedValue: row.ma_hoc_sinh || "",
        code: "STUDENT_CODE_REQUIRED",
        severity: "error",
      });
    } else if (seen.has(studentCode)) {
      pushIssue(issues, {
        rowNumber: row.rowNumber,
        field: "studentCode",
        column: "ma_hoc_sinh",
        rejectedValue: row.ma_hoc_sinh,
        code: "STUDENT_CODE_DUPLICATE_FILE",
        severity: "error",
      });
    } else {
      seen.set(studentCode, row.rowNumber);
      if (mode === ROSTER_IMPORT_MODE_CREATE && existing.has(studentCode)) {
        pushIssue(issues, {
          rowNumber: row.rowNumber,
          field: "studentCode",
          column: "ma_hoc_sinh",
          rejectedValue: row.ma_hoc_sinh,
          code: "STUDENT_CODE_EXISTS",
          severity: "error",
        });
      } else if (mode === ROSTER_IMPORT_MODE_MERGE && existing.has(studentCode)) {
        const activeEnrollment = (context.existingEnrollments || []).find(
          (item) =>
            normalizeStudentCode(item.studentCode) === studentCode && item.status === "active",
        );
        if (activeEnrollment && context.targetClassId && activeEnrollment.classId !== context.targetClassId) {
          pushIssue(issues, {
            rowNumber: row.rowNumber,
            field: "studentCode",
            column: "ma_hoc_sinh",
            rejectedValue: row.ma_hoc_sinh,
            code: "STUDENT_ENROLLED_OTHER_CLASS",
            severity: "error",
          });
        } else if (
          activeEnrollment &&
          context.targetSchoolYearId &&
          activeEnrollment.schoolYearId !== context.targetSchoolYearId
        ) {
          pushIssue(issues, {
            rowNumber: row.rowNumber,
            field: "studentCode",
            column: "ma_hoc_sinh",
            rejectedValue: row.ma_hoc_sinh,
            code: "ENROLLMENT_YEAR_MISMATCH",
            severity: "error",
          });
        }
      }
    }

    const fullName = (row.ho_ten || "").trim();
    if (!fullName) {
      pushIssue(issues, {
        rowNumber: row.rowNumber,
        field: "fullName",
        column: "ho_ten",
        rejectedValue: row.ho_ten || "",
        code: "FULL_NAME_REQUIRED",
        severity: "error",
      });
    }

    let dateOfBirth: string | undefined;
    if ((row.ngay_sinh || "").trim()) {
      const parsed = parseFlexibleSchoolDate(row.ngay_sinh);
      if (!parsed) {
        pushIssue(issues, {
          rowNumber: row.rowNumber,
          field: "dateOfBirth",
          column: "ngay_sinh",
          rejectedValue: row.ngay_sinh,
          code: "INVALID_DATE_OF_BIRTH",
          severity: "error",
        });
      } else {
        dateOfBirth = parsed;
      }
    }

    let gender: string | undefined;
    if ((row.gioi_tinh || "").trim()) {
      const key = row.gioi_tinh.trim().toLowerCase();
      gender = GENDER_MAP[key];
      if (!gender && !GENDERS.has(key)) {
        pushIssue(issues, {
          rowNumber: row.rowNumber,
          field: "gender",
          column: "gioi_tinh",
          rejectedValue: row.gioi_tinh,
          code: "INVALID_GENDER",
          severity: "error",
        });
      }
    }

    let rosterNumber: number | undefined;
    if ((row.so_thu_tu || "").trim()) {
      const n = Number(row.so_thu_tu);
      if (!Number.isInteger(n) || n < 1) {
        pushIssue(issues, {
          rowNumber: row.rowNumber,
          field: "rosterNumber",
          column: "so_thu_tu",
          rejectedValue: row.so_thu_tu,
          code: "INVALID_ROSTER_NUMBER",
          severity: "error",
        });
      } else {
        rosterNumber = n;
      }
    }

    const phones = [
      ["studentPhone", "dien_thoai_hoc_sinh", row.dien_thoai_hoc_sinh],
      ["fatherPhone", "dien_thoai_cha", row.dien_thoai_cha],
      ["motherPhone", "dien_thoai_me", row.dien_thoai_me],
      ["guardianPhone", "dien_thoai_nguoi_giam_ho", row.dien_thoai_nguoi_giam_ho],
    ] as const;
    const phoneValues: Record<string, string | undefined> = {};
    for (const [field, column, raw] of phones) {
      const text = (raw || "").trim();
      if (!text) continue;
      const digits = normalizePhone(text);
      if (digits.length < 8 || digits.length > 15) {
        pushIssue(issues, {
          rowNumber: row.rowNumber,
          field,
          column,
          rejectedValue: text,
          code: "INVALID_PHONE",
          severity: "error",
        });
      } else {
        phoneValues[field] = text.replace(/[^\d+]/g, "") || text;
      }
    }

    const guardians = [];
    if ((row.ho_ten_cha || "").trim()) {
      guardians.push({
        relationship: "father",
        fullName: row.ho_ten_cha.trim(),
        phone: phoneValues.fatherPhone,
        isPrimaryContact: !row.ho_ten_me && !row.ho_ten_nguoi_giam_ho,
      });
    }
    if ((row.ho_ten_me || "").trim()) {
      guardians.push({
        relationship: "mother",
        fullName: row.ho_ten_me.trim(),
        phone: phoneValues.motherPhone,
        isPrimaryContact: !row.ho_ten_cha && !row.ho_ten_nguoi_giam_ho,
      });
    }
    if ((row.ho_ten_nguoi_giam_ho || "").trim()) {
      guardians.push({
        relationship: "guardian",
        fullName: row.ho_ten_nguoi_giam_ho.trim(),
        phone: phoneValues.guardianPhone,
        isPrimaryContact: !row.ho_ten_cha && !row.ho_ten_me,
      });
    }

    preview.push({
      rowNumber: row.rowNumber,
      studentCode,
      fullName,
      dateOfBirth,
      gender,
      rosterNumber,
      studentPhone: phoneValues.studentPhone,
      priorityCategory: row.dien_uu_tien?.trim() || undefined,
      ethnicity: row.dan_toc?.trim() || undefined,
      hardshipNote: row.hoan_canh_kho_khan?.trim() || undefined,
      notes: row.ghi_chu?.trim() || undefined,
      guardians,
    });
  }

  const blockers = issues.filter((item) => item.severity === "error");
  return {
    ok: blockers.length === 0,
    issues,
    blockers,
    preview: blockers.length ? [] : preview,
    mode,
    columns: [...ROSTER_IMPORT_HEADERS],
  };
}

export function rosterCommitAllowed(result: { blockers: RosterImportIssue[] }) {
  return result.blockers.length === 0;
}

export function assertStoredImportMetadata(
  stored: { size?: number } | null | undefined,
  claimed: { fileSize: number; maxBytes: number },
) {
  if (!stored || typeof stored.size !== "number") throw new Error("INVALID_IMPORT_FILE");
  if (!claimed.fileSize || claimed.fileSize > claimed.maxBytes || stored.size > claimed.maxBytes) {
    throw new Error("IMPORT_FILE_TOO_LARGE");
  }
  if (stored.size !== claimed.fileSize) throw new Error("INVALID_IMPORT_FILE");
}

export function assertRosterUploadMatchesClass(
  upload: { schoolYearId: string; classId: string },
  klass: { schoolYearId: string; _id?: string },
) {
  if (klass._id && String(klass._id) !== String(upload.classId)) throw new Error("CLASS_NOT_FOUND");
  if (klass.schoolYearId !== upload.schoolYearId) throw new Error("ENROLLMENT_YEAR_MISMATCH");
}

export function findMatchingGuardian<T extends { relationship: string; fullName: string; active?: boolean }>(
  existing: T[],
  incoming: { relationship: string; fullName: string },
): T | undefined {
  const name = incoming.fullName.trim().toLowerCase();
  return existing.find(
    (row) =>
      row.active !== false &&
      row.relationship === incoming.relationship &&
      row.fullName.trim().toLowerCase() === name,
  );
}

export function guardiansToInsert<T extends { relationship: string; fullName: string; active?: boolean }>(
  existing: T[],
  incoming: Array<{ relationship: string; fullName: string }>,
) {
  return incoming.filter((row) => !findMatchingGuardian(existing, row));
}
