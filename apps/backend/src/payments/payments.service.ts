import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { Course } from '../courses/course.entity';
import { CurrencyConversionService, SupportedCurrency } from './currency-conversion.service';

@Injectable()
export class PaymentsService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private configService: ConfigService,
    private currencyConversion: CurrencyConversionService,
    @InjectRepository(Course)
    private courseRepo: Repository<Course>,
  ) {
    this.stripe = new Stripe(this.configService.get<string>('stripe.secretKey') || '', {
      apiVersion: '2025-01-27' as any,
    });
  }

  async createPaymentIntent(courseId: string, currency: SupportedCurrency, userId: string) {
    const course = await this.courseRepo.findOne({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    if (!course.priceUsd || course.priceUsd <= 0) {
      throw new BadRequestException('This course is free and does not require payment');
    }

    const amount = await this.currencyConversion.toStripeAmount(course.priceUsd, currency);

    const intent = await this.stripe.paymentIntents.create({
      amount,
      currency: currency.toLowerCase(),
      metadata: { courseId, userId },
    });

    return {
      clientSecret: intent.client_secret,
      amount,
      currency,
      courseId,
    };
  }

  async getPriceInCurrency(courseId: string, currency: SupportedCurrency) {
    const course = await this.courseRepo.findOne({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');

    const priceUsd = course.priceUsd ?? 0;
    const converted = priceUsd > 0 ? await this.currencyConversion.convert(priceUsd, currency) : 0;

    return { courseId, priceUsd, currency, price: converted };
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

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object as Stripe.PaymentIntent;
      this.logger.log(
        `Payment succeeded for course ${intent.metadata.courseId} by user ${intent.metadata.userId}`,
      );
      // Enrollment logic can be triggered here via EventEmitter
    }
  }
}
