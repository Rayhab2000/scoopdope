import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { SubscriptionsService } from './subscriptions.service';
import { User, SubscriptionTier } from '../users/user.entity';

// ── Mock Stripe ───────────────────────────────────────────────────────────────
jest.mock('stripe');

import Stripe from 'stripe';

const mockStripeWebhooksConstructEvent = jest.fn();
const mockStripeCheckoutSessionsCreate = jest.fn();
const mockStripeSubscriptionsRetrieve = jest.fn();

(Stripe as jest.MockedClass<typeof Stripe>).mockImplementation(
  () =>
    ({
      webhooks: { constructEvent: mockStripeWebhooksConstructEvent },
      checkout: { sessions: { create: mockStripeCheckoutSessionsCreate } },
      subscriptions: { retrieve: mockStripeSubscriptionsRetrieve },
    }) as any,
);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;

  const mockUserRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        'stripe.secretKey': 'sk_test_mock',
        'stripe.webhookSecret': 'whsec_mock',
        'stripe.proPriceId': 'price_pro_mock',
        'stripe.enterprisePriceId': 'price_enterprise_mock',
        'frontend.url': 'http://localhost:3001',
      };
      return config[key] ?? '';
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── handleWebhook: checkout.session.completed ───────────────────────────────

  describe('handleWebhook — checkout.session.completed', () => {
    const userId = 'user-uuid';
    const stripeCustomerId = 'cus_mock';
    const stripeSubscriptionId = 'sub_mock';
    const currentPeriodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

    const makeCheckoutEvent = (tier: SubscriptionTier): Stripe.Event => ({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { userId, tier },
          customer: stripeCustomerId,
          subscription: stripeSubscriptionId,
        } as any,
      },
    } as Stripe.Event);

    beforeEach(() => {
      mockStripeSubscriptionsRetrieve.mockResolvedValue({
        current_period_end: currentPeriodEnd,
      });
      mockUserRepo.update.mockResolvedValue(undefined);
    });

    it('upgrades the user subscription tier to PRO on checkout.session.completed', async () => {
      const event = makeCheckoutEvent(SubscriptionTier.PRO);
      mockStripeWebhooksConstructEvent.mockReturnValue(event);

      await service.handleWebhook('sig', Buffer.from('payload'));

      expect(mockUserRepo.update).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ subscriptionTier: SubscriptionTier.PRO }),
      );
    });

    it('upgrades the user subscription tier to ENTERPRISE on checkout.session.completed', async () => {
      const event = makeCheckoutEvent(SubscriptionTier.ENTERPRISE);
      mockStripeWebhooksConstructEvent.mockReturnValue(event);

      await service.handleWebhook('sig', Buffer.from('payload'));

      expect(mockUserRepo.update).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ subscriptionTier: SubscriptionTier.ENTERPRISE }),
      );
    });

    it('persists stripeCustomerId and stripeSubscriptionId on checkout completion', async () => {
      const event = makeCheckoutEvent(SubscriptionTier.PRO);
      mockStripeWebhooksConstructEvent.mockReturnValue(event);

      await service.handleWebhook('sig', Buffer.from('payload'));

      expect(mockUserRepo.update).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          stripeCustomerId,
          stripeSubscriptionId,
        }),
      );
    });

    it('persists subscriptionExpiresAt from Stripe subscription period end', async () => {
      const event = makeCheckoutEvent(SubscriptionTier.PRO);
      mockStripeWebhooksConstructEvent.mockReturnValue(event);

      await service.handleWebhook('sig', Buffer.from('payload'));

      expect(mockUserRepo.update).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          subscriptionExpiresAt: new Date(currentPeriodEnd * 1000),
        }),
      );
    });

    it('does nothing when checkout session has no metadata userId', async () => {
      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: {
            metadata: {},
            customer: stripeCustomerId,
            subscription: stripeSubscriptionId,
          },
        },
      });

      await service.handleWebhook('sig', Buffer.from('payload'));

      expect(mockUserRepo.update).not.toHaveBeenCalled();
    });
  });

  // ── handleWebhook: customer.subscription.updated ────────────────────────────

  describe('handleWebhook — customer.subscription.updated', () => {
    const stripeSubscriptionId = 'sub_mock';
    const currentPeriodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

    const makeSubEvent = (
      status: string,
      eventType: Stripe.Event['type'] = 'customer.subscription.updated',
    ): Stripe.Event => ({
      type: eventType,
      data: {
        object: {
          id: stripeSubscriptionId,
          status,
          current_period_end: currentPeriodEnd,
        } as any,
      },
    } as Stripe.Event);

    it('extends subscriptionExpiresAt when subscription is active', async () => {
      const user = { id: 'user-uuid', stripeSubscriptionId } as User;
      mockUserRepo.findOne.mockResolvedValue(user);
      mockUserRepo.update.mockResolvedValue(undefined);
      mockStripeWebhooksConstructEvent.mockReturnValue(makeSubEvent('active'));

      await service.handleWebhook('sig', Buffer.from('payload'));

      expect(mockUserRepo.update).toHaveBeenCalledWith(
        user.id,
        expect.objectContaining({
          subscriptionExpiresAt: new Date(currentPeriodEnd * 1000),
        }),
      );
    });

    it('downgrades user to FREE tier when subscription status is not active', async () => {
      const user = { id: 'user-uuid', stripeSubscriptionId } as User;
      mockUserRepo.findOne.mockResolvedValue(user);
      mockUserRepo.update.mockResolvedValue(undefined);
      mockStripeWebhooksConstructEvent.mockReturnValue(makeSubEvent('canceled'));

      await service.handleWebhook('sig', Buffer.from('payload'));

      expect(mockUserRepo.update).toHaveBeenCalledWith(
        user.id,
        expect.objectContaining({
          subscriptionTier: SubscriptionTier.FREE,
          subscriptionExpiresAt: null,
        }),
      );
    });

    it('handles customer.subscription.deleted event as a downgrade to FREE', async () => {
      const user = { id: 'user-uuid', stripeSubscriptionId } as User;
      mockUserRepo.findOne.mockResolvedValue(user);
      mockUserRepo.update.mockResolvedValue(undefined);
      mockStripeWebhooksConstructEvent.mockReturnValue(
        makeSubEvent('canceled', 'customer.subscription.deleted'),
      );

      await service.handleWebhook('sig', Buffer.from('payload'));

      expect(mockUserRepo.update).toHaveBeenCalledWith(
        user.id,
        expect.objectContaining({ subscriptionTier: SubscriptionTier.FREE }),
      );
    });

    it('does nothing when no user is found for the subscription ID', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      mockStripeWebhooksConstructEvent.mockReturnValue(makeSubEvent('canceled'));

      await service.handleWebhook('sig', Buffer.from('payload'));

      expect(mockUserRepo.update).not.toHaveBeenCalled();
    });
  });

  // ── handleWebhook: unhandled/unsupported event types ────────────────────────

  describe('handleWebhook — unsupported event types', () => {
    it('ignores unsupported event types without throwing', async () => {
      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: 'payment_intent.created',
        data: { object: {} },
      });

      await expect(
        service.handleWebhook('sig', Buffer.from('payload')),
      ).resolves.toBeUndefined();

      expect(mockUserRepo.update).not.toHaveBeenCalled();
    });

    it('does not call userRepo for unknown event types', async () => {
      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: 'invoice.payment_failed',
        data: { object: {} },
      });

      await service.handleWebhook('sig', Buffer.from('payload'));

      expect(mockUserRepo.findOne).not.toHaveBeenCalled();
      expect(mockUserRepo.update).not.toHaveBeenCalled();
    });
  });

  // ── handleWebhook: signature verification failure ───────────────────────────

  describe('handleWebhook — signature verification', () => {
    it('throws BadRequestException when signature verification fails', async () => {
      mockStripeWebhooksConstructEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature');
      });

      await expect(
        service.handleWebhook('invalid_sig', Buffer.from('payload')),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
