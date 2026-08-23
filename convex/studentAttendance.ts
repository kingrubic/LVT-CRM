import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { enrollmentsCoveringDate } from "./homeroomCatalog";
import { assertClassReadable, assertClassSupervisor, homeroomActorOrThrow, loadAssignments } from "./homeroomContext";
import { canReadClass, filterStudentAttendanceHistory } from "./homeroomPolicy";
import { assertYmd, assertYmdRange } from "./homeroomTime";
import { assertDispositionChange, deriveEffectiveStatus } from "./studentAttendancePolicy";

export const listDailyClass = query({
  args: { classId: v.string(), attendanceDate: v.string() },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const date = assertYmd(args.attendanceDate);
    await assertClassReadable(ctx, actor, args.classId, date);
    const enrollments = enrollmentsCoveringDate(await ctx.db.query("classEnrollments").collect(), {
      classId: args.classId,
      date,
    });
    const days = (await ctx.db.query("studentAttendanceDays").collect()).filter(
      (row) => row.classId === args.classId && row.attendanceDate === date,
    );
    const rows = [];
    for (const enrollment of enrollments) {
      const student = await ctx.db.get(enrollment.studentId as Id<"students">);
      if (!student) continue;
      const day = days.find((row) => row.studentId === enrollment.studentId);
      rows.push({
        enrollment,
        student: { _id: student._id, studentCode: student.studentCode, fullName: student.fullName },
        day: day || null,
      });
    }
    return rows.sort(
      (a, b) => (a.enrollment.rosterNumber || 9999) - (b.enrollment.rosterNumber || 9999),
    );
  },
});

export const getStudentHistory = query({
  args: { studentId: v.string(), from: v.optional(v.string()), to: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const assignments = await loadAssignments(ctx);
    const days = (await ctx.db.query("studentAttendanceDays").collect()).filter(
      (row) => row.studentId === args.studentId,
    );
    const corrections = (await ctx.db.query("studentAttendanceCorrections").collect()).filter(
      (row) => row.studentId === args.studentId,
    );
    return filterStudentAttendanceHistory({
      actor,
      assignments,
      days,
      corrections,
      from: args.from,
      to: args.to,
    });
  },
});

export const getClassSummary = query({
  args: { classId: v.string(), from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const range = assertYmdRange(args.from, args.to);
    await assertClassReadable(ctx, actor, args.classId, range.from);
    const assignments = await loadAssignments(ctx);
    return (await ctx.db.query("studentAttendanceDays").collect()).filter((row) => {
      if (row.classId !== args.classId) return false;
      if (row.attendanceDate < range.from || row.attendanceDate > range.to) return false;
      return canReadClass(actor, assignments, row.classId, row.attendanceDate);
    });
  },
});

export const setDisposition = mutation({
  args: {
    attendanceDayId: v.string(),
    nextDisposition: v.string(),
    reasonCode: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const day = await ctx.db.get(args.attendanceDayId as Id<"studentAttendanceDays">);
    if (!day) throw new Error("ATTENDANCE_DAY_NOT_FOUND");
    await assertClassSupervisor(ctx, actor, day.classId, day.attendanceDate);
    assertDispositionChange({
      previousDisposition: day.disposition,
      nextDisposition: args.nextDisposition,
      reasonCode: args.reasonCode,
      note: args.note,
    });
    const nextEffective = deriveEffectiveStatus(day.rawObservation, args.nextDisposition);
    const now = Date.now();
    await ctx.db.insert("studentAttendanceCorrections", {
      attendanceDayId: args.attendanceDayId,
      studentId: day.studentId,
      attendanceDate: day.attendanceDate,
      previousDisposition: day.disposition,
      nextDisposition: args.nextDisposition,
      previousEffectiveStatus: day.effectiveStatus,
      nextEffectiveStatus: nextEffective,
      reasonCode: args.reasonCode,
      note: args.note,
      actorUserId: actor.userId,
      at: now,
    });
    await ctx.db.patch(day._id, {
      disposition: args.nextDisposition,
      effectiveStatus: nextEffective,
      reasonCode: args.reasonCode,
      note: args.note,
      updatedAt: now,
      updatedBy: actor.userId,
    });
    return { rawObservation: day.rawObservation, effectiveStatus: nextEffective };
  },
});
