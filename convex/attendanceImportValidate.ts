import { parseFlexibleSchoolDate, vietnamWallTimeToUtcMs } from "./homeroomTime.ts";

export const PRESENCE_POLICY_POSITIVE = "positive_presence";
export const PRESENCE_POLICY_FULL_ROSTER = "full_roster";
export const REPLACE_MODE_SUPPLEMENT = "supplement";
export const REPLACE_MODE_REPLACE = "replace_camera_observations";
export const REPLACE_MODE_CANCEL = "cancel";

export type CameraRawRow = {
  rowNumber: number;
  rawStudentCode?: string;
  rawStudentName?: string;
  rawClassCode?: string;
  rawObservedAt?: string;
  rawStatus?: string;
};

export type CameraStudent = {
  studentId: string;
  studentCode: string;
  fullName: string;
  classId: string;
  classCode: string;
  enrollmentId: string;
};

export type AttendanceImportIssue = {
  rowNumber: number;
  field: string;
  column: string;
  rejectedValue: string | null;
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type ProposedNameMatch = {
  rowNumber: number;
  sourceName: string;
  studentCode: string;
  fullName: string;
  classCode: string;
};

const STATUS_ALIASES: Record<string, "present" | "late" | "absent" | "unknown"> = {
  present: "present",
  co_mat: "present",
  "có mặt": "present",
  late: "late",
  tre: "late",
  "trễ": "late",
  muon: "late",
  "muộn": "late",
  absent: "absent",
  vang: "absent",
  "vắng": "absent",
  unknown: "unknown",
};

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase("vi").replace(/\s+/g, " ");
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

export function normalizeCameraStatus(value: string | undefined): "present" | "late" | "absent" | "unknown" {
  const key = (value || "").trim().toLowerCase();
  return STATUS_ALIASES[key] || (key ? "unknown" : "present");
}

export function reconcileAttendanceRows(
  rows: CameraRawRow[],
  context: {
    attendanceDate: string;
    classId: string;
    classCode: string;
    students: CameraStudent[];
    presencePolicy?: string;
  },
) {
  const issues: AttendanceImportIssue[] = [];
  const byCode = new Map(context.students.map((row) => [normalizeCode(row.studentCode), row]));
  const byName = new Map<string, CameraStudent[]>();
  for (const student of context.students) {
    const key = `${normalizeName(student.fullName)}::${normalizeCode(student.classCode)}`;
    const list = byName.get(key) || [];
    list.push(student);
    byName.set(key, list);
  }
  const seenStudentIds = new Map<string, number>();
  const normalized = [];
  const nameMatches: ProposedNameMatch[] = [];

  for (const row of rows) {
    const code = normalizeCode(row.rawStudentCode || "");
    const name = (row.rawStudentName || "").trim();
    let matched: CameraStudent | undefined;
    let resolution = "unmatched";

    if (code && byCode.has(code)) {
      matched = byCode.get(code);
      resolution = matched?.classId === context.classId ? "matched" : "wrong_class";
      if (resolution === "wrong_class") {
        issues.push({
          rowNumber: row.rowNumber,
          field: "classCode",
          column: "classCode",
          rejectedValue: row.rawClassCode || matched?.classCode || null,
          code: "CAMERA_WRONG_CLASS",
          message: "Mã học sinh thuộc lớp khác. Không tự động chuyển lớp khi nhập điểm danh.",
          severity: "error",
        });
      }
    } else if (!code && name) {
      const key = `${normalizeName(name)}::${normalizeCode(row.rawClassCode || context.classCode)}`;
      const candidates = byName.get(key) || [];
      if (candidates.length === 1) {
        matched = candidates[0];
        resolution = "matched";
        nameMatches.push({
          rowNumber: row.rowNumber,
          sourceName: name,
          studentCode: matched.studentCode,
          fullName: matched.fullName,
          classCode: matched.classCode,
        });
        issues.push({
          rowNumber: row.rowNumber,
          field: "studentName",
          column: "studentName",
          rejectedValue: name,
          code: "CAMERA_NAME_MATCH_UNCONFIRMED",
          message: "Khớp theo họ tên + lớp. Cần xác nhận, không dùng làm định danh im lặng.",
          severity: "warning",
        });
      } else if (candidates.length > 1) {
        resolution = "ambiguous";
        issues.push({
          rowNumber: row.rowNumber,
          field: "studentName",
          column: "studentName",
          rejectedValue: name,
          code: "CAMERA_NAME_AMBIGUOUS",
          message: "Nhiều học sinh trùng họ tên trong lớp. Không tự động khớp.",
          severity: "error",
        });
      } else {
        issues.push({
          rowNumber: row.rowNumber,
          field: "studentName",
          column: "studentName",
          rejectedValue: name,
          code: "CAMERA_UNMATCHED",
          message: "Không khớp mã hoặc họ tên học sinh đang học lớp này.",
          severity: "error",
        });
      }
    } else {
      issues.push({
        rowNumber: row.rowNumber,
        field: "studentCode",
        column: "studentCode",
        rejectedValue: row.rawStudentCode || null,
        code: "CAMERA_UNMATCHED",
        message: "Không tìm thấy mã học sinh trong danh sách lớp.",
        severity: "error",
      });
    }

    if (matched && seenStudentIds.has(matched.studentId)) {
      resolution = "duplicate";
      issues.push({
        rowNumber: row.rowNumber,
        field: "studentCode",
        column: "studentCode",
        rejectedValue: row.rawStudentCode || row.rawStudentName || null,
        code: "CAMERA_DUPLICATE_ROW",
        message: "Trùng học sinh trong cùng ngày import.",
        severity: "error",
      });
    } else if (matched) {
      seenStudentIds.set(matched.studentId, row.rowNumber);
    }

    let normalizedObservedAt: number | undefined;
    if (row.rawObservedAt) {
      const asDate = parseFlexibleSchoolDate(row.rawObservedAt);
      if (asDate && asDate !== context.attendanceDate) {
        issues.push({
          rowNumber: row.rowNumber,
          field: "observedAt",
          column: "observedAt",
          rejectedValue: row.rawObservedAt,
          code: "CAMERA_DATE_MISMATCH",
          message: "Thời điểm quan sát không thuộc ngày điểm danh đã chọn.",
          severity: "error",
        });
      }
      const timeMatch = String(row.rawObservedAt).match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        let hour = Number(timeMatch[1]);
        if (/\bpm\b/i.test(String(row.rawObservedAt)) && hour < 12) hour += 12;
        if (/\bam\b/i.test(String(row.rawObservedAt)) && hour === 12) hour = 0;
        const hh = String(Math.min(hour, 23)).padStart(2, "0");
        const mm = timeMatch[2];
        if (Number(mm) <= 59) normalizedObservedAt = vietnamWallTimeToUtcMs(context.attendanceDate, `${hh}:${mm}`);
      }
    }

    normalized.push({
      ...row,
      matchedStudentId: matched?.studentId,
      matchedClassId: matched?.classId,
      resolution,
      normalizedObservedAt,
      rawObservation: normalizeCameraStatus(row.rawStatus),
    });
  }

  const blockers = issues.filter((item) => item.severity === "error");
  return {
    ok: blockers.length === 0,
    issues,
    blockers,
    nameMatches,
    rows: normalized,
    presencePolicy: context.presencePolicy === PRESENCE_POLICY_FULL_ROSTER
      ? PRESENCE_POLICY_FULL_ROSTER
      : PRESENCE_POLICY_POSITIVE,
    matchedCount: normalized.filter((row) => row.resolution === "matched").length,
    warningCount: issues.filter((item) => item.severity === "warning").length,
    errorCount: blockers.length,
  };
}

