import * as XLSX from 'xlsx';

/** Display headers; inspectAttendanceWorkbook aliases map these to studentCode/studentName/classCode/observedAt/sourceStatus. */
export const ATTENDANCE_IMPORT_TEMPLATE_HEADERS = [
  'Mã học sinh',
  'Họ tên',
  'Lớp',
  'Thời gian',
  'Trạng thái',
];

export const ATTENDANCE_IMPORT_TEMPLATE_EXAMPLE_ROWS = [
  ['HS001', 'Nguyễn Văn A', '6A1', '07:15', 'Có mặt'],
  ['HS002', 'Trần Thị B', '6A1', '07:22', 'Trễ'],
];

export const ATTENDANCE_IMPORT_TEMPLATE_INSTRUCTIONS = [
  ['File điểm danh mẫu — không dùng cho nhập danh sách học sinh.'],
  ['Cột gợi ý: Mã học sinh, Họ tên, Lớp, Thời gian, Trạng thái.'],
  ['Cần có Mã học sinh hoặc Họ tên. Hệ thống chỉ gợi ý mapping từ header; phải xác nhận trước khi công bố.'],
  ['Trạng thái ví dụ: Có mặt, Trễ, Vắng. Đây là dữ liệu minh họa, không phải học sinh thật.'],
];

export const ATTENDANCE_IMPORT_TEMPLATE_FILENAME = 'mau_nhap_diem_danh.xlsx';
export const ATTENDANCE_IMPORT_TEMPLATE_SHEET = 'diem_danh';
export const ATTENDANCE_IMPORT_TEMPLATE_INSTRUCTIONS_SHEET = 'huong_dan';

export function attendanceImportTemplateMatrix() {
  return [ATTENDANCE_IMPORT_TEMPLATE_HEADERS, ...ATTENDANCE_IMPORT_TEMPLATE_EXAMPLE_ROWS];
}

export function buildAttendanceImportTemplateWorkbook() {
  const workbook = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.aoa_to_sheet(attendanceImportTemplateMatrix());
  const instructionSheet = XLSX.utils.aoa_to_sheet(ATTENDANCE_IMPORT_TEMPLATE_INSTRUCTIONS);
  XLSX.utils.book_append_sheet(workbook, dataSheet, ATTENDANCE_IMPORT_TEMPLATE_SHEET);
  XLSX.utils.book_append_sheet(workbook, instructionSheet, ATTENDANCE_IMPORT_TEMPLATE_INSTRUCTIONS_SHEET);
  return workbook;
}

export function downloadAttendanceImportTemplate() {
  XLSX.writeFile(buildAttendanceImportTemplateWorkbook(), ATTENDANCE_IMPORT_TEMPLATE_FILENAME);
}
