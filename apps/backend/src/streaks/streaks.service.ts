import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { StellarService } from '../stellar/stellar.service';

@Injectable()
export class StreaksService {
  private readonly logger = new Logger(StreaksService.name);

  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private stellarService: StellarService
  ) {}

  async recordActivity(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    const now = new Date();
    const lastActivity = user.lastActivityAt;

    if (!lastActivity) {
      // First activity ever
      user.currentStreak = 1;
      user.lastActivityAt = now;
    } else {
      const isSameDay = this.isSameDay(now, lastActivity);
      const isYesterday = this.isYesterday(now, lastActivity);

      if (isSameDay) {
        // Already recorded today, no change to streak count
        user.lastActivityAt = now;
        return this.userRepo.save(user);
      }

      if (isYesterday) {
        // Consecutive day
        user.currentStreak += 1;
      } else {
        // Missed a day or more
        user.currentStreak = 1;
      }

      user.lastActivityAt = now;
    }

    if (user.currentStreak > user.longestStreak) {
      user.longestStreak = user.currentStreak;
    }

    const savedUser = await this.userRepo.save(user);

    // Check for milestone rewards
    await this.checkMilestones(savedUser);

    return savedUser;
  }

  private async checkMilestones(user: User) {
    const milestones = [
      { days: 7, reward: 10 },
      { days: 30, reward: 50 },
      { days: 100, reward: 200 },
    ];

    const milestone = milestones.find((m) => m.days === user.currentStreak);
    if (milestone && user.stellarPublicKey) {
      try {
        this.logger.log(
          `User ${user.id} reached ${milestone.days} day streak! Minting ${milestone.reward} BST reward.`
        );
        await this.stellarService.mintReward(user.stellarPublicKey, milestone.reward);
      } catch (error) {
        this.logger.error(
          `Failed to mint streak reward for user ${user.id}: ${error.message}`
        );
      }
    }
  }

  private isSameDay(d1: Date, d2: Date): boolean {
    return (
      d1.getUTCFullYear() === d2.getUTCFullYear() &&
      d1.getUTCMonth() === d2.getUTCMonth() &&
      d1.getUTCDate() === d2.getUTCDate()
    );
  }

  private isYesterday(now: Date, last: Date): boolean {
    const yesterday = new Date(now);
    yesterday.setUTCDate(now.getUTCDate() - 1);
    return this.isSameDay(yesterday, last);
  }
}
