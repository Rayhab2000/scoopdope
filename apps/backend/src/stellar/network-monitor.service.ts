import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { NetworkStatus, ServiceStatus } from './types/network-status.types';

@Injectable()
export class NetworkMonitorService implements OnModuleInit {
  private readonly logger = new Logger(NetworkMonitorService.name);
  private status: NetworkStatus;

  constructor(private configService: ConfigService) {
    this.status = {
      horizon: { status: 'down', url: '', latencyMs: 0, lastChecked: '' },
      soroban: { status: 'down', url: '', latencyMs: 0, lastChecked: '' },
      timestamp: new Date().toISOString(),
      network: this.configService.get('STELLAR_NETWORK') || 'testnet',
    };
  }

  async onModuleInit() {
    await this.checkHealth();
    // Regular health checks every 60 seconds
    setInterval(() => this.checkHealth(), 60000);
  }

  private async checkService(url: string, _type: 'horizon' | 'soroban'): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      const response = await axios.get(url, { timeout: 5000 });
      const latency = Date.now() - start;

      return {
        status: response.status === 200 ? 'healthy' : 'unstable',
        url,
        latencyMs: latency,
        lastChecked: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        status: 'down',
        url,
        latencyMs: Date.now() - start,
        lastChecked: new Date().toISOString(),
        error: error.message,
      };
    }
  }

  async checkHealth() {
    const isTestnet = this.configService.get('STELLAR_NETWORK') !== 'mainnet';
    const horizonUrl = isTestnet
      ? 'https://horizon-testnet.stellar.org'
      : 'https://horizon.stellar.org';
    const sorobanUrl =
      this.configService.get('SOROBAN_RPC_URL') || 'https://soroban-testnet.stellar.org';

    this.logger.log('Performing network health checks...');

    const [horizonStatus, sorobanStatus] = await Promise.all([
      this.checkService(horizonUrl, 'horizon'),
      this.checkService(sorobanUrl, 'soroban'),
    ]);

    this.status = {
      horizon: horizonStatus,
      soroban: sorobanStatus,
      timestamp: new Date().toISOString(),
      network: isTestnet ? 'testnet' : 'mainnet',
    };

    if (this.status.horizon.status !== 'healthy' || this.status.soroban.status !== 'healthy') {
      this.logger.warn(
        `Network monitoring alert: Horizon ${this.status.horizon.status}, Soroban ${this.status.soroban.status}`
      );
    } else {
      this.logger.log(
        `Network health check passed: Horizon ${horizonStatus.latencyMs}ms, Soroban ${sorobanStatus.latencyMs}ms`
      );
    }
  }

  getNetworkStatus(): NetworkStatus {
    return this.status;
  }
}
