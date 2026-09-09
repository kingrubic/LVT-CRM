import * as XLSX from 'xlsx';

export const WORK_SPREADSHEET_PREVIEW_MAX_ROWS = 2000;
export const WORK_SPREADSHEET_PREVIEW_MAX_COLS = 40;

export function workFileExtension(fileName) {
  return String(fileName || '').trim().toLowerCase().split('.').pop() || '';
}

export function workFilePreviewKind(fileName) {
  const extension = workFileExtension(fileName);
  if (extension === 'pdf') return 'pdf';
  if (extension === 'png' || extension === 'jpg' || extension === 'jpeg') return 'image';
  if (extension === 'docx') return 'docx';
  if (extension === 'xlsx' || extension === 'xls') return 'spreadsheet';
  return '';
}

export function canPreviewWorkFile(fileName) {
  return Boolean(workFilePreviewKind(fileName));
}

export function spreadsheetPreviewFromArrayBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const names = workbook.SheetNames.length ? workbook.SheetNames : ['Sheet1'];
  return names.map((name) => {
    const sheet = workbook.Sheets[name] || {};
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    const truncatedRows = rawRows.length > WORK_SPREADSHEET_PREVIEW_MAX_ROWS;
    const slicedRows = truncatedRows
      ? rawRows.slice(0, WORK_SPREADSHEET_PREVIEW_MAX_ROWS)
      : rawRows;
    let truncatedCols = false;
    const rows = slicedRows.map((row) => {
      const cells = Array.isArray(row) ? row : [];
      if (cells.length > WORK_SPREADSHEET_PREVIEW_MAX_COLS) truncatedCols = true;
      return cells.slice(0, WORK_SPREADSHEET_PREVIEW_MAX_COLS).map((cell) => (
        cell == null ? '' : String(cell)
      ));
    });
    return {
      name,
      rows,
      truncated: truncatedRows || truncatedCols,
      totalRows: rawRows.length,
    };
  });
}
