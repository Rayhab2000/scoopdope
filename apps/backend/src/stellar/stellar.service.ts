import { Injectable, Logger, Inject, ServiceUnavailableException, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import pRetry from 'p-retry';
import {
  Horizon,
  Keypair,
  Networks,
  TransactionBuilder,
  BASE_FEE,
  Operation,
  SorobanRpc,
  nativeToScVal,
  Address,
} from '@stellar/stellar-sdk';

const MAX_RETRIES = 3;
const RETRY_OPTIONS = {
  retries: MAX_RETRIES,
  minTimeout: 1000,
  maxTimeout: 8000,
  onFailedAttempt: (error: pRetry.FailedAttemptError) => {
    Logger.warn(
      `Attempt ${error.attemptNumber}/${MAX_RETRIES} failed: ${error.message}`
    );
  },
};

@Injectable()
export class StellarService implements OnApplicationShutdown {
  private readonly logger = new Logger(StellarService.name);
  private server: Horizon.Server;
  private sorobanServer: SorobanRpc.Server;
  private networkPassphrase: string;
  private analyticsContractId: string;
  private tokenContractId: string;
  private credentialMetadataContractId: string;
  private certificateContractId: string;
  private contractId: string;
  private enrollmentContractId: string;
  private secretKey: string;
  private pendingTransactionCount = 0;
  private isShuttingDown = false;
  private readonly SHUTDOWN_TIMEOUT_MS = 10000;

  constructor(
    private configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache
  ) {
    const isTestnet = this.configService.get<string>('stellar.network') !== 'mainnet';
    this.networkPassphrase = isTestnet ? Networks.TESTNET : Networks.PUBLIC;

    this.server = new Horizon.Server(
      isTestnet ? 'https://horizon-testnet.stellar.org' : 'https://horizon.stellar.org'
    );

    const rpcUrl = this.configService.get<string>('stellar.sorobanRpcUrl') ?? '';
    this.sorobanServer = new SorobanRpc.Server(rpcUrl);

    this.contractId = this.configService.get<string>('stellar.contractId') ?? '';
    this.enrollmentContractId =
      this.configService.get<string>('stellar.enrollmentContractId') ?? '';
    this.analyticsContractId = this.configService.get<string>('stellar.analyticsContractId') ?? '';
    this.tokenContractId = this.configService.get<string>('stellar.tokenContractId') ?? '';
    this.credentialMetadataContractId =
      this.configService.get<string>('stellar.credentialMetadataContractId') ?? '';
    this.certificateContractId =
      this.configService.get<string>('stellar.certificateContractId') ?? '';
    this.secretKey = this.configService.get<string>('stellar.secretKey') ?? '';

    if (!this.secretKey) {
      this.logger.warn(
        '⚠️  STELLAR_SECRET_KEY is not configured. ' +
          'Read-only operations (querying balances, transactions) will work, ' +
          'but signing operations (issuing credentials, minting tokens) will fail.'
      );
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Records a course enrollment on-chain via the Soroban enrollment contract.
   *
   * Invokes the contract's `record_enrollment` function with the student's
   * public key and the course ID, then returns the resulting transaction hash.
   *
   * @throws {Error} if `ENROLLMENT_CONTRACT_ID` is not configured
   * @throws {Error} propagated from Soroban RPC on simulation/submission failure
   */
  async recordEnrollment(studentPublicKey: string, courseId: string): Promise<string> {
    this.ensureSecretKeyConfigured();
    if (!this.enrollmentContractId) {
      throw new Error('ENROLLMENT_CONTRACT_ID is not configured');
    }

    return this.trackTransaction(() =>
      pRetry(
        () =>
          this.invokeContract(this.enrollmentContractId, 'record_enrollment', [
            new Address(studentPublicKey).toScVal(),
            nativeToScVal(courseId, { type: 'string' }),
          ]),
        RETRY_OPTIONS
      )
    );
  }

  async getAccountBalance(publicKey: string) {
    const account = await this.server.loadAccount(publicKey);
    return account.balances;
  }

  async getTransactions(publicKey: string, limit = 10): Promise<object[]> {
    const records = await this.server
      .transactions()
      .forAccount(publicKey)
      .limit(limit)
      .order('desc')
      .call();
    return records.records.map((tx) => ({
      id: tx.id,
      hash: tx.hash,
      createdAt: tx.created_at,
      operationCount: tx.operation_count,
      successful: tx.successful,
      memo: tx.memo,
      memoType: tx.memo_type,
      feeCharged: tx.fee_charged,
    }));
  }

  async fundTestnetAccount(publicKey: string): Promise<{ message: string }> {
    const network = this.configService.get<string>('stellar.network');
    if (network !== 'testnet') {
      throw new Error('Friendbot is only available on testnet');
    }
    const response = await fetch(
      `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`
    );
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Friendbot error: ${body}`);
    }
    return { message: `Account ${publicKey} funded successfully` };
  }

  async mintCertificateNFT(
    recipientPublicKey: string,
    certificateHash: string,
    courseTitle: string,
  ): Promise<string> {
    this.ensureSecretKeyConfigured();
    if (!this.certificateContractId) {
      throw new Error('CERTIFICATE_CONTRACT_ID is not configured');
    }

    return this.trackTransaction(() =>
      this.retryWithBackoff(() =>
        this.invokeContract(this.certificateContractId, 'mint_certificate', [
          new Address(recipientPublicKey).toScVal(),
          nativeToScVal(certificateHash, { type: 'string' }),
          nativeToScVal(courseTitle, { type: 'string' }),
        ]),
      ),
    );
  }

  async issueCredential(
    recipientPublicKey: string,
    courseId: string,
    metadata?: { courseName: string; grade: string; skills: string[] }
  ): Promise<string> {
    this.ensureSecretKeyConfigured();
    return this.trackTransaction(async () => {
      try {
        await pRetry(() => this.recordProgressOnChain(recipientPublicKey, courseId), RETRY_OPTIONS);
        this.logger.log(`Progress recorded on Soroban for ${courseId}`);
      } catch (error: any) {
        this.logger.error(
          `Failed to record progress on Soroban: ${error.message}, falling back to Horizon`
        );
        await this.issueCredentialFallback(recipientPublicKey, courseId);
      }

      if (metadata && this.credentialMetadataContractId) {
        try {
          await pRetry(() => this.storeCredentialMetadata(recipientPublicKey, metadata), RETRY_OPTIONS);
          this.logger.log(`Metadata stored on-chain for ${metadata.courseName}`);
        } catch (error: any) {
          this.logger.error(`Failed to store metadata on-chain: ${error.message}`);
        }
      }

      return this.mintCredentialViaHorizon(recipientPublicKey, courseId);
    });
  }

  async storeCredentialMetadata(
    studentPublicKey: string,
    metadata: { courseName: string; grade: string; skills: string[] }
  ): Promise<string> {
    this.ensureSecretKeyConfigured();
    const issuerKeypair = Keypair.fromSecret(this.secretKey);

    return this.invokeContract(this.credentialMetadataContractId, 'store_metadata', [
      new Address(issuerKeypair.publicKey()).toScVal(), // admin
      new Address(studentPublicKey).toScVal(), // student
      nativeToScVal(metadata.courseName, { type: 'string' }),
      nativeToScVal(Math.floor(Date.now() / 1000), { type: 'u64' }), // completion_date
      nativeToScVal(metadata.grade, { type: 'string' }),
      nativeToScVal(metadata.skills), // Soroban Vec<String>
    ]);
  }

  async recordProgress(
    studentPublicKey: string,
    courseId: string,
    _progressPct: number
  ): Promise<string> {
    this.ensureSecretKeyConfigured();
    return this.trackTransaction(() =>
      pRetry(
        () =>
          this.invokeContract(this.analyticsContractId ?? this.contractId, 'record_progress', [
            new Address(studentPublicKey).toScVal(),
            nativeToScVal(courseId, { type: 'symbol' }),
            nativeToScVal(_progressPct, { type: 'i32' }),
          ]),
        RETRY_OPTIONS
      )
    );
  }

  /** Read BST balance for an address from the Token contract (read-only simulate) */
  async getTokenBalance(stellarPublicKey: string): Promise<string> {
    this.ensureSecretKeyConfigured();
    if (!this.tokenContractId) {
      throw new Error('TOKEN_CONTRACT_ID not configured');
    }

    const cacheKey = `token_balance:${stellarPublicKey}`;
    const cached = await this.cacheManager.get<string>(cacheKey);
    if (cached !== undefined && cached !== null) return cached;

    const issuerKeypair = Keypair.fromSecret(this.secretKey);
    const source = await this.sorobanServer.getAccount(issuerKeypair.publicKey());

    const tx = new TransactionBuilder(source as any, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: this.tokenContractId,
          function: 'balance',
          args: [new Address(stellarPublicKey).toScVal()],
        })
      )
      .setTimeout(30)
      .build();

    const simResult = await this.sorobanServer.simulateTransaction(tx);

    if (SorobanRpc.Api.isSimulationError(simResult)) {
      throw new Error(`Token balance simulation failed: ${simResult.error}`);
    }

    const retVal = (simResult as SorobanRpc.Api.SimulateTransactionSuccessResponse).result?.retval;
    const balance = retVal ? BigInt(retVal.value() as unknown as bigint).toString() : '0';

    await this.cacheManager.set(cacheKey, balance, 30_000);
    return balance;
  }

  /** Mint reward tokens via the Token Soroban contract */
  async mintReward(recipientPublicKey: string, amount: number): Promise<string> {
    this.ensureSecretKeyConfigured();
    if (!this.tokenContractId) {
      throw new Error('TOKEN_CONTRACT_ID not configured');
    }
    return this.trackTransaction(() =>
      pRetry(
        () =>
          this.invokeContract(this.tokenContractId, 'mint_reward', [
            new Address(recipientPublicKey).toScVal(),
            nativeToScVal(amount, { type: 'i128' }),
          ]),
        RETRY_OPTIONS
      )
    );
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private ensureSecretKeyConfigured(): void {
    if (!this.secretKey) {
      throw new ServiceUnavailableException(
        'STELLAR_SECRET_KEY is not configured. ' +
          'Signing operations (issuing credentials, minting tokens, recording progress) require the secret key. ' +
          'Configure STELLAR_SECRET_KEY environment variable to enable these features.'
      );
    }
  }

  async onApplicationShutdown(signal?: string) {
    this.logger.log(`Shutting down StellarService (signal: ${signal})`);
    this.isShuttingDown = true;

    if (this.pendingTransactionCount > 0) {
      this.logger.warn(
        `⏳ Waiting for ${this.pendingTransactionCount} pending Stellar transaction(s) to complete...`
      );

      const startTime = Date.now();
      while (this.pendingTransactionCount > 0 && Date.now() - startTime < this.SHUTDOWN_TIMEOUT_MS) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (this.pendingTransactionCount > 0) {
        this.logger.warn(
          `⚠️  Shutdown timeout: ${this.pendingTransactionCount} Stellar transaction(s) still pending after ${this.SHUTDOWN_TIMEOUT_MS}ms. ` +
            'These may result in user charges without database records. Consider increasing deployment grace period.'
        );
      } else {
        this.logger.log('✅ All pending Stellar transactions completed successfully');
      }
    }
  }

  private incrementPendingTransactions(): void {
    this.pendingTransactionCount++;
  }

  private decrementPendingTransactions(): void {
    if (this.pendingTransactionCount > 0) {
      this.pendingTransactionCount--;
    }
  }

  private async trackTransaction<T>(fn: () => Promise<T>): Promise<T> {
    this.incrementPendingTransactions();
    try {
      return await fn();
    } finally {
      this.decrementPendingTransactions();
    }
  }

  private async recordProgressOnChain(studentPublicKey: string, courseId: string): Promise<void> {
    await this.invokeContract(this.analyticsContractId ?? this.contractId, 'record_progress', [
      new Address(studentPublicKey).toScVal(),
      nativeToScVal(courseId, { type: 'symbol' }),
      nativeToScVal(100, { type: 'i32' }),
    ]);
  }

  private async issueCredentialFallback(
    recipientPublicKey: string,
    courseId: string
  ): Promise<void> {
    this.ensureSecretKeyConfigured();
    const issuerKeypair = Keypair.fromSecret(this.secretKey);
    const issuerAccount = await this.server.loadAccount(issuerKeypair.publicKey());

    const tx = new TransactionBuilder(issuerAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.manageData({
          name: `scoopdope:credential:${courseId}`,
          value: recipientPublicKey,
        })
      )
      .setTimeout(30)
      .build();

    tx.sign(issuerKeypair);
    await this.server.submitTransaction(tx);
  }

  private async invokeContract(contractId: string, method: string, args: any[]): Promise<string> {
    this.ensureSecretKeyConfigured();
    const issuerKeypair = Keypair.fromSecret(this.secretKey);
    const source = await this.sorobanServer.getAccount(issuerKeypair.publicKey());

    const tx = new TransactionBuilder(source as any, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: contractId,
          function: method,
          args,
        })
      )
      .setTimeout(30)
      .build();

    const prepared = await this.sorobanServer.prepareTransaction(tx);
    (prepared as any).sign(issuerKeypair);
    const result = await this.sorobanServer.sendTransaction(prepared as any);
    this.logger.log(`Contract ${method} tx: ${result.hash}`);
    return result.hash;
  }

  private async mintCredentialViaHorizon(
    recipientPublicKey: string,
    courseId: string
  ): Promise<string> {
    this.ensureSecretKeyConfigured();
    const issuerKeypair = Keypair.fromSecret(this.secretKey);
    const issuerAccount = await this.server.loadAccount(issuerKeypair.publicKey());

    const tx = new TransactionBuilder(issuerAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.manageData({
          name: `scoopdope:credential:${courseId}`,
          value: recipientPublicKey,
        })
      )
      .setTimeout(30)
      .build();

    tx.sign(issuerKeypair);
    const result = await this.server.submitTransaction(tx);
    this.logger.log(`Credential issued via Horizon: ${result.hash}`);
    return result.hash;
  }
}
