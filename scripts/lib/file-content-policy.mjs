import path from 'node:path';

const uploadMimeTypes = new Map([
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.xls', 'application/vnd.ms-excel'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
]);

export function canonicalUploadMime(fileName) {
  return uploadMimeTypes.get(path.extname(String(fileName)).toLowerCase()) || null;
}

export function downloadContentPolicy(fileName) {
  const mimeType = canonicalUploadMime(fileName) || 'application/octet-stream';
  const disposition = mimeType === 'image/jpeg' || mimeType === 'image/png' ? 'inline' : 'attachment';
  return { mimeType, disposition };
}