export function applyUnconfirmedNameMatchGate<
  T extends {
    ok: boolean;
    issues: Array<{ code: string }>;
    blockers: Array<{ code: string }>;
    nameMatches?: ProposedNameMatch[];
  },
>(result: T, args: { confirmNameMatches?: boolean } = {}): T {
  const next = {
    ...result,
    nameMatches: result.nameMatches || [],
  };
  const hasAmbiguous = next.issues.some((item) => item.code === "CAMERA_NAME_AMBIGUOUS")
    || next.blockers.some((item) => item.code === "CAMERA_NAME_AMBIGUOUS");
  if (hasAmbiguous) {
    next.ok = false;
    return next;
  }
  const nameWarnings = next.issues.filter((item) => item.code === "CAMERA_NAME_MATCH_UNCONFIRMED");
  if (nameWarnings.length && !args.confirmNameMatches) {
    next.ok = false;
  }
  return next;
}

export function decidePublishedDateAction(args: {
  existingPublished: { importId: string; checksum: string; attendanceDate: string } | null;
  nextChecksum: string;
  attendanceDate: string;
  requestedMode?: string;
}) {
  if (!args.existingPublished) return { action: "publish" as const };
  if (
    args.existingPublished.checksum === args.nextChecksum &&
    args.existingPublished.attendanceDate === args.attendanceDate
  ) {
    return { action: "idempotent" as const, importId: args.existingPublished.importId };
  }
  const mode = args.requestedMode;
  if (mode === REPLACE_MODE_SUPPLEMENT) return { action: "supplement" as const };
  if (mode === REPLACE_MODE_REPLACE) return { action: "replace" as const };
  if (mode === REPLACE_MODE_CANCEL) return { action: "cancel" as const };
  return { action: "require_mode" as const, code: "ATTENDANCE_REPLACE_MODE_REQUIRED" };
}

