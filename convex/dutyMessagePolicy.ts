/** Pure duty-chat authorization. Reuses work-message HTML sanitization. */

import { isDutyParticipant, isOperationalManagerRole } from "./assignmentPolicy.ts";
import { prepareWorkMessageBody } from "./workMessagePolicy.ts";

export type DutyChatDuty = {
  active?: boolean;
  createdBy?: string;
  departmentIds?: string[];
  participantUserIds?: string[];
};

export type DutyChatUser = {
  _id: string;
  departmentId?: string;
};

/**
 * Same visibility as `duties.listMine` / personal calendar:
 * admin/mod, duties `view_all`, creator, participant, or a same-department
 * subordinate who is a participant. Shared-schedule school-wide listing is
 * display-only and does not widen chat.
 */
export function canAccessDutyChat(args: {
  actorUserId: string;
  actorRole: string;
  actorAccess: string;
  actorDepartmentId?: string;
  duty: DutyChatDuty | null | undefined;
  subordinateUsers?: DutyChatUser[];
}): boolean {
  const duty = args.duty;
  if (!duty?.active) return false;
  if (isOperationalManagerRole(args.actorRole)) return true;
  if (args.actorAccess === "view_all") return true;
  if (String(duty.createdBy || "") === String(args.actorUserId || "")) return true;
  const actor: DutyChatUser = {
    _id: String(args.actorUserId || ""),
    departmentId: args.actorDepartmentId,
  };
  if (isDutyParticipant(actor, duty)) return true;
  return (args.subordinateUsers || []).some((user) => isDutyParticipant(user, duty));
}

export function prepareDutyMessageBody(html: string): { bodyHtml: string; bodyText: string } {
  try {
    return prepareWorkMessageBody(html);
  } catch (error) {
    const code = String((error as Error)?.message || "");
    if (code === "WORK_CHAT_EMPTY") throw new Error("DUTY_CHAT_EMPTY");
    if (code === "WORK_CHAT_TOO_LONG") throw new Error("DUTY_CHAT_TOO_LONG");
    throw error;
  }
}
