import { createContext, useContext, useState } from 'react';

const ChatAutoOpenContext = createContext(null);

let claimedToken = null;

export function ChatAutoOpenProvider({ target = null, children }) {
  return (
    <ChatAutoOpenContext.Provider value={target}>
      {children}
    </ChatAutoOpenContext.Provider>
  );
}

export function useChatAutoOpen() {
  return useContext(ChatAutoOpenContext);
}

export function claimChatAutoOpen(token, entityId) {
  if (!token || !entityId) return false;
  if (claimedToken === token) return false;
  claimedToken = token;
  return true;
}

export function chatNotificationOpensThread(target, { idField, entityId }) {
  if (!target?.openChat || !entityId) return false;
  if (String(target.sourceId) !== String(entityId)) return false;
  if (idField === 'documentId') return target.sourceType === 'work_chat';
  if (idField === 'dutyId') return target.sourceType === 'duty_chat';
  return false;
}

export function notificationOpensChat(focusTarget, sourceType) {
  return Boolean(
    focusTarget?.openChat
    && focusTarget?.sourceType === sourceType
    && focusTarget?.sourceId,
  );
}

/** Open Trao đổi from the work/duty view so it does not depend on the card button being mounted. */
export function useNotificationChatModal(focusTarget, sourceType) {
  const [dismissedToken, setDismissedToken] = useState(null);
  const entityId = notificationOpensChat(focusTarget, sourceType)
    ? String(focusTarget.sourceId)
    : '';
  const open = Boolean(entityId) && dismissedToken !== focusTarget?.token;
  return {
    open,
    entityId: open ? entityId : '',
    close: () => setDismissedToken(focusTarget?.token ?? null),
  };
}
