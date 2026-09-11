export function normalizePickerSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesPickerSearch(haystack, query) {
  const needle = normalizePickerSearch(query);
  if (!needle) return true;
  const hay = normalizePickerSearch(haystack);
  return needle.split(' ').every((token) => hay.includes(token));
}

export function filterByPickerSearch(items, query, getHaystack) {
  const list = Array.isArray(items) ? items : [];
  const needle = normalizePickerSearch(query);
  if (!needle) return list;
  return list.filter((item) => matchesPickerSearch(getHaystack(item), needle));
}

export function personPickerHaystack(person, extra = '') {
  return [person?.name, person?.email, person?.departmentName, person?.positionName, extra]
    .filter(Boolean)
    .join(' ');
}
