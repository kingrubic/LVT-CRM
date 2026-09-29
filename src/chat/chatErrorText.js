import { convexErrorText } from '../lib/appErrorMessage';

export function chatErrorText(error) {
  const raw = convexErrorText(error);
  if (raw.includes('GROUP_NAME_REQUIRED')) return 'Vui lòng nhập tên nhóm.';
  if (raw.includes('GROUP_NAME_TOO_LONG')) return 'Tên nhóm tối đa 80 ký tự.';
  if (raw.includes('GROUP_MEMBERS_REQUIRED')) return 'Hãy chọn ít nhất một thành viên.';
  if (raw.includes('GROUP_TOO_MANY_MEMBERS')) return 'Nhóm tối đa 100 thành viên.';
  if (raw.includes('GROUP_MEMBER_INVALID')) return 'Có thành viên không còn hoạt động.';
  if (raw.includes('GROUP_NOT_FOUND')) return 'Nhóm không còn tồn tại.';
  if (
    raw.includes('GROUP_FORBIDDEN')
    || raw.includes('GROUP_CHAT_FORBIDDEN')
    || raw.includes('WORK_CHAT_FORBIDDEN')
    || raw.includes('DUTY_CHAT_FORBIDDEN')
  ) {
    return 'Bạn không có quyền với cuộc trò chuyện này.';
  }
  if (raw.includes('CHAT_EMPTY')) return 'Vui lòng nhập nội dung tin nhắn.';
  if (raw.includes('CHAT_TOO_LONG')) return 'Tin nhắn quá dài (tối đa 4000 ký tự).';
  if (raw.includes('RECALL_TOO_LATE')) return 'Đã quá 15 phút, không thể thu hồi tin nhắn này.';
  if (raw.includes('RECALL_FORBIDDEN')) return 'Bạn chỉ có thể thu hồi tin nhắn của mình.';
  return 'Không thực hiện được. Vui lòng thử lại.';
}
