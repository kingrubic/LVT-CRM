import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  assertSingleActiveEnrollment,
  enrollmentsCoveringDate,
  findDuplicateClassCode,
  findOverlappingHomeroomTeacher,
  HOMEROOM_TEACHER_OVERLAP,
  isActiveAssignmentCandidate,
  planHomeroomTeacherReplacement,
  planStudentTransfer,
  toAssignmentCandidate,
  toSafeAssignmentUser,
  validateClassInput,
} from "./homeroomCatalog";
import {
  assertClassReadable,
  homeroomActorOrThrow,
  homeroomCatalogWriterOrThrow,
  loadAssignments,
  writeAudit,
} from "./homeroomContext";
import {
  assertCanIncludeArchivedClasses,
  assertCanListAttendanceImportClasses,
  assertClassNotArchived,
  assertHomeroomTeacherAssignmentInput,
  classIncludedInScopedList,
  classVisibleInScope,
  findEffectiveHomeroomTeacherAssignment,
  resolveAttendanceImportClassScope,
  resolveCatalogScope,
  resolveClassScope,
} from "./homeroomPolicy";
import { assertYmd, vietnamDateFromUtcMs } from "./homeroomTime";

export const listScoped = query({
  args: {
    schoolYearId: v.optional(v.string()),
    date: v.optional(v.string()),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    if (args.includeArchived) assertCanIncludeArchivedClasses(actor);
    const date = args.date || vietnamDateFromUtcMs(Date.now());
    const classes = await ctx.db.query("homeroomClasses").collect();
    const enrollments = await ctx.db.query("classEnrollments").collect();
    const assignments = await loadAssignments(ctx, args.schoolYearId);
    const scope = resolveClassScope(actor, assignments, { date, schoolYearId: args.schoolYearId });
    return classes
      .filter((row) => !args.schoolYearId || row.schoolYearId === args.schoolYearId)
      .filter((row) => classIncludedInScopedList(row, { includeArchived: args.includeArchived }))
      .filter((row) => classVisibleInScope(String(row._id), scope))
      .sort((a, b) => a.code.localeCompare(b.code, "vi"))
      .map((row) => ({
        ...row,
        rosterCount: enrollmentsCoveringDate(enrollments, { classId: String(row._id), date }).length,
      }));
  },
});

export const listCatalog = query({
  args: {
    schoolYearId: v.optional(v.string()),
    date: v.optional(v.string()),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { actor } = await homeroomCatalogWriterOrThrow(ctx);
    if (args.includeArchived) assertCanIncludeArchivedClasses(actor);
    const date = args.date || vietnamDateFromUtcMs(Date.now());
    const scope = resolveCatalogScope(actor);
    const classes = await ctx.db.query("homeroomClasses").collect();
    const enrollments = await ctx.db.query("classEnrollments").collect();
    const assignments = await loadAssignments(ctx, args.schoolYearId);
    const users = await ctx.db.query("users").collect();
    const usersById = new Map(users.map((row) => [String(row._id), row]));
    return classes
      .filter((row) => !args.schoolYearId || row.schoolYearId === args.schoolYearId)
      .filter((row) => classIncludedInScopedList(row, { includeArchived: args.includeArchived }))
      .filter((row) => classVisibleInScope(String(row._id), scope))
      .sort((a, b) => a.code.localeCompare(b.code, "vi"))
      .map((row) => {
        const current = findEffectiveHomeroomTeacherAssignment(assignments, {
          classId: String(row._id),
          date,
        });
        return {
          ...row,
          rosterCount: enrollmentsCoveringDate(enrollments, { classId: String(row._id), date }).length,
          currentHomeroomTeacher: current
            ? {
                ...current,
                user: toSafeAssignmentUser(usersById.get(String(current.userId)), current.userId),
              }
            : null,
        };
      });
  },
});

