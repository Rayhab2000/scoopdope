import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { WebhooksService } from './webhooks.service';
import { Webhook } from './webhook.entity';
import { WebhookDelivery } from './webhook-delivery.entity';

/** Build a valid HMAC-SHA256 signature in the same format the service uses */
function buildSignature(secret: string, body: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

describe('WebhooksService', () => {
  let service: WebhooksService;

  const mockWebhookRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    })),
  };

  const mockDeliveryRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    })),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: getRepositoryToken(Webhook), useValue: mockWebhookRepo },
        { provide: getRepositoryToken(WebhookDelivery), useValue: mockDeliveryRepo },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── verifySignature ────────────────────────────────────────────────────────

  describe('verifySignature', () => {
    const secret = 'test-secret-key';
    const body = JSON.stringify({ event: 'enrollment.created', userId: 'abc123' });

    it('returns true for a valid signature', () => {
      const signature = buildSignature(secret, body);
      expect(service.verifySignature(secret, body, signature)).toBe(true);
    });

    it('returns false for an invalid (tampered) signature', () => {
      const tampered = buildSignature(secret, body).slice(0, -1) + 'x';
      expect(service.verifySignature(secret, body, tampered)).toBe(false);
    });

    it('returns false when the signature is for a different secret', () => {
      const wrongSignature = buildSignature('wrong-secret', body);
      expect(service.verifySignature(secret, body, wrongSignature)).toBe(false);
    });

    it('returns false when the signature is for a different body', () => {
      const differentBody = JSON.stringify({ event: 'credential.issued' });
      const signature = buildSignature(secret, differentBody);
      expect(service.verifySignature(secret, body, signature)).toBe(false);
    });

    it('returns false for an empty signature', () => {
      expect(service.verifySignature(secret, body, '')).toBe(false);
    });

    it('returns false for a completely random string as signature', () => {
      expect(service.verifySignature(secret, body, 'not-a-real-signature')).toBe(false);
    });

    it('does not throw when signature length differs from expected (length mismatch)', () => {
      // Without a length guard, crypto.timingSafeEqual would throw TypeError.
      // This test asserts the method returns false gracefully instead.
      expect(() => service.verifySignature(secret, body, 'short')).not.toThrow();
      expect(service.verifySignature(secret, body, 'short')).toBe(false);
    });

    // ── timestamp / replay-attack guard ─────────────────────────────────────

    describe('with timestamp', () => {
      it('returns true when the timestamp is within the 5-minute window', () => {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signature = buildSignature(secret, body);
        expect(service.verifySignature(secret, body, signature, timestamp)).toBe(true);
      });

      it('returns false when the timestamp is older than 5 minutes', () => {
        const staleTimestamp = (Math.floor(Date.now() / 1000) - 301).toString();
        const signature = buildSignature(secret, body);
        expect(service.verifySignature(secret, body, signature, staleTimestamp)).toBe(false);
      });

      it('returns false when the timestamp is in the far future (clock skew > 5 min)', () => {
        const futureTimestamp = (Math.floor(Date.now() / 1000) + 301).toString();
        const signature = buildSignature(secret, body);
        expect(service.verifySignature(secret, body, signature, futureTimestamp)).toBe(false);
      });

      it('returns false when the timestamp is not a valid number', () => {
        const signature = buildSignature(secret, body);
        expect(service.verifySignature(secret, body, signature, 'not-a-number')).toBe(false);
      });
    });
  });
});
