import {
  isHomeroomSupervisorAccess,
  isMenuVisible,
  isViewAllAccess,
  type MenuAccess,
} from "./menuAccess.ts";
import { assertYmd, assertYmdRange, compareYmd, dateInRange } from "./homeroomTime.ts";

function isOperationalManagerRole(role: string) {
  return role === "admin" || role === "moderator";
}

export const HOMEROOM_SCOPE_FORBIDDEN = "HOMEROOM_SCOPE_FORBIDDEN";
export const SUPERVISOR_REQUIRED = "SUPERVISOR_REQUIRED";
export const HOMEROOM_MENU_HIDDEN = "HOMEROOM_MENU_HIDDEN";
export const SENSITIVE_CONTACTS_FORBIDDEN = "SENSITIVE_CONTACTS_FORBIDDEN";

export type HomeroomActor = {
  userId: string;
  role: string;
  status?: string;
  mustChangePassword?: boolean;
  menuAccess: Record<string, string | MenuAccess | undefined>;
};

export type HomeroomAssignment = {
  classId: string;
  schoolYearId: string;
  userId: string;
  assignmentType: string;
  scopeKind: string;
  effectiveFrom: string;
  effectiveTo?: string;
  active: boolean;
};

export function isHomeroomOperationalManager(actor: HomeroomActor): boolean {
  return isOperationalManagerRole(actor.role);
}

export function homeroomMenuAccess(actor: HomeroomActor): MenuAccess {
  return (actor.menuAccess?.homeroom || "hidden") as MenuAccess;
}

export function hasHomeroomMenu(actor: HomeroomActor): boolean {
  return isHomeroomOperationalManager(actor) || isMenuVisible(homeroomMenuAccess(actor));
}

export function isHomeroomSupervisorUser(actor: HomeroomActor): boolean {
  return !isHomeroomOperationalManager(actor) && isHomeroomSupervisorAccess(homeroomMenuAccess(actor));
}

export function isHomeroomViewAllUser(actor: HomeroomActor): boolean {
  return !isHomeroomOperationalManager(actor) && isViewAllAccess(homeroomMenuAccess(actor));
}

export function canWriteHomeroomCatalog(actor: HomeroomActor): boolean {
  return isHomeroomOperationalManager(actor);
}

export function assignmentCovers(
  assignment: HomeroomAssignment,
  args: { classId?: string; schoolYearId?: string; date: string },
): boolean {
  if (!assignment.active) return false;
  if (args.schoolYearId && assignment.schoolYearId !== args.schoolYearId) return false;
  if (!dateInRange(args.date, assignment.effectiveFrom, assignment.effectiveTo)) return false;
  if (assignment.scopeKind === "whole_school") return true;
  if (args.classId && assignment.classId !== args.classId) return false;
  return true;
}

export function actorAssignmentsOnDate(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  args: { date: string; schoolYearId?: string; classId?: string },
): HomeroomAssignment[] {
  return assignments.filter(
    (row) => String(row.userId) === String(actor.userId) && assignmentCovers(row, args),
  );
}

export type HomeroomClassScope =
  | { kind: "all" }
  | { kind: "none" }
  | { kind: "ids"; classIds: string[] };

export function resolveClassScope(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  args: { date: string; schoolYearId?: string },
): HomeroomClassScope {
  if (isHomeroomOperationalManager(actor) || isHomeroomViewAllUser(actor)) return { kind: "all" };
  const covered = actorAssignmentsOnDate(actor, assignments, args);
  if (covered.some((row) => row.scopeKind === "whole_school")) return { kind: "all" };
  const classIds = [...new Set(covered.map((row) => row.classId).filter(Boolean))];
  return classIds.length ? { kind: "ids", classIds } : { kind: "none" };
}

export function classVisibleInScope(classId: string, scope: HomeroomClassScope): boolean {
  if (scope.kind === "all") return true;
  if (scope.kind === "none") return false;
  return scope.classIds.includes(classId);
}

export function rangesOverlap(
  startA: string,
  endA: string | undefined,
  startB: string,
  endB: string | undefined,
): boolean {
  if (endA && compareYmd(endA, startB) < 0) return false;
  if (endB && compareYmd(endB, startA) < 0) return false;
  return true;
}