export const listForAttendanceImport = query({
  args: {
    schoolYearId: v.optional(v.string()),
    date: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    assertCanListAttendanceImportClasses(actor);
    const date = args.date || vietnamDateFromUtcMs(Date.now());
    const scope = resolveAttendanceImportClassScope(actor);
    const classes = await ctx.db.query("homeroomClasses").collect();
    const enrollments = await ctx.db.query("classEnrollments").collect();
    return classes
      .filter((row) => !args.schoolYearId || row.schoolYearId === args.schoolYearId)
      .filter((row) => classIncludedInScopedList(row))
      .filter((row) => classVisibleInScope(String(row._id), scope))
      .sort((a, b) => a.code.localeCompare(b.code, "vi"))
      .map((row) => ({
        ...row,
        rosterCount: enrollmentsCoveringDate(enrollments, { classId: String(row._id), date }).length,
      }));
  },
});

export const getScoped = query({
  args: { classId: v.string(), date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const date = args.date || vietnamDateFromUtcMs(Date.now());
    const klass = await assertClassReadable(ctx, actor, args.classId, date);
    const assignments = (await ctx.db.query("homeroomAssignments").collect()).filter(
      (row) => row.classId === args.classId && row.assignmentType === "homeroom_teacher" && row.scopeKind === "class",
    );
    const enrollments = enrollmentsCoveringDate(await ctx.db.query("classEnrollments").collect(), {
      classId: args.classId,
      date,
    });
    const users = await ctx.db.query("users").collect();
    const usersById = new Map(users.map((row) => [String(row._id), row]));
    return {
      class: klass,
      assignments: assignments.map((row) => ({
        ...row,
        user: toSafeAssignmentUser(usersById.get(String(row.userId)), row.userId),
      })),
      rosterCount: enrollments.length,
    };
  },
});

export const listAssignmentCandidates = query({
  args: {},
  handler: async (ctx) => {
    await homeroomCatalogWriterOrThrow(ctx);
    const users = await ctx.db.query("users").collect();
    return users
      .filter((row) => isActiveAssignmentCandidate(row))
      .map((row) => toAssignmentCandidate(row))
      .sort((a, b) => a.name.localeCompare(b.name, "vi") || a._id.localeCompare(b._id));
  },
});

export const create = mutation({
  args: {
    schoolYearId: v.string(),
    code: v.string(),
    name: v.string(),
    gradeLevel: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await homeroomCatalogWriterOrThrow(ctx);
    const year = await ctx.db.get(args.schoolYearId as Id<"schoolYears">);
    if (!year?.active) throw new Error("SCHOOL_YEAR_NOT_FOUND");
    const input = validateClassInput(args);
    const classes = await ctx.db.query("homeroomClasses").collect();
    if (findDuplicateClassCode(classes, { schoolYearId: args.schoolYearId, code: input.code })) {
      throw new Error("CLASS_CODE_TAKEN");
    }
    const now = Date.now();
    const id = await ctx.db.insert("homeroomClasses", {
      schoolYearId: args.schoolYearId,
      ...input,
      status: "active",
      notes: args.notes?.trim() || undefined,
      createdBy: String(user._id),
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "homeroomClass.create",
      details: JSON.stringify({ id, code: input.code }),
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.string(),
    code: v.string(),
    name: v.string(),
    gradeLevel: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await homeroomCatalogWriterOrThrow(ctx);
    const current = await ctx.db.get(args.id as Id<"homeroomClasses">);
    if (!current) throw new Error("CLASS_NOT_FOUND");
    const input = validateClassInput(args);
    const classes = await ctx.db.query("homeroomClasses").collect();
    if (findDuplicateClassCode(classes, { schoolYearId: current.schoolYearId, code: input.code }, args.id)) {
      throw new Error("CLASS_CODE_TAKEN");
    }
    await ctx.db.patch(current._id, {
      ...input,
      notes: args.notes?.trim() || undefined,
      updatedBy: String(user._id),
      updatedAt: Date.now(),
    });
  },
});

export const archive = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const { user } = await homeroomCatalogWriterOrThrow(ctx);
    const current = await ctx.db.get(args.id as Id<"homeroomClasses">);
    if (!current) throw new Error("CLASS_NOT_FOUND");
    await ctx.db.patch(current._id, {
      status: "archived",
      updatedBy: String(user._id),
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "homeroomClass.archive",
      details: JSON.stringify({ id: args.id }),
    });
  },
});

