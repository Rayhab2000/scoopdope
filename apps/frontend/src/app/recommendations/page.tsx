'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { ProtectedRoute } from '@/components/ProtectedRoute';

interface Recommendation {
  id: string;
  title: string;
  description: string;
  level: string;
  skills: string[];
  durationHours: number;
  thumbnailUrl: string | null;
  score: number;
  matchReasons: string[];
  averageRating: number | null;
}

function SkeletonCard() {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-900 animate-pulse">
      <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-3" />
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full mb-1" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-4/5" />
    </div>
  );
}

export default function RecommendationsPage() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get('/v1/recommendations?limit=50');
        setRecommendations(data.data ?? []);
      } catch {
        setError('Failed to load recommendations. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  return (
    <ProtectedRoute>
      <main className="max-w-5xl mx-auto p-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Recommended Courses
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Personalized suggestions based on your learning history and preferences
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-700 dark:bg-red-900/20">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : recommendations.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            <p className="text-lg">No recommendations yet.</p>
            <p className="mt-1 text-sm">
              Enroll in some courses to get personalized suggestions.
            </p>
            <Link
              href="/courses"
              className="mt-4 inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Browse Courses
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Showing {recommendations.length} recommendation{recommendations.length !== 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recommendations.map((course) => (
                <Link
                  key={course.id}
                  href={`/courses/${course.id}`}
                  className="block rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {course.title}
                    </h2>
                    <span className="text-xs font-mono text-gray-400 ml-2 shrink-0">
                      {Math.round(course.score * 100)}%
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                    {course.description}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="capitalize px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">
                      {course.level}
                    </span>
                    {course.durationHours > 0 && (
                      <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                        {course.durationHours}h
                      </span>
                    )}
                    {course.skills?.slice(0, 3).map((s) => (
                      <span
                        key={s}
                        className="px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300"
                      >
                        {s}
                      </span>
                    ))}
                  </div>

                  {course.matchReasons?.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {course.matchReasons.map((reason, i) => (
                        <p
                          key={i}
                          className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1"
                        >
                          <span>✓</span> {reason}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    {course.averageRating != null && (
                      <span className="text-amber-600 dark:text-amber-400">
                        ★ {Number(course.averageRating).toFixed(1)}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    </ProtectedRoute>
  );
}
