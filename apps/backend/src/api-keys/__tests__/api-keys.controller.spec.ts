jest.mock('@nestjs/passport', () => ({
  AuthGuard: () => {
    return class MockGuard {
      canActivate() { return true; }
    };
  },
  PassportModule: { register: () => ({ module: class M {}, providers: [], exports: [] }) },
  PassportStrategy: jest.fn(),
}));
jest.mock('@sentry/nestjs', () => ({
  init: jest.fn(),
  configureScope: jest.fn(),
  setUser: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeysController } from '../api-keys.controller';
import { ApiKeysService } from '../api-keys.service';

describe('ApiKeysController', () => {
  let controller: ApiKeysController;
  let mockService: jest.Mocked<ApiKeysService>;

  const mockReq = (userId = 'user-1') => ({ user: { id: userId, role: 'student' } });

  beforeEach(async () => {
    mockService = {
      findByUser: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      revoke: jest.fn(),
      rotate: jest.fn(),
      adminFindAll: jest.fn(),
      adminForceRevoke: jest.fn(),
      maskKey: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeysController],
      providers: [{ provide: ApiKeysService, useValue: mockService }],
    }).compile();

    controller = module.get<ApiKeysController>(ApiKeysController);
  });

  describe('listUserKeys', () => {
    it('should return masked keys for the user', async () => {
      const keys = [{ id: 'key-1', name: 'Test' }];
      mockService.findByUser.mockResolvedValue(keys as any);
      mockService.maskKey.mockReturnValue({ maskedKey: 'bst_abc...' } as any);

      const result = await controller.listUserKeys(mockReq());
      expect(result).toEqual([{ maskedKey: 'bst_abc...' }]);
      expect(mockService.findByUser).toHaveBeenCalledWith('user-1');
    });
  });

  describe('createKey', () => {
    it('should create a new API key', async () => {
      const dto = { name: 'My Key', description: 'Test' };
      const expected = { apiKey: 'bst_xyz...', warning: expect.any(String) };
      mockService.create.mockResolvedValue(expected as any);

      const result = await controller.createKey(mockReq(), dto);
      expect(result).toEqual(expected);
      expect(mockService.create).toHaveBeenCalledWith('user-1', 'My Key', 'Test');
    });

    it('should create without description', async () => {
      const dto = { name: 'My Key' };
      const expected = { apiKey: 'bst_xyz...', warning: expect.any(String) };
      mockService.create.mockResolvedValue(expected as any);

      const result = await controller.createKey(mockReq(), dto);
      expect(result).toEqual(expected);
      expect(mockService.create).toHaveBeenCalledWith('user-1', 'My Key', undefined);
    });
  });

  describe('updateKey', () => {
    it('should update key name', async () => {
      const dto = { name: 'Updated Key' };
      const expected = { id: 'key-1', name: 'Updated Key' };
      mockService.update.mockResolvedValue(expected as any);

      const result = await controller.updateKey(mockReq(), 'key-1', dto);
      expect(result).toEqual(expected);
      expect(mockService.update).toHaveBeenCalledWith('key-1', 'user-1', dto);
    });
  });

  describe('revokeKey', () => {
    it('should revoke a key', async () => {
      mockService.revoke.mockResolvedValue({ message: 'API key revoked successfully' } as any);

      const result = await controller.revokeKey(mockReq(), 'key-1');
      expect(result).toEqual({ message: 'API key revoked successfully' });
      expect(mockService.revoke).toHaveBeenCalledWith('key-1', 'user-1');
    });
  });

  describe('rotateKey', () => {
    it('should rotate a key', async () => {
      const expected = { apiKey: 'bst_new...', warning: expect.any(String) };
      mockService.rotate.mockResolvedValue(expected as any);

      const result = await controller.rotateKey(mockReq(), 'key-1');
      expect(result).toEqual(expected);
      expect(mockService.rotate).toHaveBeenCalledWith('key-1', 'user-1');
    });
  });

  describe('adminListKeys', () => {
    it('should return paginated keys', async () => {
      const expected = { items: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
      mockService.adminFindAll.mockResolvedValue(expected as any);

      const query = { page: 1, limit: 20 };
      const result = await controller.adminListKeys(query as any);
      expect(result).toEqual(expected);
      expect(mockService.adminFindAll).toHaveBeenCalledWith({
        userId: undefined,
        isActive: undefined,
        page: 1,
        limit: 20,
      });
    });
  });

  describe('adminForceRevokeKey', () => {
    it('should force revoke a key', async () => {
      mockService.adminForceRevoke.mockResolvedValue({ message: 'API key revoked by admin' } as any);

      const result = await controller.adminForceRevokeKey('key-1');
      expect(result).toEqual({ message: 'API key revoked by admin' });
      expect(mockService.adminForceRevoke).toHaveBeenCalledWith('key-1');
    });
  });
});
