export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs px-3 py-1">
      {label}
      <button onClick={onRemove} aria-label={`Remove ${label} filter`} className="hover:text-blue-900 dark:hover:text-blue-100">✕</button>
    </span>
  );
}
