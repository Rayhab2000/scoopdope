import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { StellarIndexerService } from './stellar-indexer.service';
import { CredentialsService } from '../credentials/credentials.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a minimal mock SorobanRpc.Api.EventResponse */
function makeEvent(
  contractType: string,
  eventName: string,
  valuePayload: Record<string, unknown>
) {
  return {
    topic: [
      { value: () => contractType },
      { value: () => eventName },
    ],
    value: {
      value: () => ({
        ...valuePayload,
        toString: undefined,
        student: valuePayload.student
          ? { toString: () => valuePayload.student as string }
          : undefined,
        course: valuePayload.course
          ? { toString: () => valuePayload.course as string }
          : undefined,
        to: valuePayload.to
          ? { toString: () => valuePayload.to as string }
          : undefined,
      }),
    },
  };
}

/** Helper to access private members for testing */
function getPrivate<T>(instance: StellarIndexerService, key: string): T {
  return (instance as unknown as Record<string, T>)[key];
}

// ── Test Suite ─────────────────────────────────────────────────────────────

describe('StellarIndexerService', () => {
  let service: StellarIndexerService;
  let sorobanServerMock: { getEvents: jest.Mock };
  let cacheManagerMock: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let credentialsServiceMock: { issue: jest.Mock };
  let notificationsServiceMock: { onCredentialIssued: jest.Mock };
  let usersServiceMock: { findByStellarPublicKey: jest.Mock };
  let configServiceMock: { get: jest.Mock };

  const ANALYTICS_CONTRACT = 'CANALYTICS0000000000000000000000000000000000000000000000';
  const TOKEN_CONTRACT = 'CTOKEN00000000000000000000000000000000000000000000000000';
  const SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
  const POLL_INTERVAL_MS = 5000;

  beforeEach(async () => {
    jest.useFakeTimers();

    sorobanServerMock = { getEvents: jest.fn() };
    cacheManagerMock = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    credentialsServiceMock = { issue: jest.fn().mockResolvedValue(undefined) };
    notificationsServiceMock = { onCredentialIssued: jest.fn().mockResolvedValue(undefined) };
    usersServiceMock = { findByStellarPublicKey: jest.fn() };

    configServiceMock = {
      get: jest.fn().mockImplementation((key: string) => {
        const map: Record<string, unknown> = {
          'stellar.sorobanRpcUrl': SOROBAN_RPC_URL,
          'stellar.analyticsContractId': ANALYTICS_CONTRACT,
          'stellar.tokenContractId': TOKEN_CONTRACT,
          'stellar.indexerPollIntervalMs': POLL_INTERVAL_MS,
        };
        return map[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarIndexerService,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: CACHE_MANAGER, useValue: cacheManagerMock },
        { provide: CredentialsService, useValue: credentialsServiceMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
        { provide: UsersService, useValue: usersServiceMock },
      ],
    }).compile();

    service = module.get<StellarIndexerService>(StellarIndexerService);

    // Inject the mock soroban server without triggering a real constructor
    (service as unknown as Record<string, unknown>)['sorobanServer'] = sorobanServerMock;
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  // ── Module lifecycle ──────────────────────────────────────────────────────

  describe('onModuleInit', () => {
    it('starts the polling timer when contract IDs are configured', () => {
      cacheManagerMock.get.mockResolvedValue(0);
      sorobanServerMock.getEvents.mockResolvedValue({ events: [], latestLedger: 100 });

      service.onModuleInit();

      const timer = getPrivate<NodeJS.Timeout | null>(service, 'timer');
      expect(timer).not.toBeNull();
    });

    it('does not start the timer when both contract IDs are empty', async () => {
      configServiceMock.get.mockImplementation((key: string) => {
        if (key === 'stellar.analyticsContractId') return '';
        if (key === 'stellar.tokenContractId') return '';
        if (key === 'stellar.indexerPollIntervalMs') return POLL_INTERVAL_MS;
        if (key === 'stellar.sorobanRpcUrl') return SOROBAN_RPC_URL;
        return undefined;
      });

      const module2 = await Test.createTestingModule({
        providers: [
          StellarIndexerService,
          { provide: ConfigService, useValue: configServiceMock },
          { provide: CACHE_MANAGER, useValue: cacheManagerMock },
          { provide: CredentialsService, useValue: credentialsServiceMock },
          { provide: NotificationsService, useValue: notificationsServiceMock },
          { provide: UsersService, useValue: usersServiceMock },
        ],
      }).compile();

      const disabledService = module2.get<StellarIndexerService>(StellarIndexerService);
      (disabledService as unknown as Record<string, unknown>)['sorobanServer'] = sorobanServerMock;

      disabledService.onModuleInit();

      const timer = getPrivate<NodeJS.Timeout | null>(disabledService, 'timer');
      expect(timer).toBeNull();
    });
  });

  describe('onModuleDestroy', () => {
    it('clears the polling timer on destroy', () => {
      cacheManagerMock.get.mockResolvedValue(0);
      sorobanServerMock.getEvents.mockResolvedValue({ events: [], latestLedger: 100 });

      service.onModuleInit();
      service.onModuleDestroy();

      const timer = getPrivate<NodeJS.Timeout | null>(service, 'timer');
      expect(timer).toBeNull();
    });

    it('does not throw when called before init', () => {
      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });

  // ── Successful event polling ───────────────────────────────────────────────

  describe('poll — successful event dispatch', () => {
    it('dispatches analytics:completed event to handleAnalyticsCompleted', async () => {
      const studentKey = 'GABC1234567890000000000000000000000000000000000000000000';
      const courseId = 'course-42';
      const mockUser = { id: 'user-1', stellarPublicKey: studentKey };

      usersServiceMock.findByStellarPublicKey.mockResolvedValue(mockUser);
      cacheManagerMock.get.mockResolvedValue(0);
      cacheManagerMock.set.mockResolvedValue(undefined);
      sorobanServerMock.getEvents.mockResolvedValue({
        events: [makeEvent('analytics', 'completed', { student: studentKey, course: courseId })],
        latestLedger: 150,
      });

      service.onModuleInit();
      await jest.runAllTimersAsync();

      expect(credentialsServiceMock.issue).toHaveBeenCalledWith(mockUser.id, courseId, studentKey);
      expect(notificationsServiceMock.onCredentialIssued).toHaveBeenCalledWith(mockUser.id, courseId);
    });

    it('dispatches token:transfer event to handleTokenTransfer and busts cache', async () => {
      const toKey = 'GXYZ9876543210000000000000000000000000000000000000000000';

      cacheManagerMock.get.mockResolvedValue(0);
      cacheManagerMock.set.mockResolvedValue(undefined);
      cacheManagerMock.del.mockResolvedValue(undefined);
      sorobanServerMock.getEvents.mockResolvedValue({
        events: [makeEvent('token', 'transfer', { to: toKey, amount: BigInt(500) })],
        latestLedger: 200,
      });

      service.onModuleInit();
      await jest.runAllTimersAsync();

      expect(cacheManagerMock.del).toHaveBeenCalledWith(`token_balance:${toKey}`);
    });

    it('updates the last-ledger cache key after a successful poll', async () => {
      cacheManagerMock.get.mockResolvedValue(100);
      cacheManagerMock.set.mockResolvedValue(undefined);
      sorobanServerMock.getEvents.mockResolvedValue({ events: [], latestLedger: 250 });

      service.onModuleInit();
      await jest.runAllTimersAsync();

      expect(cacheManagerMock.set).toHaveBeenCalledWith('indexer:last_ledger', 250, 0);
    });

    it('does not update the ledger cache when latestLedger has not advanced', async () => {
      cacheManagerMock.get.mockResolvedValue(300);
      cacheManagerMock.set.mockResolvedValue(undefined);
      sorobanServerMock.getEvents.mockResolvedValue({ events: [], latestLedger: 300 });

      service.onModuleInit();
      await jest.runAllTimersAsync();

      expect(cacheManagerMock.set).not.toHaveBeenCalled();
    });
  });

  // ── Unknown event types ───────────────────────────────────────────────────

  describe('poll — unknown event types', () => {
    it('silently ignores events with an unknown contractType', async () => {
      cacheManagerMock.get.mockResolvedValue(0);
      cacheManagerMock.set.mockResolvedValue(undefined);
      sorobanServerMock.getEvents.mockResolvedValue({
        events: [makeEvent('unknown_contract', 'some_event', {})],
        latestLedger: 110,
      });

      service.onModuleInit();
      await expect(jest.runAllTimersAsync()).resolves.not.toThrow();

      expect(credentialsServiceMock.issue).not.toHaveBeenCalled();
      expect(cacheManagerMock.del).not.toHaveBeenCalled();
    });

    it('silently ignores events with an unknown eventName on a known contract', async () => {
      cacheManagerMock.get.mockResolvedValue(0);
      cacheManagerMock.set.mockResolvedValue(undefined);
      sorobanServerMock.getEvents.mockResolvedValue({
        events: [makeEvent('analytics', 'unknown_event', {})],
        latestLedger: 120,
      });

      service.onModuleInit();
      await expect(jest.runAllTimersAsync()).resolves.not.toThrow();

      expect(credentialsServiceMock.issue).not.toHaveBeenCalled();
    });
  });

  // ── Horizon / Soroban RPC errors ──────────────────────────────────────────

  describe('poll — Horizon API errors', () => {
    it('logs the error and does not crash the polling loop when getEvents rejects', async () => {
      cacheManagerMock.get.mockResolvedValue(0);
      sorobanServerMock.getEvents.mockRejectedValue(new Error('Network timeout'));

      service.onModuleInit();
      await expect(jest.runAllTimersAsync()).resolves.not.toThrow();
    });

    it('continues polling after a transient Soroban RPC error', async () => {
      cacheManagerMock.get.mockResolvedValue(0);
      cacheManagerMock.set.mockResolvedValue(undefined);

      // First call fails, second call succeeds
      sorobanServerMock.getEvents
        .mockRejectedValueOnce(new Error('RPC unavailable'))
        .mockResolvedValue({ events: [], latestLedger: 300 });

      service.onModuleInit();

      // Advance time enough for two poll cycles
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

      expect(sorobanServerMock.getEvents).toHaveBeenCalledTimes(2);
    });

    it('logs the error and continues when a handler throws during event processing', async () => {
      const studentKey = 'GABC1234567890000000000000000000000000000000000000000000';
      const courseId = 'course-99';
      const mockUser = { id: 'user-2', stellarPublicKey: studentKey };

      usersServiceMock.findByStellarPublicKey.mockResolvedValue(mockUser);
      credentialsServiceMock.issue.mockRejectedValue(new Error('Database write failed'));
      cacheManagerMock.get.mockResolvedValue(0);
      cacheManagerMock.set.mockResolvedValue(undefined);
      sorobanServerMock.getEvents.mockResolvedValue({
        events: [makeEvent('analytics', 'completed', { student: studentKey, course: courseId })],
        latestLedger: 400,
      });

      service.onModuleInit();
      await expect(jest.runAllTimersAsync()).resolves.not.toThrow();
    });
  });

  // ── analytics:completed edge cases ────────────────────────────────────────

  describe('handleAnalyticsCompleted', () => {
    it('does nothing when the student public key is missing from the event value', async () => {
      cacheManagerMock.get.mockResolvedValue(0);
      cacheManagerMock.set.mockResolvedValue(undefined);
      sorobanServerMock.getEvents.mockResolvedValue({
        events: [makeEvent('analytics', 'completed', { course: 'course-1' })],
        latestLedger: 500,
      });

      service.onModuleInit();
      await jest.runAllTimersAsync();

      expect(usersServiceMock.findByStellarPublicKey).not.toHaveBeenCalled();
    });

    it('does nothing when the course ID is missing from the event value', async () => {
      cacheManagerMock.get.mockResolvedValue(0);
      cacheManagerMock.set.mockResolvedValue(undefined);
      sorobanServerMock.getEvents.mockResolvedValue({
        events: [
          makeEvent('analytics', 'completed', {
            student: 'GABC1234567890000000000000000000000000000000000000000000',
          }),
        ],
        latestLedger: 510,
      });

      service.onModuleInit();
      await jest.runAllTimersAsync();

      expect(usersServiceMock.findByStellarPublicKey).not.toHaveBeenCalled();
    });

    it('does nothing when no user is found for the student public key', async () => {
      const studentKey = 'GABC1234567890000000000000000000000000000000000000000000';

      usersServiceMock.findByStellarPublicKey.mockResolvedValue(null);
      cacheManagerMock.get.mockResolvedValue(0);
      cacheManagerMock.set.mockResolvedValue(undefined);
      sorobanServerMock.getEvents.mockResolvedValue({
        events: [makeEvent('analytics', 'completed', { student: studentKey, course: 'course-x' })],
        latestLedger: 520,
      });

      service.onModuleInit();
      await jest.runAllTimersAsync();

      expect(credentialsServiceMock.issue).not.toHaveBeenCalled();
    });
  });

  // ── updatePollInterval ────────────────────────────────────────────────────

  describe('updatePollInterval', () => {
    it('replaces the existing timer with a new one at the updated interval', () => {
      cacheManagerMock.get.mockResolvedValue(0);
      sorobanServerMock.getEvents.mockResolvedValue({ events: [], latestLedger: 100 });

      service.onModuleInit();
      const firstTimer = getPrivate<NodeJS.Timeout | null>(service, 'timer');

      service.updatePollInterval(2000);
      const secondTimer = getPrivate<NodeJS.Timeout | null>(service, 'timer');

      expect(secondTimer).not.toBeNull();
      expect(secondTimer).not.toBe(firstTimer);
    });

    it('updates the stored pollInterval value', () => {
      service.updatePollInterval(3000);
      const stored = getPrivate<number>(service, 'pollInterval');
      expect(stored).toBe(3000);
    });
  });
});
