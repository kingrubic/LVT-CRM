import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';

import {
  canPreviewWorkFile,
  shouldUseWorkFilePreviewSplit,
  spreadsheetPreviewFromArrayBuffer,
  WORK_FILE_PREVIEW_SPLIT_CLASS,
  WORK_FILE_PREVIEW_SPLIT_MEDIA,
  WORK_SPREADSHEET_PREVIEW_MAX_COLS,
  WORK_SPREADSHEET_PREVIEW_MAX_ROWS,
  workFilePreviewKind,
} from '../src/work/workFilePreview.js';

test('work file preview kinds include office files', () => {
  assert.equal(workFilePreviewKind('ke-hoach.pdf'), 'pdf');
  assert.equal(workFilePreviewKind('anh.PNG'), 'image');
  assert.equal(workFilePreviewKind('bao-cao.docx'), 'docx');
  assert.equal(workFilePreviewKind('diem.xlsx'), 'spreadsheet');
  assert.equal(workFilePreviewKind('cu.xls'), 'spreadsheet');
  assert.equal(workFilePreviewKind('ghi-chu.txt'), '');
  assert.equal(canPreviewWorkFile('bao-cao.docx'), true);
  assert.equal(canPreviewWorkFile('ghi-chu.txt'), false);
});

test('desktop work file preview splits at the web/mobile shell breakpoint', () => {
  assert.equal(WORK_FILE_PREVIEW_SPLIT_CLASS, 'work-file-preview-split');
  assert.equal(WORK_FILE_PREVIEW_SPLIT_MEDIA, '(min-width: 681px)');
  assert.equal(shouldUseWorkFilePreviewSplit(true), true);
  assert.equal(shouldUseWorkFilePreviewSplit(false), false);
});

test('spreadsheet preview renders cell text and truncates oversized sheets', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Họ tên', 'Điểm'],
      ['An', 8],
    ]),
    'Kết quả',
  );
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  const sheets = spreadsheetPreviewFromArrayBuffer(buffer);
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].name, 'Kết quả');
  assert.deepEqual(sheets[0].rows[0], ['Họ tên', 'Điểm']);
  assert.equal(sheets[0].rows[1][0], 'An');
  assert.equal(sheets[0].truncated, false);

  const wide = [Array.from({ length: WORK_SPREADSHEET_PREVIEW_MAX_COLS + 3 }, (_, index) => `c${index}`)];
  const tall = Array.from({ length: WORK_SPREADSHEET_PREVIEW_MAX_ROWS + 2 }, (_, index) => [`r${index}`]);
  const big = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(big, XLSX.utils.aoa_to_sheet([...wide, ...tall.slice(1)]), 'Lớn');
  const bigSheets = spreadsheetPreviewFromArrayBuffer(XLSX.write(big, { type: 'array', bookType: 'xlsx' }));
  assert.equal(bigSheets[0].rows[0].length, WORK_SPREADSHEET_PREVIEW_MAX_COLS);
  assert.equal(bigSheets[0].rows.length, WORK_SPREADSHEET_PREVIEW_MAX_ROWS);
  assert.equal(bigSheets[0].truncated, true);
});
