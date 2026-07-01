import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { StellarService } from '../stellar/stellar.service';
import { MetricsService } from '../metrics/metrics.service';

type LeaderboardEntry = {
  userId: string;
  username: string | null;
  email: string;
  stellarPublicKey: string;
  balance: string;
};

export type StreakLeaderboardEntry = {
  rank: number;
  userId: string;
  username: string | null;
  currentStreak: number;
  longestStreak: number;
  lastActivityAt: Date | null;
};

@Injectable()
export class LeaderboardService {
  private readonly cacheKey = 'leaderboard:top50';
  /** 1-minute TTL in milliseconds */
  private readonly cacheTtlMs = 60_000;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly stellarService: StellarService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly metricsService: MetricsService
  ) {}

  async getTopUsers() {
    const cached = await this.cacheManager.get<LeaderboardEntry[]>(this.cacheKey);
    if (cached) {
      this.metricsService.incrementCacheHit('leaderboard');
      return cached;
    }
    this.metricsService.incrementCacheMiss('leaderboard');

    const users = await this.userRepo.find({
      where: {},
      order: { createdAt: 'DESC' },
    });

    const walletUsers = users.filter((user) => Boolean(user.stellarPublicKey) && !user.deletedAt);

    const balances = await Promise.all(
      walletUsers.map(async (user) => {
        try {
          const balance = await this.stellarService.getTokenBalance(user.stellarPublicKey);
          return {
            userId: user.id,
            username: user.username ?? null,
            email: user.email,
            stellarPublicKey: user.stellarPublicKey,
            balance,
          };
        } catch {
          return {
            userId: user.id,
            username: user.username ?? null,
            email: user.email,
            stellarPublicKey: user.stellarPublicKey,
            balance: '0',
          };
        }
      })
    );

    const leaderboard = balances
      .sort((a, b) => {
        const left = BigInt(a.balance);
        const right = BigInt(b.balance);
        if (left === right) {
          return a.email.localeCompare(b.email);
        }
        return right > left ? 1 : -1;
      })
      .slice(0, 50);

    await this.cacheManager.set(this.cacheKey, leaderboard, this.cacheTtlMs);
    return leaderboard;
  }

  /**
   * Returns the top 50 users ranked by their current learning streak.
   * Ties are broken by longest-streak descending, then by most-recent
   * activity, so active learners always appear first.
   *
   * Results are cached for 60 seconds to reduce DB load.
   */
  async getStreakLeaderboard(): Promise<StreakLeaderboardEntry[]> {
    const cacheKey = 'leaderboard:streaks:top50';

    const cached = await this.cacheManager.get<StreakLeaderboardEntry[]>(cacheKey);
    if (cached) {
      this.metricsService.incrementCacheHit('leaderboard_streaks');
      return cached;
    }
    this.metricsService.incrementCacheMiss('leaderboard_streaks');

    // Fetch users with at least 1 active streak day, excluding soft-deleted accounts.
    const users = await this.userRepo
      .createQueryBuilder('user')
      .where('user.currentStreak > 0')
      .andWhere('user.deletedAt IS NULL')
      .orderBy('user.currentStreak', 'DESC')
      .addOrderBy('user.longestStreak', 'DESC')
      .addOrderBy('user.lastActivityAt', 'DESC')
      .take(50)
      .getMany();

    const leaderboard: StreakLeaderboardEntry[] = users.map((user, index) => ({
      rank: index + 1,
      userId: user.id,
      username: user.username ?? null,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      lastActivityAt: user.lastActivityAt ?? null,
    }));

    await this.cacheManager.set(cacheKey, leaderboard, this.cacheTtlMs);
    return leaderboard;
  }
}
