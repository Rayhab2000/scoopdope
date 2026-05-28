import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // App
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),

  // Database
  DATABASE_HOST: Joi.string().required(),
  DATABASE_PORT: Joi.number().default(5432),
  DATABASE_USER: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().required(),
  DATABASE_NAME: Joi.string().required(),

  // JWT
  JWT_SECRET: Joi.string().min(16).required(),

  // Redis
  REDIS_URL: Joi.string().uri().required(),

  // Stellar
  STELLAR_NETWORK: Joi.string().valid('testnet', 'mainnet').default('testnet'),
  STELLAR_SECRET_KEY: Joi.string().required(),
  SOROBAN_RPC_URL: Joi.string().uri().default('https://soroban-testnet.stellar.org'),
  SOROBAN_CONTRACT_ID: Joi.string().allow('').default(''),
  ANALYTICS_CONTRACT_ID: Joi.string().allow('').default(''),
  TOKEN_CONTRACT_ID: Joi.string().allow('').default(''),
  CREDENTIAL_METADATA_CONTRACT_ID: Joi.string().allow('').default(''),
  INDEXER_POLL_INTERVAL_MS: Joi.number().default(5000),
  STELLAR_WEB_AUTH_DOMAIN: Joi.string().default('localhost'),

  // Mail
  EMAIL_HOST: Joi.string().required(),
  EMAIL_PORT: Joi.number().default(587),
  EMAIL_SECURE: Joi.boolean().default(false),
  EMAIL_USER: Joi.string().required(),
  EMAIL_PASS: Joi.string().required(),
  EMAIL_FROM: Joi.string().default('"Scoopdope" <no-reply@Scoopdope.app>'),
  EMAIL_ENABLED: Joi.boolean().default(false),

  // Frontend
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3001'),

  // Google OAuth (optional)
  GOOGLE_CLIENT_ID: Joi.string().optional(),
  GOOGLE_CLIENT_SECRET: Joi.string().optional(),
  GOOGLE_CALLBACK_URL: Joi.string().uri().default('http://localhost:3000/auth/google/callback'),

  // Throttle
  THROTTLE_TTL: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(100),

  // KYC
  KYC_PROVIDER_API_KEY: Joi.string().allow('').default(''),

  // AWS
  AWS_REGION: Joi.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: Joi.string().allow('').default(''),
  AWS_SECRET_ACCESS_KEY: Joi.string().allow('').default(''),

  // Moderation
  MODERATION_TOXICITY_THRESHOLD: Joi.number().min(0).max(1).default(0.7),

  // Elasticsearch
  ELASTICSEARCH_NODE: Joi.string().uri().default('http://localhost:9200'),
  ELASTICSEARCH_API_KEY: Joi.string().allow('').default(''),

  // Stripe
  STRIPE_SECRET_KEY: Joi.string().allow('').default(''),
  STRIPE_WEBHOOK_SECRET: Joi.string().allow('').default(''),
  STRIPE_PRO_PRICE_ID: Joi.string().allow('').default(''),
  STRIPE_ENTERPRISE_PRICE_ID: Joi.string().allow('').default(''),

  // Exchange Rate (optional — falls back to free open.er-api.com)
  EXCHANGE_RATE_API_KEY: Joi.string().allow('').default(''),
});
