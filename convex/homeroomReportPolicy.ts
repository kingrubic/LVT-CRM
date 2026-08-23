import {
  canReadClass,
  canReadClassOnAnyDateInRange,
  HOMEROOM_SCOPE_FORBIDDEN,
  type HomeroomActor,
  type HomeroomAssignment,
  type HomeroomClassScope,
} from "./homeroomPolicy.ts";
import { assertYmdRange } from "./homeroomTime.ts";
import type { EffectiveStatus } from "./studentAttendancePolicy.ts";

export type AttendanceDayRow = {
  classId: string;
  studentId: string;
  attendanceDate: string;
  effectiveStatus: EffectiveStatus | string;
  rawObservation?: string;
  enrollmentId?: string;
};

const COUNTED_ABSENCE = new Set(["absent_excused", "absent_unexcused", "absent_pending"]);
const COUNTED_PRESENT = new Set(["present", "late"]);
const EXCLUDED_FROM_RATE = new Set(["exempt", "no_data"]);

export function summarizeAttendanceDays(
  days: AttendanceDayRow[],
  filters: { classIds?: string[]; from?: string; to?: string },
) {
  const classFilter = filters.classIds && filters.classIds.length ? new Set(filters.classIds) : null;
  const filtered = days.filter((row) => {
    if (classFilter && !classFilter.has(row.classId)) return false;
    if (filters.from && row.attendanceDate < filters.from) return false;
    if (filters.to && row.attendanceDate > filters.to) return false;
    return true;
  });

  const counts = {
    present: 0,
    late: 0,
    absent_excused: 0,
    absent_unexcused: 0,
    absent_pending: 0,
    no_data: 0,
    exempt: 0,
  };
  for (const row of filtered) {
    if (row.effectiveStatus in counts) {
      counts[row.effectiveStatus as keyof typeof counts] += 1;
    }
  }
  const rated = filtered.filter((row) => !EXCLUDED_FROM_RATE.has(row.effectiveStatus));
  const presentLike = rated.filter((row) => COUNTED_PRESENT.has(row.effectiveStatus)).length;
  const attendanceRate = rated.length ? presentLike / rated.length : 0;
  return {
    counts,
    totalRows: filtered.length,
    ratedRows: rated.length,
    absenceRows: filtered.filter((row) => COUNTED_ABSENCE.has(row.effectiveStatus)).length,
    attendanceRate,
    days: filtered,
  };
}

export function buildAttendanceExportPayload(args: {
  summary: ReturnType<typeof summarizeAttendanceDays>;
  schoolName?: string;
  className?: string;
  schoolYearName?: string;
  from: string;
  to: string;
  generatedAt: number;
  generatedByUserId: string;
  generatedByName?: string;
}) {
  return {
    title: "Báo cáo điểm danh lớp chủ nhiệm",
    schoolName: args.schoolName || "THCS Lê Văn Tám",
    className: args.className || "",
    schoolYearName: args.schoolYearName || "",
    from: args.from,
    to: args.to,
    generatedAt: args.generatedAt,
    generatedByUserId: args.generatedByUserId,
    generatedByName: args.generatedByName || "",
    totals: args.summary.counts,
    attendanceRate: args.summary.attendanceRate,
    ratedRows: args.summary.ratedRows,
    rows: args.summary.days.map((row) => ({
      classId: row.classId,
      studentId: row.studentId,
      attendanceDate: row.attendanceDate,
      effectiveStatus: row.effectiveStatus,
      rawObservation: row.rawObservation || "",
    })),
  };
}

export function authorizeAttendanceSummaryRows(
  args: {
    actor: HomeroomActor;
    assignments: HomeroomAssignment[];
    days: AttendanceDayRow[];
    classId?: string;
    from: string;
    to: string;
    schoolYearId?: string;
  },
): AttendanceDayRow[] {
  const range = assertYmdRange(args.from, args.to);
  if (
    !canReadClassOnAnyDateInRange(args.actor, args.assignments, args.classId, {
      from: range.from,
      to: range.to,
      schoolYearId: args.schoolYearId,
    })
  ) {
    throw new Error(HOMEROOM_SCOPE_FORBIDDEN);
  }
  return args.days.filter((row) => {
    if (args.classId && row.classId !== args.classId) return false;
    if (row.attendanceDate < range.from || row.attendanceDate > range.to) return false;
    return canReadClass(args.actor, args.assignments, row.classId, row.attendanceDate);
  });
}

export function assertExportWithinScope(
  requestedClassIds: string[] | undefined,
  scope: HomeroomClassScope,
) {
  if (scope.kind === "all") return requestedClassIds || [];
  if (scope.kind === "none") {
    if (requestedClassIds?.length) throw new Error("HOMEROOM_SCOPE_FORBIDDEN");
    return [];
  }
  const allowed = new Set(scope.classIds);
  const requested = requestedClassIds?.length ? requestedClassIds : scope.classIds;
  if (requested.some((id) => !allowed.has(id))) throw new Error("HOMEROOM_SCOPE_FORBIDDEN");
  return requested;
}
