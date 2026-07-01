import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import Stripe from 'stripe';

import { SubscriptionsService } from './subscriptions.service';
import { User, SubscriptionTier } from '../users/user.entity';

// ---------------------------------------------------------------------------
// Stripe SDK mock
// We mock the whole stripe module so no real HTTP calls are made.
// ---------------------------------------------------------------------------

jest.mock('stripe');
const StripeMock = Stripe as jest.MockedClass<typeof Stripe>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'user-uuid-1';
const STRIPE_CUSTOMER_ID = 'cus_test123';
const STRIPE_SUB_ID = 'sub_test123';
const WEBHOOK_SECRET = 'whsec_test';
const PRO_PRICE_ID = 'price_pro';
const ENTERPRISE_PRICE_ID = 'price_enterprise';
const CURRENT_PERIOD_END = 1_800_000_000; // arbitrary Unix timestamp

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    email: 'user@example.com',
    username: 'testuser',
    passwordHash: 'hashed',
    avatar: null,
    bio: null,
    stellarPublicKey: null,
    role: 'student',
    isBanned: false,
    isVerified: true,
    deletedAt: null,
    verificationToken: null,
    verificationTokenExpiresAt: null,
    mfaEnabled: false,
    mfaSecret: null,
    mfaBackupCodes: null,
    referralCode: null,
    referredBy: null,
    currentStreak: 0,
    longestStreak: 0,
    lastActivityAt: null,
    subscriptionTier: SubscriptionTier.FREE,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionExpiresAt: null,
    notificationPreferences: {
      courseUpdates: true,
      liveSessions: true,
      tokenRewards: true,
      pushEnabled: false,
    },
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

/**
 * Build a minimal Stripe.Checkout.Session object for testing
 * handleCheckoutCompleted.
 */
function makeCheckoutSession(
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    id: 'cs_test123',
    object: 'checkout.session',
    customer: STRIPE_CUSTOMER_ID,
    subscription: STRIPE_SUB_ID,
    metadata: { userId: USER_ID, tier: SubscriptionTier.PRO },
    payment_status: 'paid',
    status: 'complete',
    ...overrides,
  } as Stripe.Checkout.Session;
}

/**
 * Build a minimal Stripe.Subscription object for testing
 * handleSubscriptionUpdated.
 */
