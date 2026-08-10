export async function openNotification(item, markRead, onOpen) {
  onOpen?.(item);
  if (item.read) return null;
  try {
    await markRead({ notificationKey: item.key });
    return null;
  } catch (error) {
    return error;
  }
}
