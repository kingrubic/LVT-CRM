import { createContext, useContext } from 'react';

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
