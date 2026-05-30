import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { Progress } from './progress.entity';
import { RecordProgressDto } from './dto/record-progress.dto';
import { StellarService } from '../stellar/stellar.service';
import { CredentialsService } from '../credentials/credentials.service';
import { UsersService } from '../users/users.service';
import { StreaksService } from '../streaks/streaks.service';
import { BundlesService } from '../bundles/bundles.service';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class ProgressService {
  constructor(
    @InjectRepository(Progress) private repo: Repository<Progress>,
    private stellarService: StellarService,
    private credentialsService: CredentialsService,
    private usersService: UsersService,
    private streaksService: StreaksService,
    private bundlesService: BundlesService,
    private metrics: MetricsService,
  ) {}

  async record(userId: string, dto: RecordProgressDto, stellarPublicKey: string) {
    // Record activity for streak
    await this.streaksService.recordActivity(userId);

    let progress = await this.repo.findOne({
      where: { userId, courseId: dto.courseId },
    });

    if (!progress) {
      progress = this.repo.create({ userId, courseId: dto.courseId });
    }

    progress.lessonId = dto.lessonId ?? progress.lessonId;
    progress.progressPct = dto.progressPct;

    if (dto.progressPct >= 100) {
      progress.completedAt = new Date();
    }

    // Record on-chain
    try {
      const txHash = await this.stellarService.recordProgress(
        stellarPublicKey,
        dto.courseId,
        dto.progressPct
      );
      progress.txHash = txHash;
    } catch (err) {
      // Non-fatal: store progress off-chain even if on-chain call fails
    }

    const saved = await this.repo.save(progress);

    // Update bundle progress if applicable
    if (dto.progressPct >= 100) {
      await this.bundlesService.updateProgress(userId, dto.courseId);
    }

    // Auto-issue credential at 100%
    if (dto.progressPct >= 100) {
      this.metrics.incrementCourseCompleted(dto.courseId, 'all');

      await this.credentialsService.issue(userId, dto.courseId, stellarPublicKey);

      // Mint 50 BST to referrer on first course completion
      const completedCount = await this.repo.count({
        where: { userId, completedAt: Not(IsNull()) },
      });
      if (completedCount === 1) {
        const user = await this.usersService.findById(userId);
        if (user?.referredBy) {
          const referrer = await this.usersService.findById(user.referredBy);
          if (referrer?.stellarPublicKey) {
            try {
              await this.stellarService.mintReward(referrer.stellarPublicKey, 50);
            } catch (_) {
              // Non-fatal
            }
          }
        }
      }
    }

    return saved;
  }

  findByUser(userId: string) {
    return this.repo.find({ where: { userId }, order: { updatedAt: 'DESC' } });
  }
}
