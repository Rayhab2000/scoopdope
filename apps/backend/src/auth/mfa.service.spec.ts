import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MfaService } from './mfa.service';
import { UsersService } from '../users/users.service';
import { EncryptionService } from '../common/encryption.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit-log.entity';

// ── Mock the TOTP library ─────────────────────────────────────────────────────
// mfa.service.ts uses otplib (generateSecret, generateURI, verifySync)
jest.mock('otplib', () => ({
  generateSecret: jest.fn().mockReturnValue('MOCKED_SECRET'),
  generateURI: jest.fn().mockReturnValue('otpauth://totp/test'),
  verifySync: jest.fn(),
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,MOCK'),
}));

import { verifySync } from 'otplib';

const mockVerifySync = verifySync as jest.MockedFunction<typeof verifySync>;

// ── Helpers ───────────────────────────────────────────────────────────────────

import * as crypto from 'crypto';

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MfaService', () => {
  let service: MfaService;

  const mockUsersService = {
    findById: jest.fn(),
    update: jest.fn(),
  };

  const mockEncryptionService = {
    encrypt: jest.fn((v: string) => `enc(${v})`),
    decrypt: jest.fn((v: string) => v.replace(/^enc\(/, '').replace(/\)$/, '')),
  };

  const mockAuditService = {
    log: jest.fn(),
  };

  const userId = 'test-user-id';
  const rawSecret = 'MOCKED_SECRET';
  const encryptedSecret = `enc(${rawSecret})`;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MfaService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<MfaService>(MfaService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── generateSecret ──────────────────────────────────────────────────────────

  describe('generateSecret', () => {
    it('returns a secret and QR code data URL', async () => {
      mockUsersService.findById.mockResolvedValue({
        id: userId,
        email: 'test@example.com',
        mfaSecret: null,
        mfaEnabled: false,
      });
      mockUsersService.update.mockResolvedValue(undefined);

      const result = await service.generateSecret(userId);

      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('qrCodeDataUrl');
      expect(result.qrCodeDataUrl).toMatch(/^data:image\/png/);
    });

    it('encrypts the secret before persisting', async () => {
      mockUsersService.findById.mockResolvedValue({
        id: userId,
        email: 'test@example.com',
        mfaSecret: null,
        mfaEnabled: false,
      });
      mockUsersService.update.mockResolvedValue(undefined);

      await service.generateSecret(userId);

      expect(mockUsersService.update).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          mfaSecret: expect.stringContaining('enc('),
          mfaEnabled: false,
        }),
      );
    });

    it('throws NotFoundException for unknown user', async () => {
      mockUsersService.findById.mockResolvedValue(null);

      await expect(service.generateSecret('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  // ── verifyAndEnable ─────────────────────────────────────────────────────────

  describe('verifyAndEnable', () => {
    const validUser = {
      id: userId,
      email: 'test@example.com',
      mfaSecret: encryptedSecret,
      mfaEnabled: false,
      mfaBackupCodes: [],
    };

    it('enables MFA and returns 8 backup codes on valid TOTP', async () => {
      mockUsersService.findById.mockResolvedValue(validUser);
      mockVerifySync.mockReturnValue({ valid: true } as any);
      mockUsersService.update.mockResolvedValue(undefined);

      const result = await service.verifyAndEnable(userId, '123456');

      expect(result.message).toBe('MFA enabled successfully');
      expect(result.backupCodes).toHaveLength(8);
      expect(mockUsersService.update).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ mfaEnabled: true }),
      );
    });

    it('stores backup codes as SHA-256 hashes (not plaintext)', async () => {
      mockUsersService.findById.mockResolvedValue(validUser);
      mockVerifySync.mockReturnValue({ valid: true } as any);

      let savedCodes: string[] = [];
      mockUsersService.update.mockImplementation((_id, fields: any) => {
        if (fields.mfaBackupCodes) savedCodes = fields.mfaBackupCodes;
      });

      const result = await service.verifyAndEnable(userId, '123456');

      // Plaintext codes should NOT be stored
      result.backupCodes.forEach((code) => {
        expect(savedCodes).not.toContain(code);
      });
      // Stored values should be 64-char hex hashes
      savedCodes.forEach((hash) => {
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      });
    });

    it('logs an audit event when MFA is enabled', async () => {
      mockUsersService.findById.mockResolvedValue(validUser);
      mockVerifySync.mockReturnValue({ valid: true } as any);
      mockUsersService.update.mockResolvedValue(undefined);

      await service.verifyAndEnable(userId, '123456');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        AuditAction.MFA_ENABLED,
        userId,
        true,
      );
    });

    it('throws BadRequestException for an invalid TOTP code', async () => {
      mockUsersService.findById.mockResolvedValue(validUser);
      mockVerifySync.mockReturnValue({ valid: false } as any);

      await expect(service.verifyAndEnable(userId, '000000')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when MFA setup has not been initiated', async () => {
      mockUsersService.findById.mockResolvedValue({ ...validUser, mfaSecret: null });

      await expect(service.verifyAndEnable(userId, '123456')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── disable ─────────────────────────────────────────────────────────────────

  describe('disable', () => {
    const enabledUser = {
      id: userId,
      email: 'test@example.com',
      mfaSecret: encryptedSecret,
      mfaEnabled: true,
      mfaBackupCodes: [hashCode('BACKUP1')],
    };

    it('disables MFA on a valid TOTP code', async () => {
      mockUsersService.findById.mockResolvedValue(enabledUser);
      mockVerifySync.mockReturnValue({ valid: true } as any);
      mockUsersService.update.mockResolvedValue(undefined);

      const result = await service.disable(userId, '123456');

      expect(result.message).toBe('MFA disabled successfully');
    });

    it('clears mfaSecret when MFA is disabled', async () => {
      mockUsersService.findById.mockResolvedValue(enabledUser);
      mockVerifySync.mockReturnValue({ valid: true } as any);

      await service.disable(userId, '123456');

      expect(mockUsersService.update).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ mfaSecret: null }),
      );
    });

    it('clears mfaBackupCodes to an empty array when MFA is disabled', async () => {
      mockUsersService.findById.mockResolvedValue(enabledUser);
      mockVerifySync.mockReturnValue({ valid: true } as any);

      await service.disable(userId, '123456');

      expect(mockUsersService.update).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ mfaBackupCodes: [] }),
      );
    });

    it('sets mfaEnabled to false when MFA is disabled', async () => {
      mockUsersService.findById.mockResolvedValue(enabledUser);
      mockVerifySync.mockReturnValue({ valid: true } as any);

      await service.disable(userId, '123456');

      expect(mockUsersService.update).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ mfaEnabled: false }),
      );
    });

    it('logs an audit event when MFA is disabled', async () => {
      mockUsersService.findById.mockResolvedValue(enabledUser);
      mockVerifySync.mockReturnValue({ valid: true } as any);
      mockUsersService.update.mockResolvedValue(undefined);

      await service.disable(userId, '123456');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        AuditAction.MFA_DISABLED,
        userId,
        true,
      );
    });

    it('throws BadRequestException when MFA is not enabled', async () => {
      mockUsersService.findById.mockResolvedValue({
        ...enabledUser,
        mfaEnabled: false,
        mfaSecret: null,
      });

      await expect(service.disable(userId, '123456')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for an invalid TOTP code', async () => {
      mockUsersService.findById.mockResolvedValue(enabledUser);
      mockVerifySync.mockReturnValue({ valid: false } as any);

      await expect(service.disable(userId, 'wrong')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── verifyCode ─────────────────────────────────────────────────────────────

  describe('verifyCode', () => {
    const rawBackupCode = 'BACKUP1234';
    const enabledUser = {
      id: userId,
      mfaSecret: encryptedSecret,
      mfaEnabled: true,
      mfaBackupCodes: [hashCode(rawBackupCode)],
    };

    it('returns true for a valid TOTP code', async () => {
      mockUsersService.findById.mockResolvedValue(enabledUser);
      mockVerifySync.mockReturnValue({ valid: true } as any);

      await expect(service.verifyCode(userId, '123456')).resolves.toBe(true);
    });

    it('returns false for an invalid TOTP code with no matching backup code', async () => {
      mockUsersService.findById.mockResolvedValue(enabledUser);
      mockVerifySync.mockReturnValue({ valid: false } as any);

      await expect(service.verifyCode(userId, 'badcode')).resolves.toBe(false);
    });

    it('returns false when user has no mfaSecret', async () => {
      mockUsersService.findById.mockResolvedValue({ ...enabledUser, mfaSecret: null });

      await expect(service.verifyCode(userId, '123456')).resolves.toBe(false);
    });

    // ── Backup code: single-use enforcement ─────────────────────────────────

    it('accepts a valid backup code when TOTP fails', async () => {
      mockUsersService.findById.mockResolvedValue(enabledUser);
      mockVerifySync.mockReturnValue({ valid: false } as any);
      mockUsersService.update.mockResolvedValue(undefined);

      await expect(service.verifyCode(userId, rawBackupCode)).resolves.toBe(true);
    });

    it('removes the backup code from the list after first use', async () => {
      mockUsersService.findById.mockResolvedValue(enabledUser);
      mockVerifySync.mockReturnValue({ valid: false } as any);

      let updatedCodes: string[] = [];
      mockUsersService.update.mockImplementation((_id, fields: any) => {
        if (fields.mfaBackupCodes !== undefined) updatedCodes = fields.mfaBackupCodes;
      });

      await service.verifyCode(userId, rawBackupCode);

      // The used code's hash should no longer be in the list
      expect(updatedCodes).not.toContain(hashCode(rawBackupCode));
    });

    it('cannot reuse a backup code after first consumption', async () => {
      // Simulate used code: user has been updated, backup codes list is now empty
      const userWithUsedCode = { ...enabledUser, mfaBackupCodes: [] };
      mockUsersService.findById.mockResolvedValue(userWithUsedCode);
      mockVerifySync.mockReturnValue({ valid: false } as any);

      // Second attempt with the same code returns false
      await expect(service.verifyCode(userId, rawBackupCode)).resolves.toBe(false);
    });

    it('returns false for an unknown backup code', async () => {
      mockUsersService.findById.mockResolvedValue(enabledUser);
      mockVerifySync.mockReturnValue({ valid: false } as any);

      await expect(service.verifyCode(userId, 'NOTACODE')).resolves.toBe(false);
    });
  });

  // ── regenerateBackupCodes ────────────────────────────────────────────────────

  describe('regenerateBackupCodes', () => {
    const enabledUser = {
      id: userId,
      mfaSecret: encryptedSecret,
      mfaEnabled: true,
      mfaBackupCodes: [hashCode('OLD_CODE')],
    };

    it('returns 8 fresh backup codes on valid TOTP', async () => {
      mockUsersService.findById.mockResolvedValue(enabledUser);
      mockVerifySync.mockReturnValue({ valid: true } as any);
      mockUsersService.update.mockResolvedValue(undefined);

      const result = await service.regenerateBackupCodes(userId, '123456');

      expect(result.backupCodes).toHaveLength(8);
    });

    it('replaces old backup codes with new hashed codes', async () => {
      mockUsersService.findById.mockResolvedValue(enabledUser);
      mockVerifySync.mockReturnValue({ valid: true } as any);

      let savedCodes: string[] = [];
      mockUsersService.update.mockImplementation((_id, fields: any) => {
        if (fields.mfaBackupCodes) savedCodes = fields.mfaBackupCodes;
      });

      const result = await service.regenerateBackupCodes(userId, '123456');

      // Old code hash should not appear in new list
      expect(savedCodes).not.toContain(hashCode('OLD_CODE'));
      // Plaintext codes should not be stored
      result.backupCodes.forEach((code) => expect(savedCodes).not.toContain(code));
      // New codes should be SHA-256 hashes
      expect(savedCodes).toHaveLength(8);
      savedCodes.forEach((hash) => expect(hash).toMatch(/^[a-f0-9]{64}$/));
    });

    it('throws BadRequestException when MFA is not enabled', async () => {
      mockUsersService.findById.mockResolvedValue({
        ...enabledUser,
        mfaEnabled: false,
        mfaSecret: null,
      });

      await expect(service.regenerateBackupCodes(userId, '123456')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for invalid TOTP', async () => {
      mockUsersService.findById.mockResolvedValue(enabledUser);
      mockVerifySync.mockReturnValue({ valid: false } as any);

      await expect(service.regenerateBackupCodes(userId, 'wrong')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
