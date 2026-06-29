'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi, PlatformAnalytics } from '@/lib/adminApi';
import { LineChart } from './charts/LineChart';
import { TopCoursesTable } from './charts/TopCoursesTable';
import { MetricCard, SkeletonMetricCard } from './cards/MetricCard';
import { ChartCard, SkeletonChart } from './cards/ChartCard';
import { formatMonth, exportCSV } from './analytics.utils';

// ── Main component ────────────────────────────────────────────────────────────

export function AnalyticsDashboard() {
  const [data, setData] = useState<PlatformAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await adminApi.getPlatformAnalytics();
      setData(result);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 p-8 text-center">
        <p className="text-red-600 dark:text-red-400 mb-3">Failed to load analytics data.</p>
        <button onClick={load} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  const userGrowthData = (data?.userGrowth ?? []).map((p) => ({
    label: formatMonth(p.month),
    value: p.count,
  }));
  const enrollmentGrowthData = (data?.enrollmentGrowth ?? []).map((p) => ({
    label: formatMonth(p.month),
    value: p.count,
  }));
  const completionGrowthData = (data?.completionGrowth ?? []).map((p) => ({
    label: formatMonth(p.month),
    value: p.count,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Platform Analytics</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Platform-wide metrics and 12-month trends
          </p>
        </div>
        <button
          onClick={() => data && exportCSV(data) && setExporting(false)}
          disabled={!data || exporting}
          aria-label="Export analytics as CSV"
          className="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? (
          <>
            <SkeletonMetricCard />
            <SkeletonMetricCard />
            <SkeletonMetricCard />
            <SkeletonMetricCard />
          </>
        ) : (
          <>
            <MetricCard label="Total Users" value={(data?.totalUsers ?? 0).toLocaleString()} color="blue" />
            <MetricCard label="Total Enrollments" value={(data?.totalEnrollments ?? 0).toLocaleString()} color="purple" />
            <MetricCard label="Total Completions" value={(data?.totalCompletions ?? 0).toLocaleString()} color="green" />
            <MetricCard
              label="Completion Rate"
              value={`${data?.completionRate ?? 0}%`}
              sub="Enrollments → completions"
              color="orange"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {loading ? (
          <>
            <SkeletonChart />
            <SkeletonChart />
            <SkeletonChart />
          </>
        ) : (
          <>
            <ChartCard title="New Users (Monthly)">
              <LineChart data={userGrowthData} color="#3b82f6" height={80} />
            </ChartCard>
            <ChartCard title="New Enrollments (Monthly)">
              <LineChart data={enrollmentGrowthData} color="#8b5cf6" height={80} />
            </ChartCard>
            <ChartCard title="Completions (Monthly)">
              <LineChart data={completionGrowthData} color="#22c55e" height={80} />
            </ChartCard>
          </>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Top Courses by Enrollment</h3>
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-6 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        ) : data?.topCourses.length ? (
          <TopCoursesTable courses={data.topCourses} />
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">No course data available yet.</p>
        )}
      </div>
    </div>
  );
}