export const assignUser = mutation({
  args: {
    classId: v.string(),
    userId: v.string(),
    assignmentType: v.string(),
    scopeKind: v.optional(v.string()),
    effectiveFrom: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await homeroomCatalogWriterOrThrow(ctx);
    const klass = await ctx.db.get(args.classId as Id<"homeroomClasses">);
    if (!klass) throw new Error("CLASS_NOT_FOUND");
    assertClassNotArchived(klass);
    const target = await ctx.db.get(args.userId as Id<"users">);
    if (!target || target.status !== "active") throw new Error("USER_NOT_FOUND");
    assertHomeroomTeacherAssignmentInput({
      assignmentType: args.assignmentType,
      scopeKind: args.scopeKind,
    });
    const assignmentType = "homeroom_teacher";
    const scopeKind = "class";
    const effectiveFrom = assertYmd(args.effectiveFrom);
    const current = await ctx.db.query("homeroomAssignments").collect();
    const overlap = findOverlappingHomeroomTeacher(current, {
      classId: args.classId,
      effectiveFrom,
    });
    if (overlap) {
      const plan = planHomeroomTeacherReplacement({
        assignment: overlap,
        date: effectiveFrom,
      });
      await ctx.db.patch(overlap._id as Id<"homeroomAssignments">, {
        ...plan.close,
        endedBy: String(user._id),
        updatedAt: Date.now(),
      });
    }
    if (
      findOverlappingHomeroomTeacher(
        current.filter((row) => String(row._id) !== String(overlap?._id)),
        { classId: args.classId, effectiveFrom },
      )
    ) {
      throw new Error(HOMEROOM_TEACHER_OVERLAP);
    }
    const now = Date.now();
    const id = await ctx.db.insert("homeroomAssignments", {
      classId: args.classId,
      schoolYearId: klass.schoolYearId,
      userId: args.userId,
      assignmentType,
      scopeKind,
      effectiveFrom,
      active: true,
      createdBy: String(user._id),
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "homeroomAssignment.create",
      details: JSON.stringify({ id, classId: args.classId, assignmentType, scopeKind }),
    });
    return id;
  },
});

export const transferStudent = mutation({
  args: {
    enrollmentId: v.string(),
    toClassId: v.string(),
    date: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await homeroomCatalogWriterOrThrow(ctx);
    const enrollment = await ctx.db.get(args.enrollmentId as Id<"classEnrollments">);
    if (!enrollment) throw new Error("ENROLLMENT_NOT_FOUND");
    const toClass = await ctx.db.get(args.toClassId as Id<"homeroomClasses">);
    if (!toClass || toClass.schoolYearId !== enrollment.schoolYearId) throw new Error("ENROLLMENT_YEAR_MISMATCH");
    const date = assertYmd(args.date);
    const plan = planStudentTransfer({
      enrollment,
      toClassId: args.toClassId,
      date,
      reason: args.reason,
    });
    const others = (await ctx.db.query("classEnrollments").collect()).filter(
      (row) => String(row._id) !== args.enrollmentId,
    );
    assertSingleActiveEnrollment(others, {
      studentId: enrollment.studentId,
      schoolYearId: enrollment.schoolYearId,
    });
    const now = Date.now();
    await ctx.db.patch(enrollment._id, {
      ...plan.close,
      updatedBy: String(user._id),
      updatedAt: now,
    });
    const nextId = await ctx.db.insert("classEnrollments", {
      ...plan.open,
      rosterNumber: enrollment.rosterNumber,
      createdBy: String(user._id),
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "student.transfer",
      details: JSON.stringify({
        enrollmentId: args.enrollmentId,
        toClassId: args.toClassId,
        nextEnrollmentId: nextId,
      }),
    });
    return nextId;
  },
});
