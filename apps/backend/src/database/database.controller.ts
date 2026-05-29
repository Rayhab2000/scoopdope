import { Controller, Post, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { MigrationRunnerService } from './migration-runner.service';

@ApiTags('database')
@Controller('database')
export class DatabaseController {
  constructor(
    private readonly migrationRunner: MigrationRunnerService,
  ) {}

  @Post('migrations/run')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Run pending migrations',
    description: 'Executes all pending database migrations.',
  })
  @ApiResponse({ status: 200, description: 'Migrations executed successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden (admin only)' })
  async runMigrations() {
    return this.migrationRunner.run();
  }

  @Post('migrations/revert')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Revert last migration',
    description: 'Reverts the most recently applied migration.',
  })
  @ApiResponse({ status: 200, description: 'Migration reverted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden (admin only)' })
  async revertMigration() {
    return this.migrationRunner.revert();
  }

  @Get('migrations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get migration status',
    description: 'Returns the status of all migrations (executed and pending).',
  })
  @ApiResponse({ status: 200, description: 'Migration status retrieved' })
  @ApiResponse({ status: 403, description: 'Forbidden (admin only)' })
  async getMigrationStatus() {
    return this.migrationRunner.getStatus();
  }
}
