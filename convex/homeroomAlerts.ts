import { vietnamDateFromUtcMs, vietnamWallTimeToUtcMs } from "./homeroomTime.ts";

export type SchoolCalendarDay = {
  date: string;
  kind: string;
};

export type AttendanceAlertRow = {
  classId: string;
  studentId: string;
  attendanceDate: string;
  effectiveStatus?: string;
  rawObservation?: string;
};

export function evaluateMissingUploadAlert(args: {
  date: string;
  nowMs: number;
  cutoffTime: string;
  calendarDay: SchoolCalendarDay | null;
  publishedImportId?: string | null;
}) {
  const evaluatedDate = args.date;
  const cutoffAt = vietnamWallTimeToUtcMs(args.date, args.cutoffTime);
  const afterCutoff = args.nowMs >= cutoffAt;
  const today = vietnamDateFromUtcMs(args.nowMs);
  const dateIsTodayOrPast = evaluatedDate <= today;

  if (args.publishedImportId) {
    return {
      shouldAlert: false,
      calendarStatus: args.calendarDay?.kind || "unconfigured",
      resolvedByPublication: true,
      evaluatedDate,
      cutoffTime: args.cutoffTime,
      cutoffAt,
    };
  }

  if (!args.calendarDay) {
    return {
      shouldAlert: false,
      calendarStatus: "unconfigured",
      resolvedByPublication: false,
      evaluatedDate,
      cutoffTime: args.cutoffTime,
      cutoffAt,
    };
  }

  const working = args.calendarDay.kind === "working" || args.calendarDay.kind === "extra_teaching";
  return {
    shouldAlert: Boolean(working && afterCutoff && dateIsTodayOrPast),
    calendarStatus: args.calendarDay.kind,
    resolvedByPublication: false,
    evaluatedDate,
    cutoffTime: args.cutoffTime,
    cutoffAt,
  };
}

export function evaluateScopedMissingUploadAlerts(args: {
  date: string;
  nowMs: number;
  cutoffTime: string;
  calendarDay: SchoolCalendarDay | null;
  visibleClassIds: string[];
  publishedClassIds: string[];
}) {
  const visibleClassIds = [...new Set(args.visibleClassIds.filter(Boolean))];
  const published = new Set(args.publishedClassIds.filter(Boolean));
  if (!visibleClassIds.length) {
    const empty = evaluateMissingUploadAlert({
      date: args.date,
      nowMs: args.nowMs,
      cutoffTime: args.cutoffTime,
      calendarDay: args.calendarDay,
      publishedImportId: null,
    });
    return {
      ...empty,
      shouldAlert: false,
      resolvedByPublication: false,
      missingClassIds: [] as string[],
      scopeEmpty: true,
    };
  }
  const missingClassIds = visibleClassIds.filter((classId) => !published.has(classId));
  const base = evaluateMissingUploadAlert({
    date: args.date,
    nowMs: args.nowMs,
    cutoffTime: args.cutoffTime,
    calendarDay: args.calendarDay,
    publishedImportId: missingClassIds.length ? null : "all-visible-published",
  });
  return {
    ...base,
    shouldAlert: Boolean(base.shouldAlert && missingClassIds.length),
    resolvedByPublication: missingClassIds.length === 0,
    missingClassIds,
    scopeEmpty: false,
  };
}

export function evaluateUnresolvedAbsenceAlerts(
  days: AttendanceAlertRow[],
  args: { classIds?: string[] },
) {
  const allowed = args.classIds && args.classIds.length ? new Set(args.classIds) : null;
  return days.filter((row) => {
    if (allowed && !allowed.has(row.classId)) return false;
    return row.effectiveStatus === "absent_pending";
  });
}

export function evaluateRepeatedAbsenceAlert(
  days: AttendanceAlertRow[],
  args: { studentId: string; threshold?: number },
) {
  const threshold = args.threshold ?? 3;
  const matches = days.filter(
    (row) =>
      row.studentId === args.studentId &&
      (row.rawObservation === "absent" ||
        row.effectiveStatus === "absent_pending" ||
        row.effectiveStatus === "absent_excused" ||
        row.effectiveStatus === "absent_unexcused"),
  );
  return { shouldAlert: matches.length >= threshold, count: matches.length, threshold };
}

export function evaluateRepeatedLatenessAlert(
  days: AttendanceAlertRow[],
  args: { studentId: string; threshold?: number },
) {
  const threshold = args.threshold ?? 3;
  const matches = days.filter(
    (row) => row.studentId === args.studentId && (row.rawObservation === "late" || row.effectiveStatus === "late"),
  );
  return { shouldAlert: matches.length >= threshold, count: matches.length, threshold };
}
