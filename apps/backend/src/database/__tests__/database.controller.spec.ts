/**
 * Unit tests for DatabaseController
 *
 * Guard behaviour is tested by invoking the guards directly (bypassing NestJS
 * DI guard execution) so that we can assert the correct HTTP status codes
 * without spinning up a full HTTP server.
 *
 * Guard-level tests (RolesGuard, NonProductionGuard) live in their own spec
 * files; here we focus on:
 *  - The controller methods delegate correctly to MigrationRunnerService.
 *  - RolesGuard returns false (→ 403) for non-admin callers.
 *  - NonProductionGuard throws ForbiddenException (→ 403) in production.
 */

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

import { MigrationResult, MigrationRunnerService } from '../migration-runner.service';
import { DatabaseController } from '../database.controller';
import { NonProductionGuard } from '../non-production.guard';
import { RolesGuard } from '../../auth/roles.guard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal mock ExecutionContext carrying the supplied user object. */
function buildContext(user: { role: string } | null): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => DatabaseController.prototype.runMigrations,
    getClass: () => DatabaseController,
  } as unknown as ExecutionContext;
}

const mockMigrationResult: MigrationResult = {
  success: true,
  executed: ['InitialMigration1700000000000'],
  migrations: [
    {
      id: 1,
      timestamp: 1700000000000,
      name: 'InitialMigration1700000000000',
      executedAt: new Date('2024-01-01'),
    },
  ],
  durationMs: 42,
};

// ---------------------------------------------------------------------------
// RolesGuard — 403 behaviour
// ---------------------------------------------------------------------------

describe('RolesGuard — role enforcement on DatabaseController', () => {
  let guard: RolesGuard;

  beforeEach(() => {
    // Provide a real Reflector pre-loaded with the metadata that the
    // controller registers via @Roles('admin').
    const reflector = new Reflector();
    guard = new RolesGuard(reflector);

    // Stub getAllAndOverride so it always returns ['admin'], matching what the
    // class-level @Roles('admin') decorator would set at runtime.
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['admin'] as any);
  });

  it('returns false for a student user (→ 403 Forbidden)', () => {
    const ctx = buildContext({ role: 'student' });
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('returns false for an instructor user (→ 403 Forbidden)', () => {
    const ctx = buildContext({ role: 'instructor' });
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('returns false when request carries no user (unauthenticated, → 403)', () => {
    const ctx = buildContext(null);
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('returns true for an admin user (→ access granted)', () => {
    const ctx = buildContext({ role: 'admin' });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NonProductionGuard — production blocking
// ---------------------------------------------------------------------------

describe('NonProductionGuard', () => {
  let guard: NonProductionGuard;

  beforeEach(() => {
    guard = new NonProductionGuard();
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  it('throws ForbiddenException (→ 403) when NODE_ENV is "production"', () => {
    process.env.NODE_ENV = 'production';
    const ctx = buildContext({ role: 'admin' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException with a descriptive message in production', () => {
    process.env.NODE_ENV = 'production';
    const ctx = buildContext({ role: 'admin' });
    expect(() => guard.canActivate(ctx)).toThrow(
      'Migration endpoints are disabled in production',
    );
  });

  it('returns true when NODE_ENV is "development"', () => {
    process.env.NODE_ENV = 'development';
    const ctx = buildContext({ role: 'admin' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('returns true when NODE_ENV is "test"', () => {
    process.env.NODE_ENV = 'test';
    const ctx = buildContext({ role: 'admin' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('returns true when NODE_ENV is "staging"', () => {
    process.env.NODE_ENV = 'staging';
    const ctx = buildContext({ role: 'admin' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('returns true when NODE_ENV is undefined', () => {
    delete process.env.NODE_ENV;
    const ctx = buildContext({ role: 'admin' });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DatabaseController — method delegation
// ---------------------------------------------------------------------------

describe('DatabaseController', () => {
  let controller: DatabaseController;
  let migrationRunner: jest.Mocked<MigrationRunnerService>;

  beforeEach(async () => {
    migrationRunner = {
      run: jest.fn(),
      revert: jest.fn(),
      getStatus: jest.fn(),
    } as unknown as jest.Mocked<MigrationRunnerService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DatabaseController],
      providers: [
        { provide: MigrationRunnerService, useValue: migrationRunner },
      ],
    }).compile();

    controller = module.get<DatabaseController>(DatabaseController);
  });

  describe('runMigrations()', () => {
    it('delegates to migrationRunner.run() and returns its result', async () => {
      migrationRunner.run.mockResolvedValue(mockMigrationResult);

      const result = await controller.runMigrations();

      expect(migrationRunner.run).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockMigrationResult);
    });

    it('propagates errors thrown by migrationRunner.run()', async () => {
      migrationRunner.run.mockRejectedValue(
        new Error('DataSource is not initialized'),
      );

      await expect(controller.runMigrations()).rejects.toThrow(
        'DataSource is not initialized',
      );
    });
  });

  describe('revertMigration()', () => {
    it('delegates to migrationRunner.revert() and returns its result', async () => {
      const revertResult: MigrationResult = {
        ...mockMigrationResult,
        executed: [],
      };
      migrationRunner.revert.mockResolvedValue(revertResult);

      const result = await controller.revertMigration();

      expect(migrationRunner.revert).toHaveBeenCalledTimes(1);
      expect(result).toEqual(revertResult);
    });

    it('propagates errors thrown by migrationRunner.revert()', async () => {
      migrationRunner.revert.mockRejectedValue(new Error('Revert failed'));

      await expect(controller.revertMigration()).rejects.toThrow(
        'Revert failed',
      );
    });
  });

  describe('getMigrationStatus()', () => {
    it('delegates to migrationRunner.getStatus() and returns its result', async () => {
      const statusResult = mockMigrationResult.migrations;
      migrationRunner.getStatus.mockResolvedValue(statusResult);

      const result = await controller.getMigrationStatus();

      expect(migrationRunner.getStatus).toHaveBeenCalledTimes(1);
      expect(result).toEqual(statusResult);
    });

    it('returns empty array when no migrations exist', async () => {
      migrationRunner.getStatus.mockResolvedValue([]);

      const result = await controller.getMigrationStatus();

      expect(result).toEqual([]);
    });
  });
});
