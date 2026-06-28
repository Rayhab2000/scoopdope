import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as qrcode from 'qrcode';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { EncryptionService } from '../common/encryption.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit-log.entity';

@Injectable()
export class MfaService {
  constructor(
    private usersService: UsersService,
    private encryptionService: EncryptionService,
    private auditService: AuditService,
  ) {}

  async generateSecret(userId: string) {
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

  async verifyAndEnable(userId: string, code: string) {
    const user = await this.usersService.findById(userId);
    if (!user?.mfaSecret) throw new BadRequestException('MFA setup not initiated');

    const secret = this.encryptionService.decrypt(user.mfaSecret);
    if (!verifySync({ token: code, secret })?.valid) throw new BadRequestException('Invalid MFA code');

    const backupCodes = this.generateBackupCodes();
    await this.usersService.update(userId, {
      mfaEnabled: true,
      mfaBackupCodes: backupCodes.map((c) => crypto.createHash('sha256').update(c).digest('hex')),
    });

    await this.auditService.log(AuditAction.MFA_ENABLED, userId, true);
    return { message: 'MFA enabled successfully', backupCodes };
  }

  async disable(userId: string, code: string) {
    const user = await this.usersService.findById(userId);
    if (!user?.mfaEnabled || !user.mfaSecret) throw new BadRequestException('MFA is not enabled');

    const secret = this.encryptionService.decrypt(user.mfaSecret);
    if (!verifySync({ token: code, secret })?.valid) throw new BadRequestException('Invalid MFA code');

    await this.usersService.update(userId, { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] });
    await this.auditService.log(AuditAction.MFA_DISABLED, userId, true);
    return { message: 'MFA disabled successfully' };
  }

  async regenerateBackupCodes(userId: string, totpCode: string) {
    const user = await this.usersService.findById(userId);
    if (!user?.mfaEnabled || !user.mfaSecret) throw new BadRequestException('MFA is not enabled');

    const secret = this.encryptionService.decrypt(user.mfaSecret);
    if (!verifySync({ token: totpCode, secret })?.valid) throw new BadRequestException('Invalid MFA code');

    const backupCodes = this.generateBackupCodes();
    await this.usersService.update(userId, {
      mfaBackupCodes: backupCodes.map((c) => crypto.createHash('sha256').update(c).digest('hex')),
    });
    return { backupCodes };
  }

  async verifyCode(userId: string, code: string): Promise<boolean> {
    const user = await this.usersService.findById(userId);
    if (!user?.mfaSecret) return false;

    const secret = this.encryptionService.decrypt(user.mfaSecret);
    if (verifySync({ token: code, secret })?.valid) return true;
    return this.useBackupCode(userId, code);
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

  private generateBackupCodes(count = 8): string[] {
    return Array.from({ length: count }, () => crypto.randomBytes(5).toString('hex').toUpperCase());
  }
}
