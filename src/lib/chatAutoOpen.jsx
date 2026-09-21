import { createContext, useContext, useState } from 'react';
import { notificationOpensChat } from './chatNotificationOpen';

export { chatNotificationOpensThread, notificationOpensChat } from './chatNotificationOpen';

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