function makeStripeSubscription(
  status: Stripe.Subscription.Status,
  overrides: Partial<Stripe.Subscription> = {},
): Stripe.Subscription {
  return {
    id: STRIPE_SUB_ID,
    object: 'subscription',
    status,
    current_period_end: CURRENT_PERIOD_END,
    customer: STRIPE_CUSTOMER_ID,
    ...overrides,
  } as Stripe.Subscription;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let userRepo: jest.Mocked<Repository<User>>;

  // Stripe instance methods we need to spy on
  let stripeInstance: {
    webhooks: { constructEvent: jest.Mock };
    checkout: { sessions: { create: jest.Mock } };
    subscriptions: { retrieve: jest.Mock };
  };

  beforeEach(async () => {
    // Reset the Stripe constructor mock between tests
    StripeMock.mockClear();

    // Prepare the fake stripe instance that the constructor will return
    stripeInstance = {
      webhooks: { constructEvent: jest.fn() },
      checkout: { sessions: { create: jest.fn() } },
      subscriptions: { retrieve: jest.fn() },
    };

    StripeMock.mockImplementation(() => stripeInstance as any);

    const mockUserRepo: Partial<jest.Mocked<Repository<User>>> = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          'stripe.secretKey': 'sk_test_fake',
          'stripe.webhookSecret': WEBHOOK_SECRET,
          'stripe.proPriceId': PRO_PRICE_ID,
          'stripe.enterprisePriceId': ENTERPRISE_PRICE_ID,
          'frontend.url': 'http://localhost:3001',
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get(SubscriptionsService);
    userRepo = module.get(getRepositoryToken(User));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // handleWebhook — signature verification
  // ─────────────────────────────────────────────────────────────────────────

  describe('handleWebhook — signature verification', () => {
    it('throws BadRequestException when signature verification fails', async () => {
      stripeInstance.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature');
      });

      await expect(
        service.handleWebhook('bad-sig', Buffer.from('payload')),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // handleWebhook — checkout.session.completed
  // ─────────────────────────────────────────────────────────────────────────

  describe('handleWebhook — checkout.session.completed', () => {
    it('upgrades user to PRO tier and persists Stripe IDs on checkout completion', async () => {
      const session = makeCheckoutSession({
        metadata: { userId: USER_ID, tier: SubscriptionTier.PRO },
      });

      const stripeSubscription = makeStripeSubscription('active');
      stripeInstance.subscriptions.retrieve.mockResolvedValue(stripeSubscription);

      stripeInstance.webhooks.constructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      } as Stripe.Event);

      await service.handleWebhook('valid-sig', Buffer.from('payload'));

      expect(stripeInstance.subscriptions.retrieve).toHaveBeenCalledWith(STRIPE_SUB_ID);
      expect(userRepo.update).toHaveBeenCalledWith(USER_ID, {
        subscriptionTier: SubscriptionTier.PRO,
        stripeCustomerId: STRIPE_CUSTOMER_ID,
        stripeSubscriptionId: STRIPE_SUB_ID,
        subscriptionExpiresAt: new Date(CURRENT_PERIOD_END * 1000),
      });
    });

    it('upgrades user to ENTERPRISE tier when metadata tier is enterprise', async () => {
      const session = makeCheckoutSession({
        metadata: { userId: USER_ID, tier: SubscriptionTier.ENTERPRISE },
      });

      const stripeSubscription = makeStripeSubscription('active');
      stripeInstance.subscriptions.retrieve.mockResolvedValue(stripeSubscription);

      stripeInstance.webhooks.constructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      } as Stripe.Event);

      await service.handleWebhook('valid-sig', Buffer.from('payload'));

      expect(userRepo.update).toHaveBeenCalledWith(USER_ID, expect.objectContaining({
        subscriptionTier: SubscriptionTier.ENTERPRISE,
      }));
    });

    it('does nothing when session metadata is missing userId', async () => {
      const session = makeCheckoutSession({ metadata: { tier: SubscriptionTier.PRO } });

      stripeInstance.webhooks.constructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      } as Stripe.Event);

      await service.handleWebhook('valid-sig', Buffer.from('payload'));

      expect(stripeInstance.subscriptions.retrieve).not.toHaveBeenCalled();
      expect(userRepo.update).not.toHaveBeenCalled();
    });

    it('does nothing when session metadata is missing tier', async () => {
      const session = makeCheckoutSession({ metadata: { userId: USER_ID } });

      stripeInstance.webhooks.constructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      } as Stripe.Event);

      await service.handleWebhook('valid-sig', Buffer.from('payload'));

      expect(userRepo.update).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // handleWebhook — customer.subscription.updated
  // ─────────────────────────────────────────────────────────────────────────

  describe('handleWebhook — customer.subscription.updated', () => {
    it('updates subscriptionExpiresAt when subscription is active', async () => {
      const user = makeUser({ stripeSubscriptionId: STRIPE_SUB_ID });
      userRepo.findOne.mockResolvedValue(user);

      const subscription = makeStripeSubscription('active');

      stripeInstance.webhooks.constructEvent.mockReturnValue({
        type: 'customer.subscription.updated',
        data: { object: subscription },
      } as Stripe.Event);

      await service.handleWebhook('valid-sig', Buffer.from('payload'));

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: STRIPE_SUB_ID },
      });
      expect(userRepo.update).toHaveBeenCalledWith(user.id, {
        subscriptionExpiresAt: new Date(CURRENT_PERIOD_END * 1000),
      });
    });

    it('downgrades user to FREE and clears expiresAt when subscription is cancelled', async () => {
      const user = makeUser({
        stripeSubscriptionId: STRIPE_SUB_ID,
        subscriptionTier: SubscriptionTier.PRO,
      });
      userRepo.findOne.mockResolvedValue(user);

      const subscription = makeStripeSubscription('canceled');

      stripeInstance.webhooks.constructEvent.mockReturnValue({
        type: 'customer.subscription.updated',
        data: { object: subscription },
      } as Stripe.Event);

      await service.handleWebhook('valid-sig', Buffer.from('payload'));

      expect(userRepo.update).toHaveBeenCalledWith(user.id, {
        subscriptionTier: SubscriptionTier.FREE,
        subscriptionExpiresAt: null,
      });
    });

    it('downgrades user to FREE when subscription status is past_due', async () => {
      const user = makeUser({
        stripeSubscriptionId: STRIPE_SUB_ID,
        subscriptionTier: SubscriptionTier.PRO,
      });
      userRepo.findOne.mockResolvedValue(user);

      const subscription = makeStripeSubscription('past_due');

      stripeInstance.webhooks.constructEvent.mockReturnValue({
        type: 'customer.subscription.updated',
        data: { object: subscription },
      } as Stripe.Event);

      await service.handleWebhook('valid-sig', Buffer.from('payload'));

      expect(userRepo.update).toHaveBeenCalledWith(user.id, {
        subscriptionTier: SubscriptionTier.FREE,
        subscriptionExpiresAt: null,
      });
    });

    it('downgrades user to FREE when subscription status is unpaid', async () => {
      const user = makeUser({
        stripeSubscriptionId: STRIPE_SUB_ID,
        subscriptionTier: SubscriptionTier.ENTERPRISE,
      });
      userRepo.findOne.mockResolvedValue(user);

      const subscription = makeStripeSubscription('unpaid');

      stripeInstance.webhooks.constructEvent.mockReturnValue({
        type: 'customer.subscription.updated',
        data: { object: subscription },
      } as Stripe.Event);

      await service.handleWebhook('valid-sig', Buffer.from('payload'));

      expect(userRepo.update).toHaveBeenCalledWith(user.id, {
        subscriptionTier: SubscriptionTier.FREE,
        subscriptionExpiresAt: null,
      });
    });

    it('does nothing when no user is found for the subscription ID', async () => {
      userRepo.findOne.mockResolvedValue(null);

      const subscription = makeStripeSubscription('canceled');

      stripeInstance.webhooks.constructEvent.mockReturnValue({
        type: 'customer.subscription.updated',
        data: { object: subscription },
      } as Stripe.Event);

      await service.handleWebhook('valid-sig', Buffer.from('payload'));

      expect(userRepo.update).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // handleWebhook — customer.subscription.deleted
  // ─────────────────────────────────────────────────────────────────────────

  describe('handleWebhook — customer.subscription.deleted', () => {
    it('downgrades user to FREE and clears expiresAt on subscription deletion', async () => {
      const user = makeUser({
        stripeSubscriptionId: STRIPE_SUB_ID,
        subscriptionTier: SubscriptionTier.PRO,
      });
      userRepo.findOne.mockResolvedValue(user);

      // deleted subscriptions arrive as customer.subscription.deleted
      // with status 'canceled'
      const subscription = makeStripeSubscription('canceled');

      stripeInstance.webhooks.constructEvent.mockReturnValue({
        type: 'customer.subscription.deleted',
        data: { object: subscription },
      } as Stripe.Event);

      await service.handleWebhook('valid-sig', Buffer.from('payload'));

      expect(userRepo.update).toHaveBeenCalledWith(user.id, {
        subscriptionTier: SubscriptionTier.FREE,
        subscriptionExpiresAt: null,
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // handleWebhook — unsupported event types
  // ─────────────────────────────────────────────────────────────────────────

  describe('handleWebhook — unsupported event types', () => {
    const unsupportedTypes = [
      'payment_intent.succeeded',
      'invoice.payment_failed',
      'customer.created',
      'charge.refunded',
    ];

    it.each(unsupportedTypes)(
      'ignores "%s" without throwing or touching the database',
      async (eventType) => {
        stripeInstance.webhooks.constructEvent.mockReturnValue({
          type: eventType,
          data: { object: {} },
        } as Stripe.Event);

        await expect(
          service.handleWebhook('valid-sig', Buffer.from('payload')),
        ).resolves.not.toThrow();

        expect(userRepo.update).not.toHaveBeenCalled();
        expect(userRepo.findOne).not.toHaveBeenCalled();
      },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getSubscriptionStatus
  // ─────────────────────────────────────────────────────────────────────────

  describe('getSubscriptionStatus', () => {
    it('returns tier, expiresAt, and isPro=false for a FREE user', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ subscriptionTier: SubscriptionTier.FREE }));

      const result = await service.getSubscriptionStatus(USER_ID);

      expect(result).toEqual({
        tier: SubscriptionTier.FREE,
        expiresAt: null,
        isPro: false,
      });
    });

    it('returns isPro=true for a PRO user', async () => {
      userRepo.findOne.mockResolvedValue(
        makeUser({
          subscriptionTier: SubscriptionTier.PRO,
          subscriptionExpiresAt: new Date('2027-01-01'),
        }),
      );

      const result = await service.getSubscriptionStatus(USER_ID);

      expect(result.isPro).toBe(true);
      expect(result.tier).toBe(SubscriptionTier.PRO);
    });

    it('returns isPro=true for an ENTERPRISE user', async () => {
      userRepo.findOne.mockResolvedValue(
        makeUser({ subscriptionTier: SubscriptionTier.ENTERPRISE }),
      );

      const result = await service.getSubscriptionStatus(USER_ID);

      expect(result.isPro).toBe(true);
    });

    it('throws NotFoundException when user does not exist', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.getSubscriptionStatus('no-such-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // createCheckoutSession
  // ─────────────────────────────────────────────────────────────────────────

  describe('createCheckoutSession', () => {
    it('returns a Stripe checkout URL for the PRO tier', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      stripeInstance.checkout.sessions.create.mockResolvedValue({
        url: 'https://checkout.stripe.com/pay/cs_test',
      });

      const result = await service.createCheckoutSession(USER_ID, SubscriptionTier.PRO);

      expect(stripeInstance.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [{ price: PRO_PRICE_ID, quantity: 1 }],
          metadata: expect.objectContaining({ userId: USER_ID, tier: SubscriptionTier.PRO }),
        }),
      );
      expect(result.url).toBe('https://checkout.stripe.com/pay/cs_test');
    });

    it('returns a Stripe checkout URL for the ENTERPRISE tier', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      stripeInstance.checkout.sessions.create.mockResolvedValue({
        url: 'https://checkout.stripe.com/pay/cs_enterprise',
      });

      const result = await service.createCheckoutSession(USER_ID, SubscriptionTier.ENTERPRISE);

      expect(stripeInstance.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [{ price: ENTERPRISE_PRICE_ID, quantity: 1 }],
        }),
      );
      expect(result.url).toBeTruthy();
    });

    it('throws NotFoundException when user does not exist', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createCheckoutSession('no-user', SubscriptionTier.PRO),
      ).rejects.toThrow(NotFoundException);

      expect(stripeInstance.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for FREE tier (not a paid tier)', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());

      await expect(
        service.createCheckoutSession(USER_ID, SubscriptionTier.FREE),
      ).rejects.toThrow(BadRequestException);

      expect(stripeInstance.checkout.sessions.create).not.toHaveBeenCalled();
    });
  });
});
