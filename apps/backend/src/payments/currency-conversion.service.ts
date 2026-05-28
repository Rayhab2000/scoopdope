import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'NGN', 'KES', 'GHS', 'ZAR', 'INR', 'BRL', 'CAD', 'AUD'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

@Injectable()
export class CurrencyConversionService {
  private readonly logger = new Logger(CurrencyConversionService.name);
  private readonly apiKey: string;
  private ratesCache: { rates: Record<string, number>; fetchedAt: number } | null = null;
  private readonly cacheTtlMs = 60 * 60 * 1000; // 1 hour

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('exchangeRate.apiKey') || '';
  }

  async getRates(base: SupportedCurrency = 'USD'): Promise<Record<string, number>> {
    const now = Date.now();
    if (this.ratesCache && now - this.ratesCache.fetchedAt < this.cacheTtlMs) {
      return this.ratesCache.rates;
    }

    try {
      const url = this.apiKey
        ? `https://v6.exchangerate-api.com/v6/${this.apiKey}/latest/${base}`
        : `https://open.er-api.com/v6/latest/${base}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Exchange rate API error: ${res.status}`);
      const data = await res.json();
      const rates: Record<string, number> = data.rates ?? data.conversion_rates;

      this.ratesCache = { rates, fetchedAt: now };
      return rates;
    } catch (err) {
      this.logger.error(`Failed to fetch exchange rates: ${err.message}`);
      // Return cached rates if available, even if stale
      if (this.ratesCache) return this.ratesCache.rates;
      throw err;
    }
  }

  async convert(amountInUsd: number, targetCurrency: SupportedCurrency): Promise<number> {
    if (targetCurrency === 'USD') return amountInUsd;
    const rates = await this.getRates('USD');
    const rate = rates[targetCurrency];
    if (!rate) throw new Error(`Unsupported currency: ${targetCurrency}`);
    return Math.round(amountInUsd * rate * 100) / 100;
  }

  /** Returns amount in smallest currency unit (e.g. cents) for Stripe */
  async toStripeAmount(amountInUsd: number, targetCurrency: SupportedCurrency): Promise<number> {
    const converted = await this.convert(amountInUsd, targetCurrency);
    // Zero-decimal currencies
    const zeroDecimal = ['KES', 'NGN', 'GHS'];
    return zeroDecimal.includes(targetCurrency)
      ? Math.round(converted)
      : Math.round(converted * 100);
  }

  /** Detect currency from Accept-Language or locale header */
  detectCurrencyFromLocale(locale: string): SupportedCurrency {
    const map: Record<string, SupportedCurrency> = {
      'en-US': 'USD', 'en-CA': 'CAD', 'en-AU': 'AUD', 'en-GB': 'GBP',
      'en-NG': 'NGN', 'en-KE': 'KES', 'en-GH': 'GHS', 'en-ZA': 'ZAR',
      'en-IN': 'INR', 'pt-BR': 'BRL',
      'de': 'EUR', 'fr': 'EUR', 'es': 'EUR', 'it': 'EUR', 'nl': 'EUR',
    };
    const normalized = locale?.split(',')[0]?.trim();
    return map[normalized] ?? map[normalized?.split('-')[0]] ?? 'USD';
  }
}
