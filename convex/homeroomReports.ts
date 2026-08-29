import { v } from "convex/values";
import { query } from "./_generated/server";
import { homeroomActorOrThrow, loadAssignments } from "./homeroomContext";
import { classVisibleInScope, resolveTeacherOverviewScope } from "./homeroomPolicy";
import {
  authorizeAttendanceSummaryRows,
  buildAttendanceExportPayload,
  enrichAttendanceSummaryRows,
  resolveScopedExportTitles,
  summarizeAttendanceDays,
} from "./homeroomReportPolicy";
import { enrollmentsCoveringDate } from "./homeroomCatalog";
import { evaluateScopedMissingUploadAlerts, evaluateUnresolvedAbsenceAlerts } from "./homeroomAlerts";
import { assertYmdRange, DEFAULT_ATTENDANCE_UPLOAD_DUE_TIME, vietnamDateFromUtcMs } from "./homeroomTime";

export const attendanceSummary = query({
  args: {
    classId: v.optional(v.string()),
    schoolYearId: v.optional(v.string()),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, actor } = await homeroomActorOrThrow(ctx);
    const range = assertYmdRange(args.from, args.to);
    const assignments = await loadAssignments(ctx, args.schoolYearId);
    const days = authorizeAttendanceSummaryRows({
      actor,
      assignments,
      days: await ctx.db.query("studentAttendanceDays").collect(),
      classId: args.classId,
      from: range.from,
      to: range.to,
      schoolYearId: args.schoolYearId,
    });
    const allowedStudentIds = new Set(days.map((row) => row.studentId));
    const students = (await ctx.db.query("students").collect())
      .filter((row) => allowedStudentIds.has(String(row._id)))
      .map((row) => ({
        _id: String(row._id),
        studentCode: row.studentCode,
        fullName: row.fullName,
        status: row.status,
      }));
    const enrichedDays = enrichAttendanceSummaryRows(days, students);
    const classIds = args.classId ? [args.classId] : [...new Set(enrichedDays.map((row) => row.classId))];
    const summary = summarizeAttendanceDays(enrichedDays, { classIds, from: args.from, to: args.to });
    const scopedClassIds = [...new Set([...classIds, ...enrichedDays.map((row) => row.classId)])];
    const classes = (await ctx.db.query("homeroomClasses").collect())
      .filter((row) => scopedClassIds.includes(String(row._id)))
      .map((row) => ({
        _id: String(row._id),
        name: row.name,
        code: row.code,
        schoolYearId: row.schoolYearId,
      }));
    const yearIds = new Set<string>(
      classes.map((row) => row.schoolYearId).filter((id): id is string => Boolean(id)),
    );
    if (args.schoolYearId) yearIds.add(args.schoolYearId);
    const schoolYears = (await ctx.db.query("schoolYears").collect())
      .filter((row) => yearIds.has(String(row._id)))
      .map((row) => ({ _id: String(row._id), name: row.name }));
    const titles = resolveScopedExportTitles({
      classId: args.classId,
      schoolYearId: args.schoolYearId,
      scopedClassIds,
      classes,
      schoolYears,
    });
    return {
      summary,
      exportPayload: buildAttendanceExportPayload({
        summary,
        className: titles.className,
        schoolYearName: titles.schoolYearName,
        from: args.from,
        to: args.to,
        generatedAt: Date.now(),
        generatedByUserId: String(user._id),
        generatedByName: user.name,
      }),
    };
  },
});

export const overview = query({
  args: { schoolYearId: v.optional(v.string()), date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const date = args.date || vietnamDateFromUtcMs(Date.now());
    const assignments = await loadAssignments(ctx, args.schoolYearId);
    const scope = resolveTeacherOverviewScope(actor, assignments, { date, schoolYearId: args.schoolYearId });
    const classes = (await ctx.db.query("homeroomClasses").collect()).filter((row) => {
      if (args.schoolYearId && row.schoolYearId !== args.schoolYearId) return false;
      if (row.status !== "active") return false;
      return classVisibleInScope(String(row._id), scope);
    });
    const days = (await ctx.db.query("studentAttendanceDays").collect()).filter((row) => {
      if (row.attendanceDate !== date) return false;
      return classVisibleInScope(row.classId, scope);
    });
    const allEnrollments = await ctx.db.query("classEnrollments").collect();
    const enrollments = classes.flatMap((klass) =>
      enrollmentsCoveringDate(allEnrollments, { classId: String(klass._id), date }),
    );
    const summary = summarizeAttendanceDays(days, {
      classIds: scope.kind === "ids" ? scope.classIds : classes.map((row) => String(row._id)),
      from: date,
      to: date,
    });
    const year = args.schoolYearId
      ? (await ctx.db.query("schoolYears").collect()).find((row) => String(row._id) === args.schoolYearId)
      : (await ctx.db.query("schoolYears").collect()).find((row) => row.active);
    const calendar = year
      ? await ctx.db
          .query("schoolCalendarDays")
          .withIndex("by_year_date", (q) => q.eq("schoolYearId", String(year._id)).eq("date", date))
          .unique()
      : null;
    const visibleClassIds = classes.map((row) => String(row._id));
    const publishedClassIds = (await ctx.db.query("attendanceImportUploads").collect())
      .filter((row) => row.attendanceDate === date && row.status === "published" && row.classId)
      .map((row) => String(row.classId));
    const missingUpload = evaluateScopedMissingUploadAlerts({
      date,
      nowMs: Date.now(),
      cutoffTime: year?.attendanceUploadDueTime || DEFAULT_ATTENDANCE_UPLOAD_DUE_TIME,
      calendarDay: calendar,
      visibleClassIds,
      publishedClassIds,
    });
    const missingClasses = classes
      .filter((row) => missingUpload.missingClassIds.includes(String(row._id)))
      .map((row) => ({ classId: String(row._id), code: row.code, name: row.name }));
    return {
      date,
      classes: classes.map((row) => ({
        ...row,
        rosterCount: enrollmentsCoveringDate(allEnrollments, { classId: String(row._id), date }).length,
      })),
      studentCount: enrollments.length,
      summary,
      missingUpload: { ...missingUpload, missingClasses },
      unresolvedAbsences: evaluateUnresolvedAbsenceAlerts(days, {
        classIds: scope.kind === "ids" ? scope.classIds : classes.map((row) => String(row._id)),
      }),
    };
  },
});
