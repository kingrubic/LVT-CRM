import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertSingleActiveEnrollment, enrollmentsCoveringDate } from "./homeroomCatalog";
import {
  assertClassReadable,
  homeroomActorOrThrow,
  homeroomCatalogWriterOrThrow,
  loadAssignments,
  writeAudit,
} from "./homeroomContext";
import {
  actorAssignedToStudentClass,
  assertGuardianBelongsToStudent,
  authorizeAccessibleEnrollments,
  canSeeSensitiveContacts,
} from "./homeroomPolicy";
import { vietnamDateFromUtcMs } from "./homeroomTime";

function normalizeStudentCode(code: string) {
  return code.trim().toUpperCase();
}

export const listByClass = query({
  args: {
    classId: v.string(),
    date: v.optional(v.string()),
    includeSensitiveContacts: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const date = args.date || vietnamDateFromUtcMs(Date.now());
    await assertClassReadable(ctx, actor, args.classId, date);
    const assignments = await loadAssignments(ctx);
    const enrollments = enrollmentsCoveringDate(await ctx.db.query("classEnrollments").collect(), {
      classId: args.classId,
      date,
    });
    const showContacts = canSeeSensitiveContacts(actor, {
      assignedToClass: actorAssignedToStudentClass(
        actor,
        assignments,
        enrollments.map((row) => ({
          classId: row.classId,
          schoolYearId: row.schoolYearId,
          startDate: row.startDate,
          endDate: row.endDate,
        })),
      ),
    });
    const rows = [];
    for (const enrollment of enrollments) {
      const student = await ctx.db.get(enrollment.studentId as Id<"students">);
      if (!student) continue;
      const guardians = showContacts
        ? (await ctx.db.query("studentGuardians").collect()).filter(
            (row) => row.studentId === String(student._id) && row.active,
          )
        : [];
      rows.push({
        enrollment,
        student: {
          ...student,
          studentPhone: showContacts ? student.studentPhone : undefined,
        },
        guardians: showContacts
          ? guardians
          : guardians.map((row) => ({ ...row, phone: undefined })),
      });
    }
    return rows.sort(
      (a, b) => (a.enrollment.rosterNumber || 9999) - (b.enrollment.rosterNumber || 9999),
    );
  },
});

export const getScoped = query({
  args: { studentId: v.string(), includeSensitiveContacts: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    if (!args.studentId || /\s/.test(args.studentId) || args.studentId.length > 64) {
      throw new Error("STUDENT_NOT_FOUND");
    }
    let student;
    try {
      student = await ctx.db.get(args.studentId as Id<"students">);
    } catch {
      throw new Error("STUDENT_NOT_FOUND");
    }
    if (!student) throw new Error("STUDENT_NOT_FOUND");
    const enrollments = (await ctx.db.query("classEnrollments").collect()).filter(
      (row) => row.studentId === args.studentId,
    );
    const assignments = await loadAssignments(ctx);
    const accessible = authorizeAccessibleEnrollments(actor, assignments, enrollments);
    const showContacts = canSeeSensitiveContacts(actor, {
      assignedToClass: actorAssignedToStudentClass(actor, assignments, accessible),
    });
    const guardians = (await ctx.db.query("studentGuardians").collect()).filter(
      (row) => row.studentId === args.studentId && row.active,
    );
    return {
      student: { ...student, studentPhone: showContacts ? student.studentPhone : undefined },
      enrollments: accessible,
      guardians: showContacts ? guardians : guardians.map((row) => ({ ...row, phone: undefined })),
    };
  },
});

export const create = mutation({
  args: {
    classId: v.string(),
    studentCode: v.string(),
    fullName: v.string(),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.string()),
    studentPhone: v.optional(v.string()),
    rosterNumber: v.optional(v.number()),
    startDate: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await homeroomCatalogWriterOrThrow(ctx);
    const klass = await ctx.db.get(args.classId as Id<"homeroomClasses">);
    if (!klass || klass.status !== "active") throw new Error("CLASS_NOT_FOUND");
    const studentCode = normalizeStudentCode(args.studentCode);
    const fullName = args.fullName.trim();
    if (!studentCode || !fullName) throw new Error("INVALID_NAME");
    const existing = (await ctx.db.query("students").collect()).find(
      (row) => row.studentCode === studentCode && row.status === "active",
    );
    if (existing) throw new Error("STUDENT_CODE_EXISTS");
    const now = Date.now();
    const studentId = await ctx.db.insert("students", {
      studentCode,
      fullName,
      dateOfBirth: args.dateOfBirth,
      gender: args.gender,
      studentPhone: args.studentPhone,
      status: "active",
      createdBy: String(user._id),
      createdAt: now,
      updatedAt: now,
    });
    const enrollments = await ctx.db.query("classEnrollments").collect();
    assertSingleActiveEnrollment(enrollments, {
      studentId: String(studentId),
      schoolYearId: klass.schoolYearId,
    });
    await ctx.db.insert("classEnrollments", {
      studentId: String(studentId),
      classId: args.classId,
      schoolYearId: klass.schoolYearId,
      rosterNumber: args.rosterNumber,
      startDate: args.startDate,
      status: "active",
      createdBy: String(user._id),
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "student.create",
      details: JSON.stringify({ studentId, classId: args.classId }),
    });
    return studentId;
  },
});

export const update = mutation({
  args: {
    id: v.string(),
    fullName: v.string(),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.string()),
    studentPhone: v.optional(v.string()),
    priorityCategory: v.optional(v.string()),
    ethnicity: v.optional(v.string()),
    hardshipNote: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await homeroomCatalogWriterOrThrow(ctx);
    const current = await ctx.db.get(args.id as Id<"students">);
    if (!current) throw new Error("STUDENT_NOT_FOUND");
    await ctx.db.patch(current._id, {
      fullName: args.fullName.trim(),
      dateOfBirth: args.dateOfBirth,
      gender: args.gender,
      studentPhone: args.studentPhone,
      priorityCategory: args.priorityCategory,
      ethnicity: args.ethnicity,
      hardshipNote: args.hardshipNote,
      status: args.status || current.status,
      updatedBy: String(user._id),
      updatedAt: Date.now(),
    });
  },
});

export const upsertGuardian = mutation({
  args: {
    studentId: v.string(),
    guardianId: v.optional(v.string()),
    relationship: v.string(),
    fullName: v.string(),
    phone: v.optional(v.string()),
    isPrimaryContact: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await homeroomCatalogWriterOrThrow(ctx);
    const student = await ctx.db.get(args.studentId as Id<"students">);
    if (!student) throw new Error("STUDENT_NOT_FOUND");
    const fullName = args.fullName.trim();
    if (!fullName) throw new Error("INVALID_NAME");
    const now = Date.now();
    if (args.guardianId) {
      const current = await ctx.db.get(args.guardianId as Id<"studentGuardians">);
      if (!current) throw new Error("GUARDIAN_NOT_FOUND");
      assertGuardianBelongsToStudent(current, args.studentId);
      await ctx.db.patch(current._id, {
        relationship: args.relationship,
        fullName,
        phone: args.phone,
        isPrimaryContact: Boolean(args.isPrimaryContact),
        notes: args.notes,
        updatedBy: String(user._id),
        updatedAt: now,
      });
      return current._id;
    }
    return await ctx.db.insert("studentGuardians", {
      studentId: args.studentId,
      relationship: args.relationship,
      fullName,
      phone: args.phone,
      isPrimaryContact: Boolean(args.isPrimaryContact),
      notes: args.notes,
      active: true,
      createdBy: String(user._id),
      createdAt: now,
      updatedAt: now,
    });
  },
});
