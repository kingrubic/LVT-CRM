export const DEFAULT_DOCUMENT_TYPES = [
  { code: "KE_HOACH", name: "Kế hoạch" },
  { code: "BIEN_BAN", name: "Biên bản" },
  { code: "BAO_CAO", name: "Báo cáo" },
] as const;

export const FALLBACK_DOCUMENT_TYPE_CODE = "BIEN_BAN";

export function requireDocumentTypeId(hasFile: boolean, documentTypeId?: string | null) {
  if (!hasFile) return null;
  const id = String(documentTypeId || "").trim();
  if (!id) throw new Error("DOCUMENT_TYPE_REQUIRED");
  return id;
}

export function officeDocumentHasFile(row: { driveFileId?: string | null; fileId?: string | null }) {
  return Boolean(row.driveFileId || row.fileId);
}

export function completionHasFile(row: { driveFileId?: string | null; fileName?: string | null }) {
  return Boolean(row.driveFileId || String(row.fileName || "").trim());
}

export function needsDocumentTypeBackfill(hasFile: boolean, documentTypeId?: string | null) {
  return hasFile && !String(documentTypeId || "").trim();
}

export function resolveDisplayedDocumentType(
  hasFile: boolean,
  documentTypeId: string | null | undefined,
  types: Array<{ _id?: string; id?: string; code?: string; name?: string }>,
) {
  const currentId = String(documentTypeId || "").trim();
  const match = (item: { _id?: string; id?: string }) => String(item._id || item.id || "");
  if (currentId) {
    const row = types.find((item) => match(item) === currentId);
    return { documentTypeId: currentId, documentTypeName: row?.name || "" };
  }
  if (!hasFile) return { documentTypeId: "", documentTypeName: "" };
  const fallback = types.find((item) => item.code === FALLBACK_DOCUMENT_TYPE_CODE);
  return {
    documentTypeId: fallback ? match(fallback) : "",
    documentTypeName: fallback?.name || "Biên bản",
  };
}

export function sortDocumentTypes<T extends { name: string }>(types: T[]) {
  return [...types].sort((a, b) => a.name.localeCompare(b.name, "vi"));
}
