export type WorkDocumentDecisionState = {
  status: string;
  active?: boolean;
  approvedByUserIds?: unknown[];
  rejectedByUserIds?: unknown[];
};

function hasBlockingSubmission(completions: Array<{ status?: string }> | null | undefined) {
  return (completions || []).some(
    (row) => row.status === "pending_approval" || row.status === "approved",
  );
}

/** Creator may edit until an assignee has submitted (nộp) or been marked complete. */
export function canMutateWorkDocument(
  document: WorkDocumentDecisionState,
  items: Array<{ completions?: Array<{ status?: string }> }> = [],
) {
  if (document.active === false || document.status === "rejected") return false;
  return !items.some((item) => hasBlockingSubmission(item.completions));
}

/**
 * Reject is only allowed while the document is still pending and nobody has
 * approved. A later reject after a partial approval would leave the document
 * both rejected and immutable (no edit/resubmit path).
 */
export function canRejectWorkDocument(document: WorkDocumentDecisionState) {
  return (
    document.status === "pending" &&
    (document.approvedByUserIds || []).length === 0 &&
    (document.rejectedByUserIds || []).length === 0
  );
}
