import { convexErrorText } from '../lib/appErrorMessage.js';

export const CAMERA_NAME_MATCH_UNCONFIRMED = 'CAMERA_NAME_MATCH_UNCONFIRMED';
export const CAMERA_NAME_AMBIGUOUS = 'CAMERA_NAME_AMBIGUOUS';
export const ATTENDANCE_REPLACE_MODE_REQUIRED = 'ATTENDANCE_REPLACE_MODE_REQUIRED';
export const REPLACE_MODE_SUPPLEMENT = 'supplement';
export const REPLACE_MODE_REPLACE = 'replace_camera_observations';
export const REPLACE_MODE_CANCEL = 'cancel';
export const ATTENDANCE_IMPORT_MAX_BYTES = 4 * 1024 * 1024;

const EXPLICIT_REPLACE_MODES = new Set([
  REPLACE_MODE_SUPPLEMENT,
  REPLACE_MODE_REPLACE,
  REPLACE_MODE_CANCEL,
]);

export function buildAttendanceValidateArgs({ uploadId, confirmNameMatches = false }) {
  const args = { uploadId };
  if (confirmNameMatches) args.confirmNameMatches = true;
  return args;
}

export function buildConfirmedAttendanceValidateArgs(args) {
  return buildAttendanceValidateArgs({ ...args, confirmNameMatches: true });
}

export function proposedUniqueNameMatches(result) {
  return Array.isArray(result?.nameMatches) ? result.nameMatches : [];
}

export function canExplicitlyConfirmNameMatches(result) {
  if (!result?.unconfirmedNameCount) return false;
  const issues = result?.issues || [];
  if (issues.some((item) => item.code === CAMERA_NAME_AMBIGUOUS)) return false;
  return proposedUniqueNameMatches(result).length > 0;
}

export function isAttendanceReplaceModeRequired(error) {
  return convexErrorText(error).includes(ATTENDANCE_REPLACE_MODE_REQUIRED);
}

/** Lựa chọn khi có lớp đã có dữ liệu cho ngày này. Áp dụng cho từng lớp bị trùng; lớp chưa có dữ liệu luôn được công bố. */
export function attendanceReplaceModeChoices() {
  return [
    {
      replaceMode: REPLACE_MODE_SUPPLEMENT,
      label: 'Bổ sung',
      description: 'Chỉ ghi cho học sinh chưa có dữ liệu. Giữ nguyên dữ liệu và phân loại vắng đã có.',
    },
    {
      replaceMode: REPLACE_MODE_REPLACE,
      label: 'Ghi đè dữ liệu camera',
      description: 'Thay trạng thái camera bằng file mới. Phân loại của GVCN được giữ khi vẫn còn hợp lệ.',
    },
    {
      replaceMode: REPLACE_MODE_CANCEL,
      label: 'Bỏ qua lớp đã có dữ liệu',
      description: 'Chỉ công bố các lớp chưa có dữ liệu ngày này.',
    },
  ];
}

export function buildAttendancePublishArgs({ uploadId, replaceMode }) {
  const args = { uploadId };
  if (EXPLICIT_REPLACE_MODES.has(replaceMode)) args.replaceMode = replaceMode;
  return args;
}

/** Trạng thái hiển thị của một lớp trong bản xem trước. */
export function classPreviewState(row) {
  if (row.errorCount > 0) return { key: 'error', label: 'Có lỗi — sẽ bỏ qua' };
  if (row.unconfirmedNameCount > 0) return { key: 'confirm', label: 'Chờ xác nhận tên' };
  if (!row.publishable) return { key: 'error', label: 'Không có dòng hợp lệ' };
  if (row.alreadyPublished) return { key: 'existing', label: 'Đã có dữ liệu' };
  return { key: 'ready', label: 'Sẵn sàng' };
}

export function publishPlan(preview, replaceMode) {
  const publishable = (preview?.classes || []).filter((row) => row.publishable);
  const conflicts = publishable.filter((row) => row.alreadyPublished);
  const willPublish = replaceMode === REPLACE_MODE_CANCEL ? publishable.filter((row) => !row.alreadyPublished) : publishable;
  return {
    publishable,
    conflicts,
    willPublish,
    needsReplaceMode: conflicts.length > 0,
    missingStudents: willPublish.reduce((sum, row) => sum + (row.missingCount || 0), 0),
    skipped: (preview?.classes || []).filter((row) => !row.publishable),
  };
}
