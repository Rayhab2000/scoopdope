import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKey } from '../../auth/api-key.entity';
import { AuditService } from '../../audit/audit.service';
import { ApiKeysService } from '../api-keys.service';

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let mockRepo: jest.Mocked<Repository<ApiKey>>;
  let mockAudit: jest.Mocked<AuditService>;

  const mockUser = { id: 'user-1', email: 'test@example.com', role: 'student' };
  const mockKey: ApiKey = {
    id: 'key-1',
    name: 'Test Key',
    description: 'A test key',
    keyHash: 'abc123def456...',
    isActive: true,
    userId: 'user-1',
    user: mockUser as any,
    createdAt: new Date('2025-01-01'),
    lastUsedAt: null,
  };

  beforeEach(async () => {
    mockRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as any;

    mockAudit = {
      log: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: getRepositoryToken(ApiKey), useValue: mockRepo },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<ApiKeysService>(ApiKeysService);
  });

  describe('findByUser', () => {
    it('should return keys for the user', async () => {
      mockRepo.find.mockResolvedValue([mockKey]);
      const result = await service.findByUser('user-1');
      expect(result).toEqual([mockKey]);
      expect(mockRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findById', () => {
    it('should find a key by id and userId', async () => {
      mockRepo.findOne.mockResolvedValue(mockKey);
      const result = await service.findById('key-1', 'user-1');
      expect(result).toEqual(mockKey);
    });

    it('should throw if key not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.findById('nonexistent', 'user-1')).rejects.toThrow('API key not found');
    });

    it('should find a key by id only (admin)', async () => {
      mockRepo.findOne.mockResolvedValue(mockKey);
      const result = await service.findById('key-1');
      expect(result).toEqual(mockKey);
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: 'key-1' } });
    });
  });

  describe('create', () => {
    it('should create a new API key', async () => {
      mockRepo.create.mockReturnValue(mockKey);
      mockRepo.save.mockResolvedValue(mockKey);

      const result = await service.create('user-1', 'My Key', 'A description');

      expect(result).toHaveProperty('apiKey');
      expect(result).toHaveProperty('warning');
      expect(result.name).toBe('Test Key');
      expect(mockAudit.log).toHaveBeenCalled();
    });

    it('should create a key without description', async () => {
      mockRepo.create.mockReturnValue(mockKey);
      mockRepo.save.mockResolvedValue(mockKey);

      const result = await service.create('user-1', 'My Key');

      expect(result).toHaveProperty('apiKey');
    });
  });

  describe('update', () => {
    it('should update key name and description', async () => {
      mockRepo.findOne.mockResolvedValue({ ...mockKey });
      mockRepo.save.mockImplementation(async (k: any) => k);

      const result = await service.update('key-1', 'user-1', {
        name: 'Updated',
        description: 'Updated desc',
      });

      expect(result.name).toBe('Updated');
      expect(result.description).toBe('Updated desc');
    });

    it('should throw if key belongs to another user', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(
        service.update('key-1', 'other-user', { name: 'New Name' }),
      ).rejects.toThrow('API key not found');
    });
  });

  describe('revoke', () => {
    it('should revoke an active key', async () => {
      mockRepo.findOne.mockResolvedValue({ ...mockKey, isActive: true });
      mockRepo.save.mockImplementation(async (k: any) => k);

      const result = await service.revoke('key-1', 'user-1');
      expect(result).toEqual({ message: 'API key revoked successfully' });
      expect(mockAudit.log).toHaveBeenCalled();
    });

    it('should throw if key is already revoked', async () => {
      mockRepo.findOne.mockResolvedValue({ ...mockKey, isActive: false });
      await expect(service.revoke('key-1', 'user-1')).rejects.toThrow(
        'API key is already revoked',
      );
    });
  });

  describe('rotate', () => {
    it('should rotate an active key', async () => {
      mockRepo.findOne.mockResolvedValue({ ...mockKey, isActive: true });
      mockRepo.save.mockImplementation(async (k: any) => k);

      const result = await service.rotate('key-1', 'user-1');
      expect(result).toHaveProperty('apiKey');
      expect(result).toHaveProperty('warning');
      expect(mockAudit.log).toHaveBeenCalled();
    });

    it('should throw if key is revoked', async () => {
      mockRepo.findOne.mockResolvedValue({ ...mockKey, isActive: false });
      await expect(service.rotate('key-1', 'user-1')).rejects.toThrow(
        'Cannot rotate a revoked API key',
      );
    });
  });

  describe('maskKey', () => {
    it('should mask the key hash', () => {
      const result = service.maskKey(mockKey);
      expect(result.maskedKey).toContain('bst_');
      expect(result.maskedKey).toContain('...');
      expect(result.maskedKey).not.toContain(mockKey.keyHash);
    });
  });

  describe('adminFindAll', () => {
    it('should return paginated results', async () => {
      const mockQb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockKey]),
      };
      mockRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.adminFindAll({ page: 1, limit: 20 });
      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });
  });

  describe('adminForceRevoke', () => {
    it('should force revoke any key', async () => {
      mockRepo.findOne.mockResolvedValue({ ...mockKey, isActive: true });
      mockRepo.save.mockImplementation(async (k: any) => k);

      const result = await service.adminForceRevoke('key-1');
      expect(result).toEqual({ message: 'API key revoked by admin' });
    });

    it('should throw if already revoked', async () => {
      mockRepo.findOne.mockResolvedValue({ ...mockKey, isActive: false });
      await expect(service.adminForceRevoke('key-1')).rejects.toThrow(
        'API key is already revoked',
      );
    });
  });
});
