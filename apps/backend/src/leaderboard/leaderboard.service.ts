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
}
