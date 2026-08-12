export type WorkDocumentDecisionState = {
  status: string;
  approvedByUserIds?: unknown[];
  rejectedByUserIds?: unknown[];
};

/** A document becomes permanently immutable after the first approval. */
export function canMutateWorkDocument(document: WorkDocumentDecisionState) {
  return document.status !== "approved" && (document.approvedByUserIds || []).length === 0;
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
