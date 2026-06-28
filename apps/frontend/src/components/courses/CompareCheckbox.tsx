'use client';

import { useCompareStore } from '@/store/compare.store';

type Course = { id: string; title: string; [key: string]: unknown };

export function CompareCheckbox({ course }: { course: Course }) {
  const { isSelected, toggle, isFull } = useCompareStore();
  const selected = isSelected(course.id);
  return (
    <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={selected}
        disabled={!selected && isFull()}
        onChange={() => toggle(course as any)}
        className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
        aria-label={`Compare ${course.title}`}
      />
      Compare
    </label>
  );
}
