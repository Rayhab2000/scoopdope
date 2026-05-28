import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { User, SubscriptionTier } from '../users/user.entity';

@Injectable()
export class SubscriptionsService {
  private stripe: Stripe;
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {
    this.stripe = new Stripe(this.configService.get<string>('stripe.secretKey') || '', {
      apiVersion: '2025-01-27' as any,
    });
  }

  async createCheckoutSession(userId: string, tier: SubscriptionTier) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    let priceId: string;
    if (tier === SubscriptionTier.PRO) {
      priceId = this.configService.get<string>('stripe.proPriceId')!;
    } else if (tier === SubscriptionTier.ENTERPRISE) {
      priceId = this.configService.get<string>('stripe.enterprisePriceId')!;
    } else {
      throw new BadRequestException('Invalid subscription tier');
    }

    if (!priceId) {
      throw new BadRequestException('Stripe Price ID not configured for this tier');
    }

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${this.configService.get('frontend.url')}/dashboard?subscription=success`,
      cancel_url: `${this.configService.get('frontend.url')}/pricing`,
      client_reference_id: userId,
      customer_email: user.email,
      metadata: { userId, tier },
    });

    return { url: session.url };
  }

  async handleWebhook(signature: string, payload: Buffer) {
    const webhookSecret = this.configService.get<string>('stripe.webhookSecret')!;
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err) {
      this.logger.error(`Webhook signature verification failed: ${err.message}`);
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      default:
        this.logger.log(`Unhandled event type ${event.type}`);
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = session.metadata?.userId;
    const tier = session.metadata?.tier as SubscriptionTier;
    const stripeCustomerId = session.customer as string;
    const stripeSubscriptionId = session.subscription as string;

    if (!userId || !tier) return;

    const subscription = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);

    await this.userRepo.update(userId, {
      subscriptionTier: tier,
      stripeCustomerId,
      stripeSubscriptionId,
      subscriptionExpiresAt: new Date(subscription.current_period_end * 1000),
    });

    this.logger.log(`Subscription activated for user ${userId}: ${tier}`);
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const stripeSubscriptionId = subscription.id;
    const user = await this.userRepo.findOne({ where: { stripeSubscriptionId } });

    if (!user) return;

    if (subscription.status === 'active') {
      await this.userRepo.update(user.id, {
        subscriptionExpiresAt: new Date(subscription.current_period_end * 1000),
      });
    } else {
      await this.userRepo.update(user.id, {
        subscriptionTier: SubscriptionTier.FREE,
        subscriptionExpiresAt: null,
      });
    }
  }

  async getSubscriptionStatus(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return {
      tier: user.subscriptionTier,
      expiresAt: user.subscriptionExpiresAt,
      isPro: user.subscriptionTier === SubscriptionTier.PRO || user.subscriptionTier === SubscriptionTier.ENTERPRISE,
    };
  }
}
