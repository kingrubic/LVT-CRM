import { jsPDF } from 'jspdf';

import { ATTENDANCE_PDF_LAYOUT, VIETNAMESE_PDF_FONT } from './homeroomExport.js';
import { loadVietnamesePdfFontBytes } from './vietnamesePdfFont.js';

const DEFAULT_STATUS_LABELS = {
  present: 'Có mặt',
  late: 'Đi trễ',
  absent_excused: 'Vắng có phép',
  absent_unexcused: 'Vắng không phép',
  absent_pending: 'Vắng chờ xử lý',
  no_data: 'Chưa có dữ liệu',
  exempt: 'Miễn',
};

export function normalizePdfText(value) {
  return String(value ?? '').normalize('NFC');
}

function bytesToVfsString(bytes) {
  let binary = '';
  const step = 8192;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return binary;
}

function applyVietnamesePdfFont(doc) {
  if (!doc.existsFileInVFS(VIETNAMESE_PDF_FONT.fileName)) {
    doc.addFileToVFS(VIETNAMESE_PDF_FONT.fileName, bytesToVfsString(loadVietnamesePdfFontBytes()));
    doc.addFont(VIETNAMESE_PDF_FONT.fileName, VIETNAMESE_PDF_FONT.family, VIETNAMESE_PDF_FONT.style);
  }
  doc.setFont(VIETNAMESE_PDF_FONT.family, VIETNAMESE_PDF_FONT.style);
}

function createLayoutState(doc) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = ATTENDANCE_PDF_LAYOUT.margin;
  return {
    pageWidth,
    pageHeight,
    margin,
    contentWidth: pageWidth - margin * 2,
    contentRight: pageWidth - margin,
    footerTop: pageHeight - ATTENDANCE_PDF_LAYOUT.footerBand,
    minX: margin,
    maxX: margin,
    visibleTexts: [],
    wrappedLineCount: 0,
    tableHeaderPages: [],
    rowCount: 0,
    pageCount: 1,
    footers: [],
    fontFamily: VIETNAMESE_PDF_FONT.family,
  };
}

function trackBounds(layout, x, width, align) {
  if (align === 'right') {
    layout.minX = Math.min(layout.minX, x - width);
    layout.maxX = Math.max(layout.maxX, x);
    return;
  }
  layout.minX = Math.min(layout.minX, x);
  layout.maxX = Math.max(layout.maxX, x + width);
}

function drawText(doc, layout, text, x, y, options = {}) {
  const lines = (Array.isArray(text) ? text : [text]).map((line) => normalizePdfText(line));
  applyVietnamesePdfFont(doc);
  if (options.fontSize) doc.setFontSize(options.fontSize);
  const align = options.align;
  for (const line of lines) {
    if (line) layout.visibleTexts.push(line);
    trackBounds(layout, x, line ? doc.getTextWidth(line) : 0, align);
  }
  if (align) {
    doc.text(lines, x, y, { align });
  } else {
    doc.text(lines, x, y);
  }
  return lines;
}

function wrapText(doc, layout, text, width) {
  applyVietnamesePdfFont(doc);
  const wrapped = doc.splitTextToSize(normalizePdfText(text), width);
  const lines = Array.isArray(wrapped) ? wrapped : [String(wrapped)];
  if (lines.length > 1) layout.wrappedLineCount += lines.length;
  return lines;
}

function columnXs(layout) {
  const { date, code, name } = ATTENDANCE_PDF_LAYOUT.columns;
  return {
    date: layout.margin,
    code: layout.margin + date,
    name: layout.margin + date + code,
    status: layout.margin + date + code + name,
  };
}

function drawTableHeader(doc, layout, y) {
  const xs = columnXs(layout);
  const cols = ATTENDANCE_PDF_LAYOUT.columns;
  applyVietnamesePdfFont(doc);
  doc.setFillColor(36, 55, 86);
  doc.rect(layout.margin, y - 13, layout.contentWidth, 20, 'F');
  doc.setTextColor(255, 255, 255);
  const headers = [
    ['Ngày', xs.date + 4, cols.date - 8],
    ['Mã HS', xs.code + 4, cols.code - 8],
    ['Học sinh', xs.name + 4, cols.name - 8],
    ['Trạng thái', xs.status + 4, cols.status - 8],
  ];
  for (const [label, x] of headers) {
    drawText(doc, layout, label, x, y, { fontSize: ATTENDANCE_PDF_LAYOUT.tableSize });
  }
  doc.setTextColor(32, 32, 32);
  layout.tableHeaderPages.push(doc.getNumberOfPages());
  return y + 14;
}

/**
 * @param {import('jspdf').jsPDF} doc
 * @param {ReturnType<typeof createLayoutState>} layout
 * @param {number} y
 * @param {number} needed
 * @param {(nextY: number) => number} [onNewPage]
 */
