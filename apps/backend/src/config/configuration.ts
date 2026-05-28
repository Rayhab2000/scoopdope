export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    host: process.env.DATABASE_HOST!,
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USER!,
    password: process.env.DATABASE_PASSWORD!,
    name: process.env.DATABASE_NAME!,
  },

  jwt: {
    secret: process.env.JWT_SECRET!,
  },

  redis: {
    url: process.env.REDIS_URL!,
  },

  stellar: {
    network: process.env.STELLAR_NETWORK as 'testnet' | 'mainnet',
    secretKey: process.env.STELLAR_SECRET_KEY!,
    sorobanRpcUrl: process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
    contractId: process.env.SOROBAN_CONTRACT_ID || '',
    analyticsContractId: process.env.ANALYTICS_CONTRACT_ID || '',
    credentialMetadataContractId: process.env.CREDENTIAL_METADATA_CONTRACT_ID || '',
    tokenContractId: process.env.TOKEN_CONTRACT_ID || '',
    indexerPollIntervalMs: parseInt(process.env.INDEXER_POLL_INTERVAL_MS || '5000', 10),
    webAuthDomain: process.env.STELLAR_WEB_AUTH_DOMAIN || 'localhost',
  },

  mail: {
    host: process.env.EMAIL_HOST!,
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: process.env.EMAIL_SECURE === 'true',
    user: process.env.EMAIL_USER!,
    pass: process.env.EMAIL_PASS!,
    from: process.env.EMAIL_FROM || '"Scoopdope" <no-reply@Scoopdope.app>',
    enabled: process.env.EMAIL_ENABLED === 'true',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
  },

  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:3001',
  },

  cors: {
    origins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3001'],
    credentials: process.env.CORS_CREDENTIALS === 'true',
    maxAge: parseInt(process.env.CORS_MAX_AGE || '86400', 10),
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  },

  kyc: {
    providerApiKey: process.env.KYC_PROVIDER_API_KEY || '',
  },

  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },

  moderation: {
    toxicityThreshold: parseFloat(process.env.MODERATION_TOXICITY_THRESHOLD || '0.7'),
  },

  elasticsearch: {
    node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    apiKey: process.env.ELASTICSEARCH_API_KEY || '',
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    proPriceId: process.env.STRIPE_PRO_PRICE_ID || '',
    enterprisePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || '',
  },

  exchangeRate: {
    apiKey: process.env.EXCHANGE_RATE_API_KEY || '',
  },
});
