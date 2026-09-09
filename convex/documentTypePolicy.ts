export const DEFAULT_DOCUMENT_TYPES = [
  { code: "KE_HOACH", name: "Kế hoạch" },
  { code: "BIEN_BAN", name: "Biên bản" },
  { code: "BAO_CAO", name: "Báo cáo" },
] as const;

export function requireDocumentTypeId(hasFile: boolean, documentTypeId?: string | null) {
  if (!hasFile) return null;
  const id = String(documentTypeId || "").trim();
  if (!id) throw new Error("DOCUMENT_TYPE_REQUIRED");
  return id;
}

export function sortDocumentTypes<T extends { name: string }>(types: T[]) {
  return [...types].sort((a, b) => a.name.localeCompare(b.name, "vi"));
}