function ensureSpace(doc, layout, y, needed, onNewPage) {
  if (y + needed <= layout.footerTop) return y;
  doc.addPage();
  applyVietnamesePdfFont(doc);
  let nextY = layout.margin;
  if (onNewPage) nextY = onNewPage(nextY);
  return nextY;
}

/**
 * @param {object} payload
 * @param {{ statusLabel?: (status: string) => string }} [options]
 */
export function buildAttendancePdf(payload, options = {}) {
  const statusLabel = options.statusLabel || ((status) => DEFAULT_STATUS_LABELS[status] || status);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  applyVietnamesePdfFont(doc);
  const layout = createLayoutState(doc);
  let y = layout.margin;

  const titleLines = wrapText(doc, layout, payload.title || '', layout.contentWidth);
  y = ensureSpace(doc, layout, y, titleLines.length * 20);
  drawText(doc, layout, titleLines, layout.margin, y, { fontSize: ATTENDANCE_PDF_LAYOUT.titleSize });
  y += titleLines.length * 20 + 6;

  const meta = [
    [payload.schoolName, payload.className, payload.schoolYearName].filter(Boolean).join(' — '),
    `Khoảng: ${payload.from} đến ${payload.to}`,
    `Tạo: ${new Date(payload.generatedAt).toLocaleString('vi-VN')} bởi ${payload.generatedByName || payload.generatedByUserId}`,
    `Tỷ lệ chuyên cần (không tính miễn/chưa có dữ liệu): ${((Number(payload.attendanceRate) || 0) * 100).toFixed(1)}%`,
  ];
  for (const line of meta) {
    const wrapped = wrapText(doc, layout, line, layout.contentWidth);
    y = ensureSpace(doc, layout, y, wrapped.length * ATTENDANCE_PDF_LAYOUT.metaGap);
    drawText(doc, layout, wrapped, layout.margin, y, { fontSize: ATTENDANCE_PDF_LAYOUT.metaSize });
    y += wrapped.length * ATTENDANCE_PDF_LAYOUT.metaGap;
  }
  y += 12;

  y = ensureSpace(doc, layout, y, 36, (nextY) => drawTableHeader(doc, layout, nextY));
  y = drawTableHeader(doc, layout, y);

  const rows = payload.rows || [];
  layout.rowCount = rows.length;
  const xs = columnXs(layout);
  const cols = ATTENDANCE_PDF_LAYOUT.columns;

  for (const row of rows) {
    const cells = [
      { text: row.attendanceDate, x: xs.date + 4, width: cols.date - 8 },
      { text: row.studentCode, x: xs.code + 4, width: cols.code - 8 },
      { text: row.fullName, x: xs.name + 4, width: cols.name - 8 },
      { text: statusLabel(row.effectiveStatus), x: xs.status + 4, width: cols.status - 8 },
    ].map((cell) => ({
      ...cell,
      lines: wrapText(doc, layout, cell.text, cell.width),
    }));
    const lineCount = Math.max(...cells.map((cell) => cell.lines.length), 1);
    const rowHeight = lineCount * ATTENDANCE_PDF_LAYOUT.tableLineHeight + 8;
    y = ensureSpace(doc, layout, y, rowHeight, (nextY) => drawTableHeader(doc, layout, nextY));
    for (const cell of cells) {
      drawText(doc, layout, cell.lines, cell.x, y, { fontSize: ATTENDANCE_PDF_LAYOUT.tableSize });
    }
    y += rowHeight;
    doc.setDrawColor(214, 218, 224);
    doc.line(layout.margin, y - 5, layout.contentRight, y - 5);
  }

  const pageCount = doc.getNumberOfPages();
  const footers = [];
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    applyVietnamesePdfFont(doc);
    doc.setFontSize(ATTENDANCE_PDF_LAYOUT.footerSize);
    doc.setTextColor(90, 96, 105);
    const label = `Trang ${page}/${pageCount}`;
    footers.push(label);
    drawText(doc, layout, label, layout.contentRight, layout.pageHeight - 22, {
      fontSize: ATTENDANCE_PDF_LAYOUT.footerSize,
      align: 'right',
    });
  }
  doc.setTextColor(32, 32, 32);
  applyVietnamesePdfFont(doc);

  layout.pageCount = pageCount;
  layout.footers = footers;
  return {
    doc,
    bytes: doc.output('arraybuffer'),
    layout,
  };
}

/**
 * @param {object} payload
 * @param {{ statusLabel?: (status: string) => string }} [options]
 */
export function createAttendancePdf(payload, options) {
  return buildAttendancePdf(payload, options).bytes;
}

/**
 * @param {object} payload
 * @param {{ statusLabel?: (status: string) => string }} [options]
 */
export function downloadAttendancePdf(payload, options) {
  const { doc } = buildAttendancePdf(payload, options);
  doc.save(`bao_cao_diem_danh_${payload.from}_${payload.to}.pdf`);
}
