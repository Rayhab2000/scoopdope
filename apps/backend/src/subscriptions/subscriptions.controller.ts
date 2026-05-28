import { Controller, Post, Get, Body, UseGuards, Req, RawBodyRequest, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionTier } from '../users/user.entity';

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('checkout')
  @ApiOperation({ summary: 'Create a Stripe checkout session for a subscription' })
  async createCheckout(@Req() req, @Body('tier') tier: SubscriptionTier) {
    return this.subscriptionsService.createCheckoutSession(req.user.id, tier);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('status')
  @ApiOperation({ summary: 'Get current subscription status' })
  async getStatus(@Req() req) {
    return this.subscriptionsService.getSubscriptionStatus(req.user.id);
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Stripe webhook handler' })
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    return this.subscriptionsService.handleWebhook(signature, req.rawBody as Buffer);
  }
}