/* ------------------------------------------------------------------ */
/* Whole-school file (one file per day, split by Mã lớp)               */
/* ------------------------------------------------------------------ */

export type SchoolCameraClass = { classId: string; code: string; name: string };

export type SchoolCameraRow = CameraRawRow & { rawClassName?: string };

export type SchoolClassPreview = {
  classId: string;
  code: string;
  name: string;
  rowCount: number;
  matchedCount: number;
  present: number;
  late: number;
  absent: number;
  rosterCount: number;
  missingCount: number;
  errorCount: number;
  warningCount: number;
  unconfirmedNameCount: number;
  publishable: boolean;
};

function foldText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ");
}

const SCHOOL_STATUS_ALIASES: Record<string, "present" | "late" | "absent"> = {
  "co mat": "present",
  present: "present",
  tre: "late",
  "di tre": "late",
  muon: "late",
  "di muon": "late",
  late: "late",
  vang: "absent",
  "vang mat": "absent",
  absent: "absent",
};

/** Template status: Có mặt / Trễ / Vắng (không dấu cũng được). Returns null when blank or unknown. */
export function parseSchoolCameraStatus(value: string | undefined): "present" | "late" | "absent" | null {
  return SCHOOL_STATUS_ALIASES[foldText(value || "")] || null;
}

function schoolIssue(
  row: SchoolCameraRow,
  field: string,
  rejectedValue: string | null,
  code: string,
  message: string,
): AttendanceImportIssue {
  return { rowNumber: row.rowNumber, field, column: field, rejectedValue, code, message, severity: "error" };
}

