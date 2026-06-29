import { PlatformAnalytics } from '@/lib/adminApi';

export function formatMonth(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleString('default', { month: 'short', year: '2-digit' });
}

export function exportCSV(data: PlatformAnalytics): void {
  const rows: string[][] = [];
  rows.push(['Summary']);
  rows.push(['Metric', 'Value']);
  rows.push(['Total Users', String(data.totalUsers)]);
  rows.push(['Total Enrollments', String(data.totalEnrollments)]);
  rows.push(['Total Completions', String(data.totalCompletions)]);
  rows.push(['Completion Rate (%)', String(data.completionRate)]);
  rows.push([]);

  rows.push(['User Growth (Monthly)']);
  rows.push(['Month', 'New Users']);
  data.userGrowth.forEach((p) => rows.push([p.month, String(p.count)]));
  rows.push([]);

  rows.push(['Enrollment Growth (Monthly)']);
  rows.push(['Month', 'New Enrollments']);
  data.enrollmentGrowth.forEach((p) => rows.push([p.month, String(p.count)]));
  rows.push([]);

  rows.push(['Completion Growth (Monthly)']);
  rows.push(['Month', 'Completions']);
  data.completionGrowth.forEach((p) => rows.push([p.month, String(p.count)]));
  rows.push([]);

  rows.push(['Top Courses by Enrollment']);
  rows.push(['Course', 'Enrollments', 'Completions', 'Completion Rate (%)']);
  data.topCourses.forEach((c) =>
    rows.push([c.title, String(c.enrollments), String(c.completions), String(c.completionRate)])
  );

  const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `platform-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
