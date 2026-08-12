import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import {
  USER_IMPORT_HEADERS,
  USER_IMPORT_MESSAGES,
  assertImportFileMeta,
  rowsFromSheetMatrix,
} from './userImport.js';

export function buildUserImportTemplateWorkbook() {
  const sheet = XLSX.utils.aoa_to_sheet([
    USER_IMPORT_HEADERS,
    ['Nguyen Van A', 'a.nguyen@example.school', 'TOAN', 'GV', 'GVCN', 'Matkhau1'],
  ]);
  sheet['!cols'] = USER_IMPORT_HEADERS.map(() => ({ wch: 22 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'import_users');
  return workbook;
}

export function downloadUserImportTemplate() {
  const workbook = buildUserImportTemplateWorkbook();
  XLSX.writeFile(workbook, 'mau_nhap_nguoi_dung.xlsx');
}

export async function parseUserImportFile(file) {
  const meta = assertImportFileMeta(file);
  if (!meta.ok) {
    return { ok: false, message: meta.message, rows: [] };
  }
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { ok: false, message: USER_IMPORT_MESSAGES.invalidHeaders, rows: [] };
  }
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
    raw: false,
  });
  const parsed = rowsFromSheetMatrix(matrix);
  if (!parsed.headersOk) {
    return { ok: false, message: USER_IMPORT_MESSAGES.invalidHeaders, rows: [] };
  }
  return { ok: true, message: null, rows: parsed.rows };
}

export function downloadUserImportErrorPdf(errors, meta = {}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed = 60) => {
    if (y + needed > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Bao cao loi import nguoi dung', margin, y);
  y += 22;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const generatedAt = new Date().toLocaleString('vi-VN');
  doc.text(`Thoi gian: ${generatedAt}`, margin, y);
  y += 14;
  if (meta.fileName) {
    doc.text(`File: ${meta.fileName}`, margin, y);
    y += 14;
  }
  doc.text(`Tong so loi: ${errors.length}`, margin, y);
  y += 20;

  doc.setDrawColor(180);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  errors.forEach((error, index) => {
    ensureSpace(72);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const rowLabel = error.rowNumber > 0 ? `Dong ${error.rowNumber}` : 'Toan file';
    doc.text(`${index + 1}. ${rowLabel}`, margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const messageLines = doc.splitTextToSize(String(error.message || ''), maxWidth);
    doc.text(messageLines, margin, y);
    y += messageLines.length * 12 + 4;
    if (error.detail) {
      const detailLines = doc.splitTextToSize(`Chi tiet: ${error.detail}`, maxWidth);
      doc.text(detailLines, margin, y);
      y += detailLines.length * 12 + 10;
    } else {
      y += 8;
    }
  });

  doc.save(`bao_cao_loi_import_user_${Date.now()}.pdf`);
}