export function reconcileSchoolAttendanceRows(
  rows: SchoolCameraRow[],
  context: {
    attendanceDate: string;
    classes: SchoolCameraClass[];
    students: CameraStudent[];
    confirmNameMatches?: boolean;
  },
) {
  const classByCode = new Map(context.classes.map((row) => [normalizeCode(row.code), row]));
  const issues: AttendanceImportIssue[] = [];
  const invalidRows = new Set<number>();
  const groups = new Map<string, SchoolCameraRow[]>();

  for (const row of rows) {
    const code = normalizeCode(row.rawClassCode || "");
    const klass = code ? classByCode.get(code) : undefined;
    if (!code) {
      issues.push(schoolIssue(row, "classCode", null, "CAMERA_CLASS_MISSING", "Thiếu mã lớp."));
      invalidRows.add(row.rowNumber);
    } else if (!klass) {
      issues.push(
        schoolIssue(row, "classCode", row.rawClassCode || null, "CAMERA_CLASS_UNKNOWN", "Mã lớp không có trong năm học (hoặc lớp đã lưu trữ)."),
      );
      invalidRows.add(row.rowNumber);
    }
    if (!(row.rawStatus || "").trim()) {
      issues.push(schoolIssue(row, "sourceStatus", null, "CAMERA_STATUS_MISSING", "Thiếu trạng thái (Có mặt / Trễ / Vắng)."));
      invalidRows.add(row.rowNumber);
    } else if (!parseSchoolCameraStatus(row.rawStatus)) {
      issues.push(
        schoolIssue(row, "sourceStatus", row.rawStatus || null, "CAMERA_STATUS_INVALID", "Trạng thái chỉ nhận: Có mặt, Trễ, Vắng."),
      );
      invalidRows.add(row.rowNumber);
    }
    if (klass) {
      const list = groups.get(klass.classId) || [];
      list.push(row);
      groups.set(klass.classId, list);
    }
  }

  const normalizedRows: Array<SchoolCameraRow & {
    targetClassId?: string;
    matchedStudentId?: string;
    resolution: string;
    rawObservation: "present" | "late" | "absent" | "unknown";
    normalizedObservedAt?: number;
  }> = [];
  const nameMatches: ProposedNameMatch[] = [];
  const classPreviews: SchoolClassPreview[] = [];

  for (const klass of context.classes) {
    const classRows = groups.get(klass.classId) || [];
    const roster = context.students.filter((row) => row.classId === klass.classId);
    if (!classRows.length) continue;
    const result = reconcileAttendanceRows(classRows, {
      attendanceDate: context.attendanceDate,
      classId: klass.classId,
      classCode: klass.code,
      students: context.students,
    });
    issues.push(...result.issues);
    nameMatches.push(...result.nameMatches);
    const nameMatchedRows = new Set(result.nameMatches.map((item) => item.rowNumber));
    const matchedStudentIds = new Set<string>();
    const preview: SchoolClassPreview = {
      classId: klass.classId,
      code: klass.code,
      name: klass.name,
      rowCount: classRows.length,
      matchedCount: 0,
      present: 0,
      late: 0,
      absent: 0,
      rosterCount: roster.length,
      missingCount: 0,
      errorCount: 0,
      warningCount: 0,
      unconfirmedNameCount: 0,
      publishable: false,
    };
    for (const row of result.rows) {
      const status = parseSchoolCameraStatus(row.rawStatus);
      let resolution = invalidRows.has(row.rowNumber) ? "invalid" : row.resolution;
      if (resolution === "matched" && nameMatchedRows.has(row.rowNumber) && !context.confirmNameMatches) {
        resolution = "name_unconfirmed";
        preview.unconfirmedNameCount += 1;
      }
      if (resolution === "matched" && row.matchedStudentId) {
        matchedStudentIds.add(row.matchedStudentId);
        preview.matchedCount += 1;
        if (status === "present") preview.present += 1;
        if (status === "late") preview.late += 1;
        if (status === "absent") preview.absent += 1;
      }
      normalizedRows.push({
        ...row,
        targetClassId: klass.classId,
        resolution,
        rawObservation: status || "unknown",
        normalizedObservedAt: status === "absent" ? undefined : row.normalizedObservedAt,
      });
    }
    const rowNumbers = new Set(classRows.map((row) => row.rowNumber));
    const classIssues = issues.filter((item) => rowNumbers.has(item.rowNumber));
    preview.errorCount = classIssues.filter((item) => item.severity === "error").length;
    preview.warningCount = classIssues.filter((item) => item.severity === "warning").length;
    preview.missingCount = roster.filter((row) => !matchedStudentIds.has(row.studentId)).length;
    preview.publishable = preview.errorCount === 0 && preview.unconfirmedNameCount === 0 && preview.matchedCount > 0;
    classPreviews.push(preview);
  }

  const handledRows = new Set(normalizedRows.map((item) => item.rowNumber));
  for (const row of rows) {
    if (handledRows.has(row.rowNumber)) continue;
    normalizedRows.push({
      ...row,
      resolution: "invalid",
      rawObservation: parseSchoolCameraStatus(row.rawStatus) || "unknown",
    });
  }
  normalizedRows.sort((a, b) => a.rowNumber - b.rowNumber);

  const blockers = issues.filter((item) => item.severity === "error");
  const unconfirmed = classPreviews.reduce((sum, row) => sum + row.unconfirmedNameCount, 0);
  issues.sort((a, b) => a.rowNumber - b.rowNumber);
  return {
    ok: blockers.length === 0 && unconfirmed === 0 && classPreviews.length > 0,
    totalRows: rows.length,
    issues,
    blockers,
    nameMatches,
    unconfirmedNameCount: unconfirmed,
    classes: classPreviews,
    publishableClassIds: classPreviews.filter((row) => row.publishable).map((row) => row.classId),
    rows: normalizedRows,
    matchedCount: classPreviews.reduce((sum, row) => sum + row.matchedCount, 0),
    warningCount: issues.filter((item) => item.severity === "warning").length,
    errorCount: blockers.length,
  };
}
