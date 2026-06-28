// Mock modules with ESM/native deps before any imports resolve them
jest.mock('./mfa.service');
jest.mock('./oauth.service');
jest.mock('./token.service');

import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PasswordResetToken } from './password-reset-token.entity';
import { AuditService } from '../audit/audit.service';
import { TokenService } from './token.service';
import { MfaService } from './mfa.service';
import { OAuthService } from './oauth.service';
import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

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

  const mockMailService = {
    sendVerificationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
  };

  const mockResetTokenRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    })),
  };

  const mockAuditService = { log: jest.fn() };

  const mockTokenService = {
    issueTokenPair: jest.fn(),
    refresh: jest.fn(),
    revokeRefreshToken: jest.fn(),
    generateApiKey: jest.fn(),
    revokeApiKey: jest.fn(),
    generateOpaqueToken: jest.fn(),
    hashToken: jest.fn(),
  };

  const mockMfaService = {
    generateSecret: jest.fn(),
    verifyAndEnable: jest.fn(),
    disable: jest.fn(),
    regenerateBackupCodes: jest.fn(),
    verifyCode: jest.fn(),
  };

  const mockOAuthService = {
    googleLogin: jest.fn(),
    generateStellarChallenge: jest.fn(),
    verifyStellarSignature: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: MailService, useValue: mockMailService },
        { provide: getRepositoryToken(PasswordResetToken), useValue: mockResetTokenRepo },
        { provide: AuditService, useValue: mockAuditService },
        { provide: TokenService, useValue: mockTokenService },
        { provide: MfaService, useValue: mockMfaService },
        { provide: OAuthService, useValue: mockOAuthService },
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

    beforeEach(() => {
      mockTokenService.generateOpaqueToken.mockReturnValue({
        token: 'raw',
        hash: 'hashed',
        expiresAt: new Date(Date.now() + 86400000),
      });
    });

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
    };

    beforeEach(() => {
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true));
      mockTokenService.issueTokenPair.mockResolvedValue({ access_token: 'tok', refresh_token: 'ref' });
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
      mockUsersService.findByEmail.mockResolvedValue({ ...baseUser, mfaEnabled: true });
      const result = await service.login(email, password);
      expect(result).toEqual({ mfa_required: true });
    });

    it('returns tokens when valid TOTP token is provided', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ ...baseUser, mfaEnabled: true });
      mockMfaService.verifyCode.mockResolvedValue(true);

      const result = await service.login(email, password, '123456');
      expect(result).toHaveProperty('access_token');
    });

    it('throws UnauthorizedException for invalid MFA code', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ ...baseUser, mfaEnabled: true });
      mockMfaService.verifyCode.mockResolvedValue(false);

      await expect(service.login(email, password, 'wrong')).rejects.toThrow(UnauthorizedException);
    });

    it('accepts a valid backup code when TOTP fails', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ ...baseUser, mfaEnabled: true });
      mockMfaService.verifyCode.mockResolvedValue(true);

      const result = await service.login(email, password, 'BACKUPCODE');
      expect(result).toHaveProperty('access_token');
    });
  });

  // ── generateMfaSecret ─────────────────────────────────────────────────────

  describe('generateMfaSecret', () => {
    it('delegates to MfaService.generateSecret', async () => {
      mockMfaService.generateSecret.mockResolvedValue({ secret: 'S', qrCodeDataUrl: 'data:' });
      const result = await service.generateMfaSecret('uuid');
      expect(mockMfaService.generateSecret).toHaveBeenCalledWith('uuid');
      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('qrCodeDataUrl');
    });
  });

  // ── verifyMfaSecret ───────────────────────────────────────────────────────

  describe('verifyMfaSecret', () => {
    it('enables MFA and returns backup codes on valid code', async () => {
      mockMfaService.verifyAndEnable.mockResolvedValue({
        message: 'MFA enabled successfully',
        backupCodes: Array(8).fill('CODE'),
      });
      const result = await service.verifyMfaSecret('uuid', '123456');
      expect(result.message).toBe('MFA enabled successfully');
      expect(result.backupCodes).toHaveLength(8);
    });

    it('throws BadRequestException for invalid code', async () => {
      mockMfaService.verifyAndEnable.mockRejectedValue(new BadRequestException('Invalid MFA code'));
      await expect(service.verifyMfaSecret('uuid', 'wrong')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if MFA setup not initiated', async () => {
      mockMfaService.verifyAndEnable.mockRejectedValue(new BadRequestException('MFA setup not initiated'));
      await expect(service.verifyMfaSecret('uuid', '123456')).rejects.toThrow(BadRequestException);
    });
  });

  // ── disableMfa ────────────────────────────────────────────────────────────

  describe('disableMfa', () => {
    it('disables MFA on valid code', async () => {
      mockMfaService.disable.mockResolvedValue({ message: 'MFA disabled successfully' });
      const result = await service.disableMfa('uuid', '123456');
      expect(result.message).toBe('MFA disabled successfully');
    });

    it('throws BadRequestException if MFA not enabled', async () => {
      mockMfaService.disable.mockRejectedValue(new BadRequestException('MFA is not enabled'));
      await expect(service.disableMfa('uuid', '123456')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid code', async () => {
      mockMfaService.disable.mockRejectedValue(new BadRequestException('Invalid MFA code'));
      await expect(service.disableMfa('uuid', 'wrong')).rejects.toThrow(BadRequestException);
    });
  });

  // ── regenerateBackupCodes ─────────────────────────────────────────────────

  describe('regenerateBackupCodes', () => {
    it('returns 8 new backup codes on valid TOTP', async () => {
      mockMfaService.regenerateBackupCodes.mockResolvedValue({ backupCodes: Array(8).fill('CODE') });
      const result = await service.regenerateBackupCodes('uuid', '123456');
      expect(result.backupCodes).toHaveLength(8);
    });

    it('throws BadRequestException if MFA not enabled', async () => {
      mockMfaService.regenerateBackupCodes.mockRejectedValue(new BadRequestException('MFA is not enabled'));
      await expect(service.regenerateBackupCodes('uuid', '123456')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid TOTP', async () => {
      mockMfaService.regenerateBackupCodes.mockRejectedValue(new BadRequestException('Invalid MFA code'));
      await expect(service.regenerateBackupCodes('uuid', 'wrong')).rejects.toThrow(BadRequestException);
    });
  });
});
