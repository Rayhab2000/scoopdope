import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MigrationRunnerService } from '../migration-runner.service';

describe('MigrationRunnerService', () => {
  let service: MigrationRunnerService;
  let mockDataSource: jest.Mocked<Partial<DataSource>>;

  beforeEach(async () => {
    const mockQueryBuilder: any = {
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    mockDataSource = {
      isInitialized: true as const,
      runMigrations: jest.fn(),
      undoLastMigration: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      options: { migrationsTableName: 'schema_migrations' } as any,
      migrations: [],
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MigrationRunnerService,
        {
          provide: getDataSourceToken(),
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<MigrationRunnerService>(MigrationRunnerService);
  });

  describe('run', () => {
    it('should run pending migrations', async () => {
      const mockMigration = { name: 'TestMigration1700000000000', timestamp: 1700000000000 };
      mockDataSource.runMigrations.mockResolvedValue([mockMigration] as any);

      const result = await service.run();

      expect(result.success).toBe(true);
      expect(result.executed).toEqual(['TestMigration1700000000000']);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should return success=false when no migrations', async () => {
      mockDataSource.runMigrations.mockResolvedValue([]);

      const result = await service.run();
      expect(result.success).toBe(false);
      expect(result.executed).toEqual([]);
    });

    it('should throw if DataSource not initialized', async () => {
      (mockDataSource as any).isInitialized = false;
      await expect(service.run()).rejects.toThrow('DataSource is not initialized');
    });
  });

  describe('revert', () => {
    it('should revert the last migration', async () => {
      const executedRow = {
        id: 1,
        name: 'TestMigration1700000000000',
        timestamp: 1700000000000,
        executedAt: new Date(),
      };
      mockDataSource.query
        .mockResolvedValueOnce([executedRow])
        .mockResolvedValueOnce([]);
      mockDataSource.undoLastMigration.mockResolvedValue(undefined);

      const result = await service.revert();

      expect(result.success).toBe(true);
      expect(mockDataSource.undoLastMigration).toHaveBeenCalled();
    });

    it('should return success=false when nothing to revert', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockDataSource.undoLastMigration.mockResolvedValue(undefined);

      const result = await service.revert();
      expect(result.success).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return empty array when not initialized', async () => {
      (mockDataSource as any).isInitialized = false;
      const status = await service.getStatus();
      expect(status).toEqual([]);
    });

    it('should return migration status', async () => {
      mockDataSource.query.mockResolvedValue([
        { id: 1, name: 'ExecutedMigration1700000000000', timestamp: 1700000000000, executedAt: new Date() },
      ]);

      const status = await service.getStatus();
      expect(status).toHaveLength(1);
      expect(status[0].name).toBe('ExecutedMigration1700000000000');
    });

    it('should combine executed and pending migrations', async () => {
      mockDataSource.query.mockResolvedValue([
        { id: 1, name: 'FirstMigration1700000000000', timestamp: 1700000000000, executedAt: new Date().toISOString() },
      ]);
      (mockDataSource as any).migrations = [
        { name: 'FirstMigration1700000000000' },
        { name: 'SecondMigration1710000000000' },
      ];

      const status = await service.getStatus();
      expect(status).toHaveLength(2);
      expect(status[0].id).toBe(1);
      expect(status[0].executedAt).toBeTruthy();
      expect(status[1].id).toBe(-1);
      expect(status[1].executedAt).toBeUndefined();
    });
  });
});
