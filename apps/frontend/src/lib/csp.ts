import crypto from 'crypto';

/**
 * Generate a random nonce for CSP
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * CSP configuration for different environments
 */
export const CSP_CONFIG = {
  development: {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'unsafe-eval'", // Allow eval in dev for hot reload
      "'nonce'",
      'https://cdnjs.cloudflare.com',
      'https://cdn.jsdelivr.net',
      'https://*.stellar.org',
      'https://*.sentry.io',
      'https://www.googletagmanager.com',
      'https://www.google-analytics.com',
      'https://*.google-analytics.com',
      'https://www.googletagservices.com',
      'https://cdn.segment.com',
    ],
    'style-src': ["'self'", "'unsafe-inline'", "'nonce'"],
    'img-src': ["'self'", 'data:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': [
      "'self'",
      'https://*.stellar.org',
      'https://*.sentry.io',
      'https://www.google-analytics.com',
      'https://*.segment.com',
      'ws://localhost:*', // WebSocket for dev
    ],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'upgrade-insecure-requests': [],
  },
  production: {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'nonce'",
      'https://cdnjs.cloudflare.com',
      'https://cdn.jsdelivr.net',
      'https://*.stellar.org',
      'https://*.sentry.io',
      'https://www.googletagmanager.com',
      'https://www.google-analytics.com',
      'https://*.google-analytics.com',
      'https://cdn.segment.com',
    ],
    'style-src': ["'self'", "'unsafe-inline'", "'nonce'"],
    'img-src': ["'self'", 'data:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': [
      "'self'",
      'https://*.stellar.org',
      'https://*.sentry.io',
      'https://www.google-analytics.com',
      'https://*.segment.com',
    ],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'upgrade-insecure-requests': [],
  },
};

/**
 * Build CSP header value from config
 */
export function buildCSPHeader(config: Record<string, string[]>, nonce?: string): string {
  return Object.entries(config)
    .map(([key, values]) => {
      if (values.length === 0) {
        return key;
      }
      const directives = values.map((v) => {
        // Replace nonce placeholder with actual nonce
        if (v === "'nonce'" && nonce) {
          return `'nonce-${nonce}'`;
        }
        return v;
      });
      return `${key} ${directives.join(' ')}`;
    })
    .join('; ');
}
