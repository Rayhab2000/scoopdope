import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKey } from '../auth/api-key.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit-log.entity';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepo: Repository<ApiKey>,
    private readonly auditService: AuditService,
  ) {}

  async findByUser(userId: string): Promise<ApiKey[]> {
    return this.apiKeyRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string, userId?: string): Promise<ApiKey> {
    const where: any = { id };
    if (userId) where.userId = userId;

    const key = await this.apiKeyRepo.findOne({ where });
    if (!key) throw new NotFoundException('API key not found');
    return key;
  }

  async create(userId: string, name: string, description?: string) {
    const rawKey = `bst_${crypto.randomBytes(32).toString('hex')}`;
    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const key = await this.apiKeyRepo.save(
      this.apiKeyRepo.create({
        name,
        description: description || null,
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
    if (data.description !== undefined) key.description = data.description;

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
      items: items.map((k) => ({
        id: k.id,
        name: k.name,
        description: k.description,
        maskedKey: this.maskHash(k.keyHash),
        isActive: k.isActive,
        userId: k.userId,
        userEmail: (k as any).user?.email,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
      })),
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
    return {
      id: key.id,
      name: key.name,
      description: key.description || undefined,
      maskedKey: `bst_${prefix}...`,
      isActive: key.isActive,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt || undefined,
    };
  }

  private maskHash(hash: string): string {
    return `bst_${hash.substring(0, 8)}...`;
  }
}
