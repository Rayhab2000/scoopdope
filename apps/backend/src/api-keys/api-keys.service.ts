import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKey } from '../auth/api-key.entity';
import { EncryptionService } from '../common/encryption.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit-log.entity';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepo: Repository<ApiKey>,
    private readonly encryptionService: EncryptionService,
    private readonly auditService: AuditService,
  ) {}

  async findByUser(userId: string): Promise<ApiKey[]> {
    const keys = await this.apiKeyRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return keys.map((k) => this.decryptApiKey(k));
  }

  async findById(id: string, userId?: string): Promise<ApiKey> {
    const where: any = { id };
    if (userId) where.userId = userId;

    const key = await this.apiKeyRepo.findOne({ where });
    if (!key) throw new NotFoundException('API key not found');
    return this.decryptApiKey(key);
  }

  private decryptApiKey(key: ApiKey): ApiKey {
    if (!key.description) return key;
    try {
      const decrypted = this.encryptionService.decrypt(key.description);
      return { ...key, description: decrypted };
    } catch {
      this.logger.warn(`Failed to decrypt description for API key ${key.id}`);
      return key;
    }
  }

  async create(userId: string, name: string, description?: string) {
    const rawKey = `bst_${crypto.randomBytes(32).toString('hex')}`;
    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const encryptedDescription = description
      ? this.encryptionService.encrypt(description)
      : null;

    const key = await this.apiKeyRepo.save(
      this.apiKeyRepo.create({
        name,
        description: encryptedDescription,
        keyHash: hash,
        userId,
        isActive: true,
      }),
    );

    await this.auditService.log(AuditAction.API_KEY_CREATED, userId, true, {
      keyId: key.id,
      name,
    });

    return {
      id: key.id,
      name: key.name,
      apiKey: rawKey,
      warning: 'Store this API key securely. It will not be shown again.',
    };
  }

  async update(id: string, userId: string, data: { name?: string; description?: string }) {
    const key = await this.findById(id, userId);

    if (data.name !== undefined) key.name = data.name;
    if (data.description !== undefined) {
      key.description = data.description
        ? this.encryptionService.encrypt(data.description)
        : null;
    }

    await this.apiKeyRepo.save(key);
    return this.maskKey(key);
  }

  async revoke(id: string, userId: string) {
    const key = await this.findById(id, userId);

    if (!key.isActive) {
      throw new ConflictException('API key is already revoked');
    }

    key.isActive = false;
    await this.apiKeyRepo.save(key);

    await this.auditService.log(AuditAction.API_KEY_REVOKED, userId, true, {
      keyId: id,
      name: key.name,
    });

    return { message: 'API key revoked successfully' };
  }

  async rotate(id: string, userId: string) {
    const key = await this.findById(id, userId);

    if (!key.isActive) {
      throw new ConflictException('Cannot rotate a revoked API key');
    }

    const rawKey = `bst_${crypto.randomBytes(32).toString('hex')}`;
    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');

    key.keyHash = hash;
    key.lastUsedAt = null;
    await this.apiKeyRepo.save(key);

    await this.auditService.log(AuditAction.API_KEY_ROTATED, userId, true, {
      keyId: id,
    });

    return {
      id: key.id,
      name: key.name,
      apiKey: rawKey,
      warning: 'Store this API key securely. It will not be shown again.',
    };
  }

  async adminFindAll(query: {
    userId?: string;
    isActive?: boolean;
    page: number;
    limit: number;
  }) {
    const qb = this.apiKeyRepo.createQueryBuilder('key')
      .leftJoinAndSelect('key.user', 'user')
      .orderBy('key.createdAt', 'DESC');

    if (query.userId) {
      qb.andWhere('key.userId = :userId', { userId: query.userId });
    }
    if (query.isActive !== undefined) {
      qb.andWhere('key.isActive = :isActive', { isActive: query.isActive });
    }

    const total = await qb.getCount();
    const items = await qb
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();

    return {
      items: items.map((k) => {
        const decrypted = this.decryptApiKey(k);
        return {
          id: decrypted.id,
          name: decrypted.name,
          description: decrypted.description,
          maskedKey: this.maskHash(decrypted.keyHash),
          isActive: decrypted.isActive,
          userId: decrypted.userId,
          userEmail: (decrypted as any).user?.email,
          createdAt: decrypted.createdAt,
          lastUsedAt: decrypted.lastUsedAt,
        };
      }),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async adminForceRevoke(id: string) {
    const key = await this.findById(id);

    if (!key.isActive) {
      throw new ConflictException('API key is already revoked');
    }

    key.isActive = false;
    await this.apiKeyRepo.save(key);

    await this.auditService.log(AuditAction.API_KEY_REVOKED, key.userId, true, {
      keyId: id,
      name: key.name,
      forcedByAdmin: true,
    });

    return { message: 'API key revoked by admin' };
  }

  maskKey(key: ApiKey) {
    const prefix = key.keyHash.substring(0, 8);
    const decrypted = this.decryptApiKey(key);
    return {
      id: decrypted.id,
      name: decrypted.name,
      description: decrypted.description || undefined,
      maskedKey: `bst_${prefix}...`,
      isActive: decrypted.isActive,
      createdAt: decrypted.createdAt,
      lastUsedAt: decrypted.lastUsedAt || undefined,
    };
  }

  private maskHash(hash: string): string {
    return `bst_${hash.substring(0, 8)}...`;
  }
}
