import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CourseAnalytics } from './course-analytics.entity';
import { Enrollment } from '../enrollments/enrollment.entity';
import { Progress } from '../progress/progress.entity';
import { Review } from '../courses/review.entity';
import { User } from '../users/user.entity';

export interface PlatformAnalytics {
  totalUsers: number;
  totalEnrollments: number;
  totalCompletions: number;
  totalRevenue: number;
  completionRate: number;
  userGrowth: { month: string; count: number }[];
  enrollmentGrowth: { month: string; count: number }[];
  completionGrowth: { month: string; count: number }[];
  revenueGrowth: { month: string; amount: number }[];
  topCourses: {
    courseId: string;
    title: string;
    enrollments: number;
    completions: number;
    completionRate: number;
  }[];
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly CACHE_TTL = 300;

  private readonly CACHE_PREFIX = 'analytics:';

  constructor(
    @InjectRepository(CourseAnalytics) private analyticsRepo: Repository<CourseAnalytics>,
    @InjectRepository(Enrollment) private enrollmentRepo: Repository<Enrollment>,
    @InjectRepository(Progress) private progressRepo: Repository<Progress>,
    @InjectRepository(Review) private reviewRepo: Repository<Review>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  async getAnalytics(courseId: string): Promise<CourseAnalytics> {
    const cacheKey = `${this.CACHE_PREFIX}${courseId}`;
    const cached = await this.cache.get<CourseAnalytics>(cacheKey);
    if (cached) return cached;

    let analytics = await this.analyticsRepo.findOne({ where: { courseId } });
    if (!analytics) {
      analytics = await this.aggregateCourse(courseId);
    }

    await this.cache.set(cacheKey, analytics, this.CACHE_TTL);
    return analytics;
  }

  async aggregateCourse(courseId: string): Promise<CourseAnalytics> {
    const [totalEnrollments, totalCompletions, reviewStats, progressStats, activeCount] =
      await Promise.all([
        this.enrollmentRepo.count({ where: { courseId } }),
        this.enrollmentRepo.count({ where: { courseId } }).then(async () => {
          const res = await this.enrollmentRepo
            .createQueryBuilder('e')
            .where('e.courseId = :courseId', { courseId })
            .andWhere('e.completedAt IS NOT NULL')
            .getCount();
          return res;
        }),
        this.reviewRepo
          .createQueryBuilder('r')
          .select('AVG(r.rating)', 'avg')
          .addSelect('COUNT(*)', 'cnt')
          .where('r.courseId = :courseId', { courseId })
          .getRawOne<{ avg: string; cnt: string }>(),
        this.progressRepo
          .createQueryBuilder('p')
          .select('AVG(p.progressPct)', 'avg')
          .where('p.courseId = :courseId', { courseId })
          .getRawOne<{ avg: string }>(),
        this.progressRepo
          .createQueryBuilder('p')
          .where('p.courseId = :courseId', { courseId })
          .andWhere('p.updatedAt > :since', { since: new Date(Date.now() - 30 * 86400_000) })
          .select('COUNT(DISTINCT p.userId)', 'cnt')
          .getRawOne<{ cnt: string }>(),
      ]);

    const completionRate = totalEnrollments > 0 ? (totalCompletions / totalEnrollments) * 100 : 0;

    const existing = await this.analyticsRepo.findOne({ where: { courseId } });
    const record = existing ?? this.analyticsRepo.create({ courseId });

    Object.assign(record, {
      totalEnrollments,
      totalCompletions,
      completionRate: Math.round(completionRate * 100) / 100,
      averageRating: Math.round(Number(reviewStats?.avg ?? 0) * 100) / 100,
      totalReviews: Number(reviewStats?.cnt ?? 0),
      averageProgressPct: Math.round(Number(progressStats?.avg ?? 0) * 100) / 100,
      activeLearnersLast30Days: Number(activeCount?.cnt ?? 0),
    });

    const saved = await this.analyticsRepo.save(record);
    await this.cache.set(`${this.CACHE_PREFIX}${courseId}`, saved, this.CACHE_TTL);
    return saved;
  }

  async getPlatformAnalytics(): Promise<PlatformAnalytics> {
    const cacheKey = `${this.CACHE_PREFIX}platform`;
    const cached = await this.cache.get<PlatformAnalytics>(cacheKey);
    if (cached) return cached;

    const now = new Date();
    // Build 12-month buckets (YYYY-MM)
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const [
      totalUsers,
      totalEnrollments,
      totalCompletions,
      usersByMonth,
      enrollmentsByMonth,
      completionsByMonth,
      topCoursesRaw,
    ] = await Promise.all([
      this.userRepo.count({ where: { isBanned: false } }),
      this.enrollmentRepo.count(),
      this.enrollmentRepo
        .createQueryBuilder('e')
        .where('e.completedAt IS NOT NULL')
        .getCount(),
      this.userRepo
        .createQueryBuilder('u')
        .select("TO_CHAR(u.createdAt, 'YYYY-MM')", 'month')
        .addSelect('COUNT(*)', 'count')
        .where("u.createdAt >= :since", { since: new Date(now.getFullYear(), now.getMonth() - 11, 1) })
        .groupBy("TO_CHAR(u.createdAt, 'YYYY-MM')")
        .orderBy("TO_CHAR(u.createdAt, 'YYYY-MM')", 'ASC')
        .getRawMany<{ month: string; count: string }>(),
      this.enrollmentRepo
        .createQueryBuilder('e')
        .select("TO_CHAR(e.enrolledAt, 'YYYY-MM')", 'month')
        .addSelect('COUNT(*)', 'count')
        .where("e.enrolledAt >= :since", { since: new Date(now.getFullYear(), now.getMonth() - 11, 1) })
        .groupBy("TO_CHAR(e.enrolledAt, 'YYYY-MM')")
        .orderBy("TO_CHAR(e.enrolledAt, 'YYYY-MM')", 'ASC')
        .getRawMany<{ month: string; count: string }>(),
      this.enrollmentRepo
        .createQueryBuilder('e')
        .select("TO_CHAR(e.completedAt, 'YYYY-MM')", 'month')
        .addSelect('COUNT(*)', 'count')
        .where('e.completedAt IS NOT NULL')
        .andWhere("e.completedAt >= :since", { since: new Date(now.getFullYear(), now.getMonth() - 11, 1) })
        .groupBy("TO_CHAR(e.completedAt, 'YYYY-MM')")
        .orderBy("TO_CHAR(e.completedAt, 'YYYY-MM')", 'ASC')
        .getRawMany<{ month: string; count: string }>(),
      this.analyticsRepo
        .createQueryBuilder('a')
        .leftJoin('courses', 'c', 'c.id = a.courseId')
        .select('a.courseId', 'courseId')
        .addSelect('c.title', 'title')
        .addSelect('a.totalEnrollments', 'enrollments')
        .addSelect('a.totalCompletions', 'completions')
        .addSelect('a.completionRate', 'completionRate')
        .orderBy('a.totalEnrollments', 'DESC')
        .limit(10)
        .getRawMany<{
          courseId: string;
          title: string;
          enrollments: string;
          completions: string;
          completionRate: string;
        }>(),
    ]);

    // Map month buckets, filling zeros for missing months
    const toMap = (rows: { month: string; count: string }[]) =>
      new Map(rows.map((r) => [r.month, Number(r.count)]));

    const userMap = toMap(usersByMonth);
    const enrollMap = toMap(enrollmentsByMonth);
    const completionMap = toMap(completionsByMonth);

    const userGrowth = months.map((m) => ({ month: m, count: userMap.get(m) ?? 0 }));
    const enrollmentGrowth = months.map((m) => ({ month: m, count: enrollMap.get(m) ?? 0 }));
    const completionGrowth = months.map((m) => ({ month: m, count: completionMap.get(m) ?? 0 }));

    // Revenue is approximated from enrollment counts (no payment table available)
    const revenueGrowth = enrollmentGrowth.map((e) => ({ month: e.month, amount: 0 }));

    const completionRate = totalEnrollments > 0
      ? Math.round((totalCompletions / totalEnrollments) * 10000) / 100
      : 0;

    const result: PlatformAnalytics = {
      totalUsers,
      totalEnrollments,
      totalCompletions,
      totalRevenue: 0,
      completionRate,
      userGrowth,
      enrollmentGrowth,
      completionGrowth,
      revenueGrowth,
      topCourses: topCoursesRaw.map((r) => ({
        courseId: r.courseId,
        title: r.title ?? 'Unknown',
        enrollments: Number(r.enrollments),
        completions: Number(r.completions),
        completionRate: Number(r.completionRate),
      })),
    };

    await this.cache.set(cacheKey, result, this.CACHE_TTL);
    return result;
  }

  /** Hourly: aggregate all courses */
  @Cron(CronExpression.EVERY_HOUR)
  async aggregateAll(): Promise<void> {
    this.logger.log('Running hourly analytics aggregation');
    const courseIds = await this.enrollmentRepo
      .createQueryBuilder('e')
      .select('DISTINCT e.courseId', 'courseId')
      .getRawMany<{ courseId: string }>();

    for (const { courseId } of courseIds) {
      try {
        await this.aggregateCourse(courseId);
      } catch (err: any) {
        this.logger.error(`Failed to aggregate course ${courseId}: ${err.message}`);
      }
    }
  }
}
