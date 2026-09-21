import { anyApi } from 'convex/server';
import { DiscussionChatButton } from '../lib/DiscussionModal';

export function DutyChatButton({ dutyId, title }) {
  return (
    <DiscussionChatButton
      entityId={dutyId}
      title={title}
      listQuery={anyApi.dutyMessages.list}
      createMutation={anyApi.dutyMessages.create}
      idField="dutyId"
      titleField="dutyTitle"
      buttonTitle="Trao đổi công tác"
      contextText="Tin nhắn hiển thị cho người đã thấy công tác này."
      fallbackTitle="Công tác"
    />
  );
}
