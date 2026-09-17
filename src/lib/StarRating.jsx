/** @param {{ level?: number, max?: number }} props */
export default function StarRating({ level, max = 5 }) {
  const n = Math.min(max, Math.max(0, Number(level) || 0));
  return (
    <span className="star-rating" aria-label={`${n} trên ${max} sao`} title={`Cấp ${n}/${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < n ? 'star on' : 'star'}>★</span>
      ))}
    </span>
  );
}
