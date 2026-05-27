import { Injectable } from '@nestjs/common';
import { Counter, Histogram, register } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly httpRequestsTotal: Counter;
  private readonly credentialIssuedTotal: Counter;
  private readonly bstMintedTotal: Counter;
  private readonly stellarRpcLatency: Histogram;
  private readonly cacheHitsTotal: Counter;
  private readonly cacheMissesTotal: Counter;

  constructor() {
    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [register],
    });

    this.credentialIssuedTotal = new Counter({
      name: 'credential_issued_total',
      help: 'Total number of credentials issued',
      labelNames: ['credential_type'],
      registers: [register],
    });

    this.bstMintedTotal = new Counter({
      name: 'bst_minted_total',
      help: 'Total number of BST tokens minted',
      labelNames: ['user_id'],
      registers: [register],
    });

    this.stellarRpcLatency = new Histogram({
      name: 'stellar_rpc_latency_seconds',
      help: 'Stellar RPC call latency in seconds',
      labelNames: ['method', 'status'],
      buckets: [0.1, 0.5, 1, 2, 5],
      registers: [register],
    });

    this.cacheHitsTotal = new Counter({
      name: 'cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['cache'],
      registers: [register],
    });

    this.cacheMissesTotal = new Counter({
      name: 'cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['cache'],
      registers: [register],
    });
  }

  incrementHttpRequests(method: string, route: string, statusCode: number) {
    this.httpRequestsTotal.inc({
      method,
      route,
      status_code: statusCode.toString(),
    });
  }

  incrementCredentialIssued(credentialType: string) {
    this.credentialIssuedTotal.inc({ credential_type: credentialType });
  }

  incrementBstMinted(userId: string) {
    this.bstMintedTotal.inc({ user_id: userId });
  }

  observeStellarRpcLatency(method: string, status: string, durationSeconds: number) {
    this.stellarRpcLatency.observe({ method, status }, durationSeconds);
  }

  incrementCacheHit(cache: string) {
    this.cacheHitsTotal.inc({ cache });
  }

  incrementCacheMiss(cache: string) {
    this.cacheMissesTotal.inc({ cache });
  }
}
