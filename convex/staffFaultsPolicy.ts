/** Visibility and add-button rules for menu `staff-faults` (Ghi nhận lỗi). */

export const STAFF_FAULTS_MENU_ID = "staff-faults";

export function canAddStaffFault(actor: { isOps: boolean; level: number }): boolean {
  if (actor.isOps) return true;
  return actor.level >= 2 && actor.level <= 5;
}

/**
 * `view`: faults targeting the actor, plus faults the actor recorded.
 * `view_all` / operational managers: every active fault in the query result.
 */
export function canSeeStaffFaultRecord(args: {
  isOps: boolean;
  access: string | undefined;
  actorUserId: string;
  targetUserId: string;
  recordedByUserId: string;
}): boolean {
  if (args.isOps || args.access === "view_all") return true;
  const me = String(args.actorUserId);
  return String(args.targetUserId) === me || String(args.recordedByUserId) === me;
}
