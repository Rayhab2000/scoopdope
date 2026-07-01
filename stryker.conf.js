// @ts-check
/** @type {import('@stryker-mutator/api').StrykerOptions} */
const config = {
  _comment:
    'Mutation testing is intentionally scoped to critical backend modules to keep CI runtime sustainable while protecting high-risk business logic.',
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress', 'json'],
  htmlReporter: {
    baseDir: 'coverage/mutation',
  },
  jsonReporter: {
    baseDir: 'coverage/mutation',
  },
  testRunner: 'jest',
  jest: {
    projectType: 'custom',
    configFile: 'apps/backend/jest.config.js',
    enableFindRelatedTests: true,
  },
  mutate: [
    'apps/backend/src/auth/**/*.ts',
    'apps/backend/src/payments/**/*.ts',
    'apps/backend/src/certificates/**/*.ts',
    'apps/backend/src/waitlist/**/*.ts',
    '!apps/backend/src/**/*.spec.ts',
    '!apps/backend/src/**/*.test.ts',
    '!apps/backend/src/**/*.spec.tsx',
    '!apps/backend/src/**/*.test.tsx',
    '!apps/backend/src/**/index.ts',
    '!apps/backend/src/**/*.module.ts',
    '!apps/backend/src/**/*.controller.ts',
    '!apps/backend/src/**/*.entity.ts',
    '!apps/backend/src/**/*.dto.ts',
    '!apps/backend/src/**/dto/**/*.ts',
    '!apps/backend/src/**/types.ts',
  ],
  thresholds: {
    high: 80,
    medium: 60,
    low: 40,
    break: 60,
  },
  timeoutMS: 5000,
  timeoutFactor: 1.25,
  maxConcurrentTestRunners: 4,
};

module.exports = config;