export function enrollmentAccessibleToActor(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  enrollment: { classId: string; schoolYearId?: string; startDate: string; endDate?: string },
): boolean {
  if (!hasHomeroomMenu(actor)) return false;
  if (isHomeroomOperationalManager(actor) || isHomeroomViewAllUser(actor)) return true;
  return assignments.some((row) => {
    if (String(row.userId) !== String(actor.userId) || !row.active) return false;
    if (enrollment.schoolYearId && row.schoolYearId !== enrollment.schoolYearId) return false;
    if (row.scopeKind !== "whole_school" && row.classId !== enrollment.classId) return false;
    return rangesOverlap(row.effectiveFrom, row.effectiveTo, enrollment.startDate, enrollment.endDate);
  });
}

export function filterEnrollmentsForActor<T extends { classId: string; schoolYearId?: string; startDate: string; endDate?: string }>(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  enrollments: T[],
): T[] {
  return enrollments.filter((row) => enrollmentAccessibleToActor(actor, assignments, row));
}

export function authorizeAccessibleEnrollments<T extends { classId: string; schoolYearId?: string; startDate: string; endDate?: string }>(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  enrollments: T[],
): T[] {
  const accessible = filterEnrollmentsForActor(actor, assignments, enrollments);
  if (!accessible.length) throw new Error(HOMEROOM_SCOPE_FORBIDDEN);
  return accessible;
}

export function actorAssignedToStudentClass(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  enrollments: Array<{ classId: string; schoolYearId?: string; startDate: string; endDate?: string }>,
): boolean {
  if (isHomeroomOperationalManager(actor) || isHomeroomViewAllUser(actor) || isHomeroomSupervisorUser(actor)) {
    return false;
  }
  return enrollments.some((enrollment) =>
    assignments.some((row) => {
      if (String(row.userId) !== String(actor.userId) || !row.active) return false;
      if (enrollment.schoolYearId && row.schoolYearId !== enrollment.schoolYearId) return false;
      if (row.scopeKind !== "class" || row.classId !== enrollment.classId) return false;
      return rangesOverlap(row.effectiveFrom, row.effectiveTo, enrollment.startDate, enrollment.endDate);
    }),
  );
}

export function filterStudentAttendanceHistory<
  TDay extends { classId: string; attendanceDate: string; studentId: string; _id?: string },
  TCorrection extends { studentId: string; attendanceDate: string; attendanceDayId?: string },
>(args: {
  actor: HomeroomActor;
  assignments: HomeroomAssignment[];
  days: TDay[];
  corrections: TCorrection[];
  from?: string;
  to?: string;
}): { days: TDay[]; corrections: TCorrection[] } {
  const from = args.from ? assertYmd(args.from) : undefined;
  const to = args.to ? assertYmd(args.to) : undefined;
  if (from && to) assertYmdRange(from, to);
  const days = args.days
    .filter((day) => {
      if (from && day.attendanceDate < from) return false;
      if (to && day.attendanceDate > to) return false;
      return canReadClass(args.actor, args.assignments, day.classId, day.attendanceDate);
    })
    .sort((a, b) => a.attendanceDate.localeCompare(b.attendanceDate));
  if (!days.length) throw new Error(HOMEROOM_SCOPE_FORBIDDEN);
  const authorizedDayIds = new Set(days.map((day) => String(day._id || "")));
  const authorizedKeys = new Set(days.map((day) => `${day.studentId}:${day.attendanceDate}`));
  const corrections = args.corrections.filter((row) => {
    if (row.attendanceDayId && authorizedDayIds.has(String(row.attendanceDayId))) return true;
    return authorizedKeys.has(`${row.studentId}:${row.attendanceDate}`);
  });
  return { days, corrections };
}

export function hasWholeSchoolSupervisorScope(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  args: { date: string; schoolYearId?: string },
): boolean {
  if (!isHomeroomSupervisorUser(actor) && !isHomeroomOperationalManager(actor)) return false;
  if (isHomeroomOperationalManager(actor)) return true;
  return actorAssignmentsOnDate(actor, assignments, args).some(
    (row) => row.assignmentType === "supervisor" && row.scopeKind === "whole_school",
  );
}

