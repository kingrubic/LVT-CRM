import * as XLSX from 'xlsx';

export const DUTY_IMPORT_HEADERS = [
  'ten_cong_tac',
  'noi_dung',
  'dia_diem',
  'ngay_bat_dau',
  'gio_bat_dau',
  'ngay_ket_thuc',
  'gio_ket_thuc',
  'ca_ngay',
  'ma_phong_ban',
  'email_tham_gia',
  'thanh_phan_khac',
];

export function buildDutyImportTemplateWorkbook() {
  const sheet = XLSX.utils.aoa_to_sheet([
    [...DUTY_IMPORT_HEADERS],
    [
      'Hop to chuyen mon',
      'Noi dung hop to',
      'Hoi truong',
      '2026-09-15',
      '08:00',
      '2026-09-15',
      '11:00',
      '0',
      'TOAN, VAN',
      'a.nguyen@example.school',
      '',
    ],
    [
      'Truc le khai giang',
      'Truc le toan truong',
      'San truong',
      '15/09/2026',
      '',
      '',
      '',
      '1',
      'TOAN',
      '',
      '',
    ],
    [
      'Tiep doan so',
      'Lam viec voi doan kiem tra',
      'Phong hop BGH',
      '2026-09-16',
      '14:00',
      '2026-09-16',
      '16:00',
      '0',
      '',
      '',
      'Doan So GD',
    ],
  ]);
  sheet['!cols'] = DUTY_IMPORT_HEADERS.map(() => ({ wch: 20 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'import_cong_tac');
  return workbook;
}

export function downloadDutyImportTemplate() {
  const workbook = buildDutyImportTemplateWorkbook();
  XLSX.writeFile(workbook, 'mau_nhap_cong_tac.xlsx');
}
