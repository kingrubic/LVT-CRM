import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

const STATUS_LABELS = {
  present: 'Có mặt',
  late: 'Đi trễ',
  absent_excused: 'Vắng có phép',
  absent_unexcused: 'Vắng không phép',
  absent_pending: 'Vắng chờ xử lý',
  no_data: 'Chưa có dữ liệu',
  exempt: 'Miễn',
};

export function downloadAttendanceXlsx(payload) {
  const header = [
    payload.title,
    `Lớp: ${payload.className || 'Theo phạm vi'}`,
    `Năm học: ${payload.schoolYearName || ''}`,
    `Từ ${payload.from} đến ${payload.to}`,
    `Tạo lúc: ${new Date(payload.generatedAt).toISOString()}`,
    `Người tạo: ${payload.generatedByName || payload.generatedByUserId}`,
  ];
  const rows = [
    ['Ngày', 'Mã HS', 'Học sinh', 'Trạng thái hiệu lực', 'Quan sát camera'],
    ...payload.rows.map((row) => [
      row.attendanceDate,
      row.studentId,
      '',
      STATUS_LABELS[row.effectiveStatus] || row.effectiveStatus,
      row.rawObservation,
    ]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet([[header.join(' | ')], ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'diem_danh');
  XLSX.writeFile(workbook, `bao_cao_diem_danh_${payload.from}_${payload.to}.xlsx`);
}

export function downloadAttendancePdf(payload) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  let y = margin;
  doc.setFontSize(14);
  doc.text(payload.title, margin, y);
  y += 22;
  doc.setFontSize(10);
  [
    `${payload.schoolName} — ${payload.className || ''} — ${payload.schoolYearName || ''}`,
    `Khoảng: ${payload.from} → ${payload.to}`,
    `Tạo: ${new Date(payload.generatedAt).toLocaleString('vi-VN')} bởi ${payload.generatedByName || payload.generatedByUserId}`,
    `Tỷ lệ chuyên cần (không tính miễn/chưa có dữ liệu): ${(payload.attendanceRate * 100).toFixed(1)}%`,
  ].forEach((line) => {
    doc.text(line, margin, y);
    y += 16;
  });
  payload.rows.slice(0, 40).forEach((row) => {
    if (y > 760) {
      doc.addPage();
      y = margin;
    }
    doc.text(
      `${row.attendanceDate}  ${row.studentId}  ${STATUS_LABELS[row.effectiveStatus] || row.effectiveStatus}`,
      margin,
      y,
    );
    y += 14;
  });
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.text(`Trang ${i}/${pages}`, 500, 820);
  }
  doc.save(`bao_cao_diem_danh_${payload.from}_${payload.to}.pdf`);
}
