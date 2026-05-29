import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async seed() {
    this.logger.log('Running database seed...');

    const seeds = [
      this.seedRoles,
    ];

    for (const seed of seeds) {
      await seed.call(this);
    }

    this.logger.log('Database seed completed');
  }

  private async seedRoles() {
    const existing = await this.dataSource.query(
      `SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_tier_enum')`,
    );

    if (existing[0]?.exists) {
      await this.dataSource.query(`
        INSERT INTO "subscription_tier_enum" ("name")
        VALUES ('free'), ('pro'), ('enterprise')
        ON CONFLICT DO NOTHING
      `).catch(() => {
        this.logger.warn('Could not seed subscription tiers (may already exist)');
      });
    }
  }
}
