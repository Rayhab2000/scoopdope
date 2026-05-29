import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DatabaseController } from './database.controller';
import { MigrationRunnerService } from './migration-runner.service';
import { SeedService } from './seeds/seed.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([]),
    AuthModule,
  ],
  controllers: [DatabaseController],
  providers: [MigrationRunnerService, SeedService],
  exports: [MigrationRunnerService, SeedService],
})
export class DatabaseModule {}
