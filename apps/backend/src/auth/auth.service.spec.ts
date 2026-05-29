import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../mail/mail.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PasswordResetToken } from './password-reset-token.entity';
import { RefreshToken } from './refresh-token.entity';
import { ApiKey } from './api-key.entity';
import { EncryptionService } from '../common/encryption.service';
import { AuditService } from '../audit/audit.service';
import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

// Mock otplib before any imports resolve it
jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'MOCKSECRET'),
  generateSync: jest.fn(),
  generateURI: jest.fn(() => 'otpauth://totp/test'),
  verifySync: jest.fn(),
}));

// Mock qrcode
jest.mock('qrcode', () => ({
  toDataURL: jest.fn(() => Promise.resolve('data:image/png;base64,mock')),
}));

import * as otplib from 'otplib';

describe('AuthService', () => {
  let service: AuthService;

  const mockUsersService = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    findByVerificationToken: jest.fn(),
    findByReferralCode: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const mockJwtService = { sign: jest.fn() };
  const mockMailService = {
    sendVerificationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
  };
  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    })),
  };
  const mockEncryptionService = {
    encrypt: jest.fn((v: string) => `enc:${v}`),
    decrypt: jest.fn((v: string) => v.replace('enc:', '')),
  };
  const mockAuditService = { log: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: MailService, useValue: mockMailService },
        { provide: getRepositoryToken(PasswordResetToken), useValue: mockRepository },
        { provide: getRepositoryToken(RefreshToken), useValue: mockRepository },
        { provide: getRepositoryToken(ApiKey), useValue: mockRepository },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── register ──────────────────────────────────────────────────────────────

  describe('register', () => {
    const email = 'test@example.com';
    const password = 'password123';

    it('registers a new user successfully', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({ id: 'uuid', email });
      mockMailService.sendVerificationEmail.mockResolvedValue(undefined);

      const result = await service.register(email, password);

      expect(result).toEqual({ message: 'Registration successful. Please verify your email.' });
      expect(mockUsersService.create).toHaveBeenCalled();
      expect(mockMailService.sendVerificationEmail).toHaveBeenCalled();
    });

    it('throws BadRequestException if email already in use', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ email });
      await expect(service.register(email, password)).rejects.toThrow(BadRequestException);
      expect(mockUsersService.create).not.toHaveBeenCalled();
    });
  });

  // ── login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    const email = 'test@example.com';
    const password = 'password123';
    const baseUser = {
      id: 'uuid',
      email,
      passwordHash: 'hashed',
      isVerified: true,
      isBanned: false,
      role: 'student',
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: null,
    };

    beforeEach(() => {
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true));
      mockJwtService.sign.mockReturnValue('access_token');
      mockRepository.create.mockReturnValue({});
      mockRepository.save.mockResolvedValue({});
    });

    it('returns tokens on successful login', async () => {
      mockUsersService.findByEmail.mockResolvedValue(baseUser);
      const result = await service.login(email, password);
      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
    });

    it('throws UnauthorizedException for wrong password', async () => {
      mockUsersService.findByEmail.mockResolvedValue(baseUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(false));
      await expect(service.login(email, password)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException if user not found', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      await expect(service.login(email, password)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException if user is banned', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ ...baseUser, isBanned: true });
      await expect(service.login(email, password)).rejects.toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException if user is not verified', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ ...baseUser, isVerified: false });
      await expect(service.login(email, password)).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException if admin has not enabled 2FA', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ ...baseUser, role: 'admin', mfaEnabled: false });
      await expect(service.login(email, password)).rejects.toThrow(ForbiddenException);
    });

    it('returns mfa_required when 2FA is enabled but no token provided', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        ...baseUser,
        mfaEnabled: true,
        mfaSecret: 'enc:SECRET',
      });
      const result = await service.login(email, password);
      expect(result).toEqual({ mfa_required: true });
    });

    it('returns tokens when valid TOTP token is provided', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        ...baseUser,
        mfaEnabled: true,
        mfaSecret: 'enc:SECRET',
      });
      mockEncryptionService.decrypt.mockReturnValue('SECRET');
      (otplib.verifySync as jest.Mock).mockReturnValue({ valid: true });

      const result = await service.login(email, password, '123456');
      expect(result).toHaveProperty('access_token');
    });

    it('throws UnauthorizedException for invalid TOTP and no valid backup code', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        ...baseUser,
        mfaEnabled: true,
        mfaSecret: 'enc:SECRET',
        mfaBackupCodes: [],
      });
      mockEncryptionService.decrypt.mockReturnValue('SECRET');
      (otplib.verifySync as jest.Mock).mockReturnValue({ valid: false });
      mockUsersService.findById.mockResolvedValue({ ...baseUser, mfaBackupCodes: [] });

      await expect(service.login(email, password, 'wrong')).rejects.toThrow(UnauthorizedException);
    });

    it('accepts a valid backup code when TOTP fails', async () => {
      const crypto = await import('crypto');
      const rawCode = 'ABCDE12345';
      const hashedCode = crypto.createHash('sha256').update(rawCode).digest('hex');

      mockUsersService.findByEmail.mockResolvedValue({
        ...baseUser,
        mfaEnabled: true,
        mfaSecret: 'enc:SECRET',
        mfaBackupCodes: [hashedCode],
      });
      mockEncryptionService.decrypt.mockReturnValue('SECRET');
      (otplib.verifySync as jest.Mock).mockReturnValue({ valid: false });
      mockUsersService.findById.mockResolvedValue({
        ...baseUser,
        mfaBackupCodes: [hashedCode],
      });
      mockUsersService.update.mockResolvedValue(undefined);

      const result = await service.login(email, password, rawCode);
      expect(result).toHaveProperty('access_token');
    });
  });

  // ── generateMfaSecret ─────────────────────────────────────────────────────

  describe('generateMfaSecret', () => {
    it('returns secret and qrCodeDataUrl', async () => {
      mockUsersService.findById.mockResolvedValue({ id: 'uuid', email: 'test@example.com' });
      mockUsersService.update.mockResolvedValue(undefined);

      const result = await service.generateMfaSecret('uuid');

      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('qrCodeDataUrl');
      expect(mockEncryptionService.encrypt).toHaveBeenCalled();
      expect(mockUsersService.update).toHaveBeenCalledWith('uuid', expect.objectContaining({ mfaEnabled: false }));
    });

    it('throws NotFoundException if user not found', async () => {
      mockUsersService.findById.mockResolvedValue(null);
      await expect(service.generateMfaSecret('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── verifyMfaSecret ───────────────────────────────────────────────────────

  describe('verifyMfaSecret', () => {
    it('enables MFA and returns 8 backup codes on valid code', async () => {
      mockUsersService.findById.mockResolvedValue({ id: 'uuid', mfaSecret: 'enc:SECRET' });
      mockEncryptionService.decrypt.mockReturnValue('SECRET');
      (otplib.verifySync as jest.Mock).mockReturnValue({ valid: true });
      mockUsersService.update.mockResolvedValue(undefined);

      const result = await service.verifyMfaSecret('uuid', '123456');

      expect(result.message).toBe('MFA enabled successfully');
      expect(result.backupCodes).toHaveLength(8);
      expect(mockUsersService.update).toHaveBeenCalledWith(
        'uuid',
        expect.objectContaining({ mfaEnabled: true }),
      );
    });

    it('throws BadRequestException for invalid code', async () => {
      mockUsersService.findById.mockResolvedValue({ id: 'uuid', mfaSecret: 'enc:SECRET' });
      mockEncryptionService.decrypt.mockReturnValue('SECRET');
      (otplib.verifySync as jest.Mock).mockReturnValue({ valid: false });

      await expect(service.verifyMfaSecret('uuid', 'wrong')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if MFA setup not initiated', async () => {
      mockUsersService.findById.mockResolvedValue({ id: 'uuid', mfaSecret: null });
      await expect(service.verifyMfaSecret('uuid', '123456')).rejects.toThrow(BadRequestException);
    });
  });

  // ── disableMfa ────────────────────────────────────────────────────────────

  describe('disableMfa', () => {
    it('disables MFA on valid code', async () => {
      mockUsersService.findById.mockResolvedValue({
        id: 'uuid',
        mfaEnabled: true,
        mfaSecret: 'enc:SECRET',
      });
      mockEncryptionService.decrypt.mockReturnValue('SECRET');
      (otplib.verifySync as jest.Mock).mockReturnValue({ valid: true });
      mockUsersService.update.mockResolvedValue(undefined);

      const result = await service.disableMfa('uuid', '123456');

      expect(result.message).toBe('MFA disabled successfully');
      expect(mockUsersService.update).toHaveBeenCalledWith(
        'uuid',
        expect.objectContaining({ mfaEnabled: false }),
      );
    });

    it('throws BadRequestException if MFA not enabled', async () => {
      mockUsersService.findById.mockResolvedValue({ id: 'uuid', mfaEnabled: false });
      await expect(service.disableMfa('uuid', '123456')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid code', async () => {
      mockUsersService.findById.mockResolvedValue({
        id: 'uuid',
        mfaEnabled: true,
        mfaSecret: 'enc:SECRET',
      });
      mockEncryptionService.decrypt.mockReturnValue('SECRET');
      (otplib.verifySync as jest.Mock).mockReturnValue({ valid: false });

      await expect(service.disableMfa('uuid', 'wrong')).rejects.toThrow(BadRequestException);
    });
  });

  // ── regenerateBackupCodes ─────────────────────────────────────────────────

  describe('regenerateBackupCodes', () => {
    it('returns 8 new backup codes on valid TOTP', async () => {
      mockUsersService.findById.mockResolvedValue({
        id: 'uuid',
        mfaEnabled: true,
        mfaSecret: 'enc:SECRET',
      });
      mockEncryptionService.decrypt.mockReturnValue('SECRET');
      (otplib.verifySync as jest.Mock).mockReturnValue({ valid: true });
      mockUsersService.update.mockResolvedValue(undefined);

      const result = await service.regenerateBackupCodes('uuid', '123456');

      expect(result.backupCodes).toHaveLength(8);
    });

    it('throws BadRequestException if MFA not enabled', async () => {
      mockUsersService.findById.mockResolvedValue({ id: 'uuid', mfaEnabled: false });
      await expect(service.regenerateBackupCodes('uuid', '123456')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid TOTP', async () => {
      mockUsersService.findById.mockResolvedValue({
        id: 'uuid',
        mfaEnabled: true,
        mfaSecret: 'enc:SECRET',
      });
      mockEncryptionService.decrypt.mockReturnValue('SECRET');
      (otplib.verifySync as jest.Mock).mockReturnValue({ valid: false });

      await expect(service.regenerateBackupCodes('uuid', 'wrong')).rejects.toThrow(BadRequestException);
    });
  });
});
