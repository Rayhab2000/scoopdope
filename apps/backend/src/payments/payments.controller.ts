import {
  Controller, Post, Get, Body, Param, Headers, RawBodyRequest,
  Req, UseGuards, HttpCode,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PaymentsService } from './payments.service';
import { CurrencyConversionService, SUPPORTED_CURRENCIES, SupportedCurrency } from './currency-conversion.service';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';

@ApiTags('payments')
@Controller('v1/payments')
export class PaymentsController {
  constructor(
    private paymentsService: PaymentsService,
    private currencyConversion: CurrencyConversionService,
  ) {}

  @Post('intent')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a Stripe PaymentIntent for a course purchase' })
  createPaymentIntent(
    @Body() dto: CreatePaymentIntentDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.paymentsService.createPaymentIntent(dto.courseId, dto.currency, user.id);
  }

  @Get('price/:courseId')
  @ApiOperation({ summary: 'Get course price in a specific currency' })
  getPrice(
    @Param('courseId') courseId: string,
    @Headers('accept-language') acceptLanguage: string,
  ) {
    const currency = this.currencyConversion.detectCurrencyFromLocale(acceptLanguage ?? 'en-US');
    return this.paymentsService.getPriceInCurrency(courseId, currency);
  }

  @Get('currencies')
  @ApiOperation({ summary: 'List supported currencies' })
  getSupportedCurrencies() {
    return { currencies: SUPPORTED_CURRENCIES };
  }

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Stripe webhook endpoint' })
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    await this.paymentsService.handleWebhook(signature, req.rawBody!);
    return { received: true };
  }
}
