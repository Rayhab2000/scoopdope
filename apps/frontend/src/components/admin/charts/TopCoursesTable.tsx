import { TopCourse } from '@/lib/adminApi';

export function TopCoursesTable({ courses }: { courses: TopCourse[] }) {
  const max = Math.max(...courses.map((c) => c.enrollments), 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Top courses by enrollment">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="text-left py-2 pr-4 font-medium text-gray-500 dark:text-gray-400">Course</th>
            <th className="text-right py-2 px-4 font-medium text-gray-500 dark:text-gray-400">Enrollments</th>
            <th className="text-right py-2 px-4 font-medium text-gray-500 dark:text-gray-400">Completions</th>
            <th className="text-left py-2 pl-4 font-medium text-gray-500 dark:text-gray-400 w-32">Completion Rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {courses.map((c) => (
            <tr key={c.courseId} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
              <td className="py-2 pr-4 text-gray-900 dark:text-gray-100 font-medium max-w-xs truncate">
                {c.title}
              </td>
              <td className="py-2 px-4 text-right text-gray-600 dark:text-gray-300">
                <div className="flex items-center justify-end gap-2">
                  <div className="h-1.5 w-16 rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${(c.enrollments / max) * 100}%` }}
                    />
                  </div>
                  {c.enrollments.toLocaleString()}
                </div>
              </td>
              <td className="py-2 px-4 text-right text-gray-600 dark:text-gray-300">
                {c.completions.toLocaleString()}
              </td>
              <td className="py-2 pl-4">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-full rounded-full bg-green-500"
                      style={{ width: `${c.completionRate}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-10 text-right">
                    {c.completionRate.toFixed(1)}%
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
