import { useState } from 'react';
import { filterByPickerSearch, personPickerHaystack } from './pickerSearch';

function MultiCheckList({ options, values, onChange, getLabel, emptyText = 'Không có lựa chọn' }) {
  const selected = new Set(values || []);
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };
  if (!options?.length) return <p className="muted multi-empty">{emptyText}</p>;
  return (
    <div className="multi-check-list">
      {options.map((item) => {
        const id = item._id;
        const label = getLabel ? getLabel(item) : item.name;
        return (
          <label key={id} className="multi-check-item">
            <input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} />
            <span>{label}</span>
          </label>
        );
      })}
    </div>
  );
}

export default function CollapsibleMultiCheckList({
  title,
  options,
  values,
  onChange,
  getLabel = (item) => item.name,
  emptyText,
  searchPlaceholder = 'Tìm…',
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectedCount = values?.length || 0;
  const filtered = filterByPickerSearch(options || [], search, (item) => personPickerHaystack(item, getLabel ? getLabel(item) : item.name));
  return (
    <div className={`multi-check-group ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="multi-check-toggle"
        onClick={() => {
          setOpen((current) => {
            const next = !current;
            if (!next) setSearch('');
            return next;
          });
        }}
        aria-expanded={open}
      >
        <span>{title}</span>
        <span className="multi-check-summary">
          {selectedCount ? `${selectedCount} đã chọn` : 'Chưa chọn'}
          <span className="multi-check-chevron" aria-hidden="true">⌄</span>
        </span>
      </button>
      {open ? (
        <div className="multi-check-panel">
          {options?.length ? (
            <input
              autoFocus
              className="multi-check-search"
              type="search"
              value={search}
              autoComplete="off"
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.preventDefault();
              }}
            />
          ) : null}
          <MultiCheckList
            options={filtered}
            values={values}
            onChange={onChange}
            getLabel={getLabel}
            emptyText={search.trim() ? 'Không tìm thấy kết quả phù hợp.' : emptyText}
          />
        </div>
      ) : null}
    </div>
  );
}
