import Link from 'next/link';
import Image from 'next/image';
import { BookmarkButton } from './BookmarkButton';
import { CompareCheckbox } from './CompareCheckbox';

export type Course = {
  id: string;
  title: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  language?: string;
  category?: string;
  durationHours?: number;
  price?: number;
  rating?: number;
  enrollments?: number;
  description?: string;
  thumbnailUrl?: string;
};

export function CourseCard({ course, observerRef }: { course: Course; observerRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={observerRef}
      className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900 flex flex-col gap-2"
      role="gridcell"
    >
      {course.thumbnailUrl && (
        <div className="relative w-full h-36">
          <Image
            src={course.thumbnailUrl}
            alt={course.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
            loading="lazy"
          />
        </div>
      )}
      <div className="p-5 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-snug">{course.title}</h2>
          <BookmarkButton course={course} />
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span className="capitalize">{course.level}</span>
          {course.language && <><span>·</span><span className="uppercase">{course.language}</span></>}
          {course.category && <><span>·</span><span>{course.category}</span></>}
          {course.durationHours != null && <><span>·</span><span>{course.durationHours}h</span></>}
          {course.rating != null && <><span>·</span><span className="text-yellow-500">★ {course.rating.toFixed(1)}</span></>}
        </div>
        {course.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{course.description}</p>
        )}
        <div className="flex items-center justify-between mt-auto pt-2">
          <CompareCheckbox course={course} />
          {course.price != null && (
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {course.price === 0 ? 'Free' : `$${course.price}`}
            </span>
          )}
          <Link href={`/courses/${course.id}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline ml-auto">
            View →
          </Link>
        </div>
      </div>
    </div>
  );
}
