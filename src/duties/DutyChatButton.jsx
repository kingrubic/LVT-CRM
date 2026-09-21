import { anyApi } from 'convex/server';
import DiscussionModal, { DiscussionChatButton } from '../lib/DiscussionModal';

const DUTY_CHAT = {
  listQuery: anyApi.dutyMessages.list,
  createMutation: anyApi.dutyMessages.create,
  recallMutation: anyApi.dutyMessages.recall,
  idField: 'dutyId',
  titleField: 'dutyTitle',
  contextText: 'Tin nhắn hiển thị cho người đã thấy công tác này.',
  fallbackTitle: 'Công tác',
};

export function DutyChatButton({ dutyId, title }) {
  return (
    <DiscussionChatButton
      entityId={dutyId}
      title={title}
      buttonTitle="Trao đổi công tác"
      {...DUTY_CHAT}
    />
  );
}

export function DutyChatModal({ dutyId, title, onClose }) {
  if (!dutyId) return null;
  return (
    <DiscussionModal
      entityId={dutyId}
      title={title}
      onClose={onClose}
      {...DUTY_CHAT}
    />
  );
}
