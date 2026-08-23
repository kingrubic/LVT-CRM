import { convexErrorText } from '../lib/appErrorMessage.js';

export const CAMERA_NAME_MATCH_UNCONFIRMED = 'CAMERA_NAME_MATCH_UNCONFIRMED';
export const CAMERA_NAME_AMBIGUOUS = 'CAMERA_NAME_AMBIGUOUS';
export const ATTENDANCE_REPLACE_MODE_REQUIRED = 'ATTENDANCE_REPLACE_MODE_REQUIRED';
export const REPLACE_MODE_SUPPLEMENT = 'supplement';
export const REPLACE_MODE_REPLACE = 'replace_camera_observations';
export const REPLACE_MODE_CANCEL = 'cancel';

const EXPLICIT_REPLACE_MODES = new Set([
  REPLACE_MODE_SUPPLEMENT,
  REPLACE_MODE_REPLACE,
  REPLACE_MODE_CANCEL,
]);

export function buildAttendanceValidateArgs({
  uploadId,
  sheetName,
  headerRowIndex,
  mapping,
  confirmNameMatches = false,
}) {
  const args = { uploadId, sheetName, headerRowIndex, mapping };
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
  const issues = result?.issues || [];
  if (issues.some((item) => item.code === CAMERA_NAME_AMBIGUOUS)) return false;
  return proposedUniqueNameMatches(result).length > 0
    || issues.some((item) => item.code === CAMERA_NAME_MATCH_UNCONFIRMED);
}

export function isAttendanceReplaceModeRequired(error) {
  return convexErrorText(error).includes(ATTENDANCE_REPLACE_MODE_REQUIRED);
}

export function attendanceReplaceModeChoices() {
  return [
    {
      replaceMode: REPLACE_MODE_SUPPLEMENT,
      label: 'Bổ sung',
      description: 'Chỉ điền bản ghi chưa xử lý hoặc chưa có dữ liệu.',
    },
    {
      replaceMode: REPLACE_MODE_REPLACE,
      label: 'Thay quan sát camera',
      description: 'Thay quan sát camera và giữ phân loại cùng chỉnh sửa của người.',
    },
    {
      replaceMode: REPLACE_MODE_CANCEL,
      label: 'Hủy',
      description: 'Không công bố file này.',
    },
  ];
}

export function buildAttendancePublishArgs({ uploadId, replaceMode }) {
  const args = { uploadId };
  if (EXPLICIT_REPLACE_MODES.has(replaceMode)) args.replaceMode = replaceMode;
  return args;
}