export function canReadClass(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  classId: string,
  date: string,
): boolean {
  if (!hasHomeroomMenu(actor)) return false;
  if (isHomeroomOperationalManager(actor) || isHomeroomViewAllUser(actor)) return true;
  return actorAssignmentsOnDate(actor, assignments, { date, classId }).length > 0;
}

export function canReadClassOnAnyDateInRange(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  classId: string | undefined,
  args: { from: string; to: string; schoolYearId?: string },
): boolean {
  if (!hasHomeroomMenu(actor)) return false;
  if (isHomeroomOperationalManager(actor) || isHomeroomViewAllUser(actor)) return true;
  return assignments.some((row) => {
    if (String(row.userId) !== String(actor.userId) || !row.active) return false;
    if (args.schoolYearId && row.schoolYearId !== args.schoolYearId) return false;
    if (row.scopeKind !== "whole_school" && classId && row.classId !== classId) return false;
    if (row.scopeKind !== "whole_school" && !classId && !row.classId) return false;
    return rangesOverlap(row.effectiveFrom, row.effectiveTo, args.from, args.to);
  });
}

export function canMaintainAssignedRoster(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  classId: string,
  date: string,
): boolean {
  if (isHomeroomOperationalManager(actor) || isHomeroomViewAllUser(actor)) return canReadClass(actor, assignments, classId, date);
  return actorAssignmentsOnDate(actor, assignments, { date, classId }).some(
    (row) => row.assignmentType === "homeroom_teacher",
  );
}

export function canUploadCamera(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  classId: string,
  date: string,
): boolean {
  if (isHomeroomOperationalManager(actor)) return true;
  if (!isHomeroomSupervisorUser(actor)) return false;
  return actorAssignmentsOnDate(actor, assignments, { date, classId }).some(
    (row) => row.assignmentType === "supervisor",
  );
}

export function canCorrectDisposition(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  classId: string,
  date: string,
): boolean {
  return canUploadCamera(actor, assignments, classId, date);
}

export function canSeeSensitiveContacts(
  actor: HomeroomActor,
  args: { includeSensitiveContacts?: boolean; assignedToClass?: boolean } = {},
): boolean {
  if (isHomeroomOperationalManager(actor)) return true;
  if (args.assignedToClass && homeroomMenuAccess(actor) === "view") return true;
  return false;
}

export function assertHomeroomActorReady(actor: HomeroomActor) {
  if (actor.status && actor.status !== "active") throw new Error("USER_NOT_ACTIVE");
  if (actor.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  if (!hasHomeroomMenu(actor)) throw new Error(HOMEROOM_MENU_HIDDEN);
}

export function assertCanReadClass(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  classId: string,
  date: string,
) {
  assertHomeroomActorReady(actor);
  if (!canReadClass(actor, assignments, classId, date)) {
    throw new Error(HOMEROOM_SCOPE_FORBIDDEN);
  }
}

export function assertCanSupervisorImport(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  classId: string,
  date: string,
) {
  assertHomeroomActorReady(actor);
  if (!canUploadCamera(actor, assignments, classId, date)) {
    throw new Error(SUPERVISOR_REQUIRED);
  }
}

export function assertCanCorrectDisposition(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  classId: string,
  date: string,
) {
  assertHomeroomActorReady(actor);
  if (!canCorrectDisposition(actor, assignments, classId, date)) {
    throw new Error(SUPERVISOR_REQUIRED);
  }
}

export function assertCanWriteHomeroomCatalog(actor: HomeroomActor) {
  if (actor.status && actor.status !== "active") throw new Error("USER_NOT_ACTIVE");
  if (actor.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  if (!canWriteHomeroomCatalog(actor)) throw new Error(HOMEROOM_SCOPE_FORBIDDEN);
}

export function assertCanMaintainAssignedRoster(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  classId: string,
  date: string,
) {
  assertHomeroomActorReady(actor);
  if (!canMaintainAssignedRoster(actor, assignments, classId, date)) {
    throw new Error(HOMEROOM_SCOPE_FORBIDDEN);
  }
}

export function assertGuardianBelongsToStudent(
  guardian: { studentId: string },
  studentId: string,
) {
  if (String(guardian.studentId) !== String(studentId)) throw new Error("GUARDIAN_NOT_FOUND");
}
