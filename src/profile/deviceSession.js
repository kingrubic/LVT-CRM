/** Parse a browser user-agent into Telegram-like device labels (no geo/IP APIs). */
export function describeWebDevice(userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  const ua = String(userAgent || '');
  let deviceName = 'Trình duyệt Web';
  if (/iPhone/i.test(ua)) deviceName = 'iPhone';
  else if (/iPad/i.test(ua)) deviceName = 'iPad';
  else if (/Android/i.test(ua)) deviceName = 'Android';
  else if (/Macintosh|Mac OS X/i.test(ua)) deviceName = 'Mac';
  else if (/Windows/i.test(ua)) deviceName = 'Windows PC';
  else if (/Linux/i.test(ua)) deviceName = 'Linux';

  let browser = 'Trình duyệt';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';

  return {
    deviceName,
    platformLabel: `CRM Lê Văn Tám Web · ${browser}`,
    clientKind: 'web',
    appVersion: undefined,
    userAgent: ua.slice(0, 300),
  };
}

export function formatSessionActiveAt(timestamp, now = Date.now()) {
  if (!timestamp) return '—';
  const diff = Math.max(0, now - Number(timestamp));
  if (diff < 2 * 60 * 1000) return 'trực tuyến';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days === 1) {
    const d = new Date(timestamp);
    return `${pad(d.getHours())}:${pad(d.getMinutes())} hôm qua`;
  }
  if (days < 7) return `${days} ngày trước`;
  const d = new Date(timestamp);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

export function clientKindIcon(kind) {
  if (kind === 'android') return '🤖';
  if (kind === 'ios') return '📱';
  if (kind === 'web') return '💻';
  return '📟';
}
