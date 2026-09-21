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
