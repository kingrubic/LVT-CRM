import { anyApi } from 'convex/server';
import DiscussionModal, { DiscussionChatButton } from '../lib/DiscussionModal';

const WORK_CHAT = {
  listQuery: anyApi.workMessages.list,
  createMutation: anyApi.workMessages.create,
  idField: 'documentId',
  titleField: 'documentTitle',
  contextText: 'Tin nhắn hiển thị cho người đã thấy công việc này.',
  fallbackTitle: 'Công việc',
};

export function WorkChatButton({ documentId, title }) {
  return (
    <DiscussionChatButton
      entityId={documentId}
      title={title}
      buttonTitle="Trao đổi công việc"
      {...WORK_CHAT}
    />
  );
}

export default function WorkTaskChatModal({ documentId, title, onClose }) {
  if (!documentId) return null;
  return (
    <DiscussionModal
      entityId={documentId}
      title={title}
      onClose={onClose}
      {...WORK_CHAT}
    />
  );
}
