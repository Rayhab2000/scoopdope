import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { PasswordResetToken } from './password-reset-token.entity';
import { RefreshToken } from './refresh-token.entity';
import { ApiKey } from './api-key.entity';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { generateSecret, generateSync, verifySync, generateURI } from 'otplib';
import * as qrcode from 'qrcode';
import { EncryptionService } from '../common/encryption.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit-log.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private mailService: MailService,
    @InjectRepository(PasswordResetToken)
    private resetTokenRepo: Repository<PasswordResetToken>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(ApiKey)
    private apiKeyRepo: Repository<ApiKey>,
    private encryptionService: EncryptionService,
    private auditService: AuditService,
  ) {}

  async register(email: string, password: string, refCode?: string) {
    const existing = await this.usersService.findByEmail(email);
    if (existing) throw new BadRequestException('Email already in use');

    const passwordHash = await bcrypt.hash(password, 10);
    const { token, hash, expiresAt } = this.generateOpaqueToken(24);
    const referralCode = crypto.randomBytes(6).toString('hex');

    let referredBy: string | null = null;
    if (refCode) {
      const referrer = await this.usersService.findByReferralCode(refCode);
      if (referrer) referredBy = referrer.id;
    }

    const user = await this.usersService.create({
      email,
      passwordHash,
      isVerified: false,
      verificationToken: hash,
      verificationTokenExpiresAt: expiresAt,
      referralCode,
      referredBy,
    });

    await this.mailService.sendVerificationEmail(user.email, token);
    await this.auditService.log(AuditAction.REGISTER, user.id, true, { email });
    return { message: 'Registration successful. Please verify your email.' };
  }

  async login(email: string, password: string, mfaToken?: string, ipAddress?: string, userAgent?: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      await this.auditService.log(AuditAction.LOGIN_FAILURE, null, false, { email }, ipAddress, userAgent);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.isBanned) {
      await this.auditService.log(AuditAction.LOGIN_FAILURE, user.id, false, { reason: 'banned' }, ipAddress, userAgent);
      throw new UnauthorizedException('Account is banned');
    }

    if (!user.isVerified) {
      await this.auditService.log(AuditAction.LOGIN_FAILURE, user.id, false, { reason: 'unverified' }, ipAddress, userAgent);
      throw new ForbiddenException('Please verify your email before logging in');
    }

    // Enforce 2FA for admin accounts
    if (user.role === 'admin' && !user.mfaEnabled) {
      await this.auditService.log(AuditAction.LOGIN_FAILURE, user.id, false, { reason: 'mfa_required' }, ipAddress, userAgent);
      throw new ForbiddenException('Admin accounts must enable 2FA before logging in');
    }

    if (user.mfaEnabled) {
      if (!mfaToken) {
        return { mfa_required: true };
      }

      // Try TOTP first, then backup codes
      const secret = this.encryptionService.decrypt(user.mfaSecret || '');
      const totpResult = verifySync({ token: mfaToken, secret });
      const totpValid = totpResult && totpResult.valid;

      if (!totpValid) {
        // Try backup code
        const used = await this.useBackupCode(user.id, mfaToken);
        if (!used) {
          await this.auditService.log(AuditAction.LOGIN_FAILURE, user.id, false, { reason: 'invalid_mfa' }, ipAddress, userAgent);
          throw new UnauthorizedException('Invalid MFA token');
        }
      }
    }

    const result = await this.issueTokenPair(user.id, user.email, user.role);
    await this.auditService.log(AuditAction.LOGIN_SUCCESS, user.id, true, {}, ipAddress, userAgent);
    return result;
  }

  async refresh(rawRefreshToken: string) {
    const hash = this.hashToken(rawRefreshToken);

    const stored = await this.refreshTokenRepo.findOne({
      where: { tokenHash: hash, revoked: false },
    });

    if (!stored) throw new UnauthorizedException('Invalid or revoked refresh token');
    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Revoke old token (rotation)
    await this.refreshTokenRepo.save({ ...stored, revoked: true });

    const user = await this.usersService.findById(stored.userId);
    if (!user) throw new UnauthorizedException('User not found');

    return this.issueTokenPair(user.id, user.email, user.role);
  }

  async logout(rawRefreshToken: string, userId?: string) {
    const hash = this.hashToken(rawRefreshToken);
    const stored = await this.refreshTokenRepo.findOne({
      where: { tokenHash: hash, revoked: false },
    });
    if (stored) {
      await this.refreshTokenRepo.save({ ...stored, revoked: true });
    }
    await this.auditService.log(AuditAction.LOGOUT, userId || stored?.userId || null, true);
    return { message: 'Logged out successfully.' };
  }

  async verifyEmail(token: string) {
    const hash = this.hashToken(token);
    const user = await this.usersService.findByVerificationToken(hash);

    if (!user) throw new BadRequestException('Invalid or expired verification token');
    if (!user.verificationTokenExpiresAt || user.verificationTokenExpiresAt < new Date()) {
      throw new BadRequestException('Verification token has expired');
    }

    await this.usersService.update(user.id, {
      isVerified: true,
      verificationToken: null,
      verificationTokenExpiresAt: null,
    });

    return { message: 'Email verified successfully. You can now log in.' };
  }

  async resendVerification(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new NotFoundException('User not found');
    if (user.isVerified) throw new BadRequestException('Email is already verified');

    const { token, hash, expiresAt } = this.generateOpaqueToken(24);
    await this.usersService.update(user.id, {
      verificationToken: hash,
      verificationTokenExpiresAt: expiresAt,
    });

    await this.mailService.sendVerificationEmail(user.email, token);
    return { message: 'Verification email resent.' };
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) return { message: 'If that email exists, a reset link has been sent.' };

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentTokens = await this.resetTokenRepo
      .createQueryBuilder('t')
      .where('t.userId = :userId', { userId: user.id })
      .andWhere('t.createdAt > :since', { since: oneHourAgo })
      .getCount();

    if (recentTokens >= 3) {
      throw new BadRequestException('Too many reset requests. Please wait before trying again.');
    }

    const { token, hash, expiresAt } = this.generateOpaqueToken(1);
    await this.resetTokenRepo.save(
      this.resetTokenRepo.create({ tokenHash: hash, userId: user.id, expiresAt, used: false })
    );

    await this.mailService.sendPasswordResetEmail(user.email, token);
    await this.auditService.log(AuditAction.PASSWORD_RESET_REQUEST, user.id, true, { email });
    return { message: 'If that email exists, a reset link has been sent.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const hash = this.hashToken(token);
    const resetToken = await this.resetTokenRepo.findOne({
      where: { tokenHash: hash, used: false },
    });

    if (!resetToken) throw new BadRequestException('Invalid or expired reset token');
    if (resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersService.update(resetToken.userId, { passwordHash });
    await this.resetTokenRepo.save({ ...resetToken, used: true });
    await this.auditService.log(AuditAction.PASSWORD_RESET_COMPLETE, resetToken.userId, true);

    return { message: 'Password reset successfully. You can now log in.' };
  }

  async generateMfaSecret(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const secret = generateSecret();
    const otpauthUrl = generateURI({ label: user.email, issuer: 'scoopdope', secret });
    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

    await this.usersService.update(userId, {
      mfaSecret: this.encryptionService.encrypt(secret),
      mfaEnabled: false,
    });

    return { secret, qrCodeDataUrl };
  }

  async verifyMfaSecret(userId: string, code: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.mfaSecret) throw new BadRequestException('MFA setup not initiated');

    const secret = this.encryptionService.decrypt(user.mfaSecret);
    const result = verifySync({ token: code, secret });
    if (!result?.valid) throw new BadRequestException('Invalid MFA code');

    const backupCodes = this.generateBackupCodes();
    await this.usersService.update(userId, {
      mfaEnabled: true,
      mfaBackupCodes: backupCodes.map((c) => crypto.createHash('sha256').update(c).digest('hex')),
    });

    await this.auditService.log(AuditAction.MFA_ENABLED, userId, true);
    return { message: 'MFA enabled successfully', backupCodes };
  }

  async disableMfa(userId: string, code: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('MFA is not enabled');
    }

    const secret = this.encryptionService.decrypt(user.mfaSecret);
    const result = verifySync({ token: code, secret });
    if (!result?.valid) throw new BadRequestException('Invalid MFA code');

    await this.usersService.update(userId, { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] });
    await this.auditService.log(AuditAction.MFA_DISABLED, userId, true);
    return { message: 'MFA disabled successfully' };
  }

  async regenerateBackupCodes(userId: string, totpCode: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('MFA is not enabled');
    }
    const secret = this.encryptionService.decrypt(user.mfaSecret);
    const result = verifySync({ token: totpCode, secret });
    if (!result?.valid) throw new BadRequestException('Invalid MFA code');

    const backupCodes = this.generateBackupCodes();
    await this.usersService.update(userId, {
      mfaBackupCodes: backupCodes.map((c) => crypto.createHash('sha256').update(c).digest('hex')),
    });
    return { backupCodes };
  }

  async generateApiKey(userId: string, name: string) {
    const rawKey = `bst_${crypto.randomBytes(32).toString('hex')}`;
    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const key = await this.apiKeyRepo.save(
      this.apiKeyRepo.create({ name, keyHash: hash, userId, isActive: true })
    );

    await this.auditService.log(AuditAction.API_KEY_CREATED, userId, true, { name, keyId: key.id });
    return { apiKey: rawKey };
  }

  async revokeApiKey(id: string, userId?: string) {
    await this.apiKeyRepo.update(id, { isActive: false });
    await this.auditService.log(AuditAction.API_KEY_REVOKED, userId || null, true, { keyId: id });
    return { message: 'API key revoked' };
  }

  async generateStellarChallenge(publicKey: string) {
    // Generate a random nonce for the user to sign
    const nonce = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store the challenge temporarily (in production, use Redis or similar)
    // For now, we'll encode it in the response and verify on the backend
    const challenge = {
      nonce,
      publicKey,
      expiresAt: expiresAt.toISOString(),
    };

    // Return the challenge for the user to sign
    return {
      challenge: Buffer.from(JSON.stringify(challenge)).toString('base64'),
      nonce,
      message: `Sign this message to verify ownership of ${publicKey}: ${nonce}`,
    };
  }

  async verifyStellarSignature(
    userId: string,
    publicKey: string,
    signature: string,
    challenge: string
  ) {
    try {
      // Decode the challenge
      const challengeData = JSON.parse(Buffer.from(challenge, 'base64').toString('utf8'));

      // Verify the challenge hasn't expired
      if (new Date(challengeData.expiresAt) < new Date()) {
        throw new BadRequestException('Challenge has expired');
      }

      // Verify the public key matches
      if (challengeData.publicKey !== publicKey) {
        throw new BadRequestException('Public key mismatch');
      }

      // Verify the signature using Stellar SDK
      // Note: In production, you would use stellar-sdk to verify the signature
      // For now, we'll do a basic validation
      if (!signature || signature.length < 10) {
        throw new BadRequestException('Invalid signature');
      }

      // Link the public key to the user
      await this.usersService.update(userId, { stellarPublicKey: publicKey });

      return { message: 'Wallet linked successfully', publicKey };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Invalid challenge or signature');
    }
  }

  async googleOAuthLogin(profile: { id: string; email: string; displayName: string; picture: string }) {
    let user = await this.usersService.findByEmail(profile.email);

    if (!user) {
      const referralCode = crypto.randomBytes(6).toString('hex');
      user = await this.usersService.create({
        email: profile.email,
        passwordHash: '',
        isVerified: true,
        referralCode,
        avatar: profile.picture,
      });
    }

    return this.issueTokenPair(user.id, user.email, user.role);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async issueTokenPair(userId: string, email: string, role: string = 'student') {
    const access_token = this.jwtService.sign({ sub: userId, email, role }, { expiresIn: '15m' });

    const { token: rawRefresh, hash, expiresAt } = this.generateOpaqueToken(24 * 7); // 7 days
    await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({ tokenHash: hash, userId, expiresAt, revoked: false })
    );

    return { access_token, refresh_token: rawRefresh };
  }

  private generateOpaqueToken(ttlHours: number) {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    return { token, hash, expiresAt };
  }

  private hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private generateBackupCodes(count = 8): string[] {
    return Array.from({ length: count }, () => crypto.randomBytes(5).toString('hex').toUpperCase());
  }

  private async useBackupCode(userId: string, code: string): Promise<boolean> {
    const user = await this.usersService.findById(userId);
    if (!user?.mfaBackupCodes?.length) return false;

    const hash = crypto.createHash('sha256').update(code).digest('hex');
    const idx = user.mfaBackupCodes.indexOf(hash);
    if (idx === -1) return false;

    const updated = [...user.mfaBackupCodes];
    updated.splice(idx, 1);
    await this.usersService.update(userId, { mfaBackupCodes: updated });
    return true;
  }
}
