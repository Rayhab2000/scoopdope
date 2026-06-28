'use client';

import { useBookmarksStore } from '@/store/bookmarks.store';

type Course = { id: string; title: string; [key: string]: unknown };

export function BookmarkButton({ course }: { course: Course }) {
  const { isBookmarked, addBookmark, removeBookmark } = useBookmarksStore();
  const bookmarked = isBookmarked(course.id);
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        bookmarked ? removeBookmark(course.id) : addBookmark(course as any);
      }}
      aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark course'}
      aria-pressed={bookmarked}
      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
    >
      <svg className={`w-4 h-4 ${bookmarked ? 'fill-blue-500 text-blue-500' : 'fill-none text-gray-400'}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
    </button>
  );
}
