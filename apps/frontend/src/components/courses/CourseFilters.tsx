import { LEVELS, CATEGORIES, LANGUAGES, DURATIONS, PRICE_RANGES, SORT_OPTIONS, type SortOption } from '@/app/courses/courses.config';

const cls = 'rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100';

type Props = {
  level: string; language: string; category: string;
  duration: string; price: string; sort: SortOption;
  onChange: (key: string, value: string) => void;
};

export function CourseFilters({ level, language, category, duration, price, sort, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-3">
      <select value={level} onChange={(e) => onChange('level', e.target.value)} className={cls} aria-label="Filter by level">
        <option value="">All Levels</option>
        {LEVELS.map((l) => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
      </select>
      <select value={language} onChange={(e) => onChange('language', e.target.value)} className={cls} aria-label="Filter by language">
        <option value="">All Languages</option>
        {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
      </select>
      <select value={category} onChange={(e) => onChange('category', e.target.value)} className={cls} aria-label="Filter by category">
        <option value="">All Categories</option>
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select value={duration} onChange={(e) => onChange('duration', e.target.value)} className={cls} aria-label="Filter by duration">
        <option value="">Any Duration</option>
        {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
      </select>
      <select value={price} onChange={(e) => onChange('price', e.target.value)} className={cls} aria-label="Filter by price">
        <option value="">Any Price</option>
        {PRICE_RANGES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      <select value={sort} onChange={(e) => onChange('sort', e.target.value)} className={cls} aria-label="Sort courses">
        {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    </div>
  );
}
