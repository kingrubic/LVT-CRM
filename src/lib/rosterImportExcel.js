import * as XLSX from 'xlsx';

export const ROSTER_IMPORT_HEADERS = [
  'ma_hoc_sinh',
  'ho_ten',
  'ngay_sinh',
  'gioi_tinh',
  'so_thu_tu',
  'dien_thoai_hoc_sinh',
  'ho_ten_cha',
  'dien_thoai_cha',
  'ho_ten_me',
  'dien_thoai_me',
  'ho_ten_nguoi_giam_ho',
  'dien_thoai_nguoi_giam_ho',
  'dien_uu_tien',
  'dan_toc',
  'hoan_canh_kho_khan',
  'ghi_chu',
];

export function downloadRosterImportTemplate() {
  const sheet = XLSX.utils.aoa_to_sheet([
    [...ROSTER_IMPORT_HEADERS],
    [
      'HS001',
      'Nguyễn Văn A',
      '2013-09-12',
      'nam',
      '1',
      '0912345678',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'danh_sach_hoc_sinh');
  XLSX.writeFile(workbook, 'mau_nhap_hoc_sinh.xlsx');
}
