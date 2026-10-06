import * as XLSX from 'xlsx';

/** Mẫu cố định: một file cho cả trường mỗi ngày. Tiêu đề phải khớp với convex/attendanceImportSheet.ts. */
export const ATTENDANCE_IMPORT_TEMPLATE_HEADERS = [
  'Mã HS',
  'Họ tên HS',
  'Mã lớp',
  'Tên lớp',
  'Thời gian có mặt',
  'Trạng thái',
];

export const ATTENDANCE_IMPORT_TEMPLATE_EXAMPLE_ROWS = [
  ['HS001', 'Nguyễn Văn A', '6A1', 'Lớp 6A1', '07:05', 'Có mặt'],
  ['HS002', 'Trần Thị B', '6A1', 'Lớp 6A1', '07:22', 'Trễ'],
  ['HS003', 'Lê Văn C', '6A2', 'Lớp 6A2', '', 'Vắng'],
];

export const ATTENDANCE_IMPORT_TEMPLATE_INSTRUCTIONS = [
  ['File điểm danh toàn trường — mỗi ngày một file, chọn ngày điểm danh trên phần mềm khi nhập.'],
  ['Giữ nguyên dòng tiêu đề: Mã HS, Họ tên HS, Mã lớp, Tên lớp, Thời gian có mặt, Trạng thái.'],
  ['Bắt buộc: Mã HS, Mã lớp, Trạng thái. Mã lớp phải trùng mã lớp trên phần mềm (ví dụ 6A1).'],
  ['Trạng thái chỉ nhận: Có mặt, Trễ, Vắng. Thời gian có mặt ghi giờ:phút (ví dụ 07:05), để trống nếu Vắng.'],
  ['Học sinh có trong danh sách lớp nhưng không có trong file sẽ được ghi “Vắng chờ xử lý”.'],
  ['Các dòng ví dụ là dữ liệu minh họa — xóa trước khi dùng.'],
];

export const ATTENDANCE_IMPORT_TEMPLATE_FILENAME = 'mau_diem_danh_toan_truong.xlsx';
export const ATTENDANCE_IMPORT_TEMPLATE_SHEET = 'diem_danh';
export const ATTENDANCE_IMPORT_TEMPLATE_INSTRUCTIONS_SHEET = 'huong_dan';

export function attendanceImportTemplateMatrix() {
  return [ATTENDANCE_IMPORT_TEMPLATE_HEADERS, ...ATTENDANCE_IMPORT_TEMPLATE_EXAMPLE_ROWS];
}

export function buildAttendanceImportTemplateWorkbook() {
  const workbook = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.aoa_to_sheet(attendanceImportTemplateMatrix());
  dataSheet['!cols'] = [{ wch: 12 }, { wch: 26 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 12 }];
  const instructionSheet = XLSX.utils.aoa_to_sheet(ATTENDANCE_IMPORT_TEMPLATE_INSTRUCTIONS);
  instructionSheet['!cols'] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(workbook, dataSheet, ATTENDANCE_IMPORT_TEMPLATE_SHEET);
  XLSX.utils.book_append_sheet(workbook, instructionSheet, ATTENDANCE_IMPORT_TEMPLATE_INSTRUCTIONS_SHEET);
  return workbook;
}

export function downloadAttendanceImportTemplate() {
  XLSX.writeFile(buildAttendanceImportTemplateWorkbook(), ATTENDANCE_IMPORT_TEMPLATE_FILENAME);
}
