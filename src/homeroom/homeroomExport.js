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

export function attendanceStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export function formatAttendanceStudentLabel(row) {
  const code = String(row?.studentCode || '').trim();
  const name = String(row?.fullName || '').trim();
  return [code, name].filter(Boolean).join(' ');
}

export function buildAttendanceReportVisibleMatrix(days) {
  return [
    ['Ngày', 'Học sinh', 'Trạng thái'],
    ...(days || []).map((row) => [
      row.attendanceDate,
      formatAttendanceStudentLabel(row),
      attendanceStatusLabel(row.effectiveStatus),
    ]),
  ];
}

export function buildAttendanceXlsxMatrix(payload) {
  const header = [
    payload.title,
    `Lớp: ${payload.className || 'Theo phạm vi'}`,
    `Năm học: ${payload.schoolYearName || ''}`,
    `Từ ${payload.from} đến ${payload.to}`,
    `Tạo lúc: ${new Date(payload.generatedAt).toISOString()}`,
    `Người tạo: ${payload.generatedByName || payload.generatedByUserId}`,
  ];
  return [
    [header.join(' | ')],
    ['Ngày', 'Mã HS', 'Học sinh', 'Trạng thái hiệu lực', 'Quan sát camera'],
    ...(payload.rows || []).map((row) => [
      row.attendanceDate,
      row.studentCode,
      row.fullName,
      attendanceStatusLabel(row.effectiveStatus),
      row.rawObservation,
    ]),
  ];
}

export function buildAttendancePdfLines(payload) {
  return [
    payload.title,
    `${payload.schoolName} — ${payload.className || ''} — ${payload.schoolYearName || ''}`,
    `Khoảng: ${payload.from} → ${payload.to}`,
    `Tạo: ${new Date(payload.generatedAt).toLocaleString('vi-VN')} bởi ${payload.generatedByName || payload.generatedByUserId}`,
    `Tỷ lệ chuyên cần (không tính miễn/chưa có dữ liệu): ${(payload.attendanceRate * 100).toFixed(1)}%`,
    ...(payload.rows || []).slice(0, 40).map((row) =>
      `${row.attendanceDate}  ${row.studentCode}  ${row.fullName}  ${attendanceStatusLabel(row.effectiveStatus)}`,
    ),
  ];
}

export function downloadAttendanceXlsx(payload) {
  const sheet = XLSX.utils.aoa_to_sheet(buildAttendanceXlsxMatrix(payload));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'diem_danh');
  XLSX.writeFile(workbook, `bao_cao_diem_danh_${payload.from}_${payload.to}.xlsx`);
}

export function downloadAttendancePdf(payload) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  let y = margin;
  const lines = buildAttendancePdfLines(payload);
  const metaLines = lines.slice(1, 5);
  const bodyLines = lines.slice(5);
  doc.setFontSize(14);
  doc.text(lines[0], margin, y);
  y += 22;
  doc.setFontSize(10);
  metaLines.forEach((line) => {
    doc.text(line, margin, y);
    y += 16;
  });
  bodyLines.forEach((line) => {
    if (y > 760) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
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
