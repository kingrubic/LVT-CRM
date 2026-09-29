export function threadKeyFor(kind, entityId) {
  return `${kind}:${String(entityId || '')}`;
}

export function parseThreadKey(value) {
  const raw = String(value || '');
  const index = raw.indexOf(':');
  if (index <= 0) return null;
  const kind = raw.slice(0, index);
  const entityId = raw.slice(index + 1);
  if (!entityId || (kind !== 'work' && kind !== 'duty' && kind !== 'group')) return null;
  return { kind, entityId };
}
