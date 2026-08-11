export type WorkDocumentDecisionState = {
  status: string;
  approvedByUserIds?: unknown[];
};

/** A document becomes permanently immutable after the first approval. */
export function canMutateWorkDocument(document: WorkDocumentDecisionState) {
  return document.status !== "approved" && (document.approvedByUserIds || []).length === 0;
}
