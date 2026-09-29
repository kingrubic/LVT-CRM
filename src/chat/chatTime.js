const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

function vnParts(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function chatDayKey(value) {
  const parts = vnParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function chatDayLabel(value, now = Date.now()) {
  const key = chatDayKey(value);
  if (key === chatDayKey(now)) return 'Hôm nay';
  const yesterday = new Date(now);
  yesterday.setTime(now - 24 * 60 * 60 * 1000);
  if (key === chatDayKey(yesterday.getTime())) return 'Hôm qua';
  const parts = vnParts(value);
  if (vnParts(now).year !== parts.year) return `${parts.day}/${parts.month}/${parts.year}`;
  return `${parts.day}/${parts.month}`;
}

export function formatChatListTime(value, now = Date.now()) {
  const timestamp = Number(value || 0);
  if (!timestamp) return '';
  const delta = now - timestamp;
  if (delta < 60 * 1000) return 'Vừa xong';
  const today = vnParts(now);
  const then = vnParts(timestamp);
  const sameDay = today.year === then.year && today.month === then.month && today.day === then.day;
  if (sameDay) {
    if (delta < 60 * 60 * 1000) return `${Math.max(1, Math.floor(delta / 60000))} phút`;
    return `${Math.max(1, Math.floor(delta / 3600000))} giờ`;
  }
  if (chatDayLabel(timestamp, now) === 'Hôm qua') return 'Hôm qua';
  if (today.year !== then.year) return `${then.day}/${then.month}/${then.year}`;
  return `${then.day}/${then.month}`;
}

export function formatChatClock(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: VN_TIME_ZONE,
  }).format(new Date(value));
}
