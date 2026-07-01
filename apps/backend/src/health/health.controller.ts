import { Controller, Get, Inject, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  HealthCheckService,
  HealthCheck,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
  HttpHealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ConfigService } from '@nestjs/config';
import { HealthService } from './health.service';
import {
  DiskHealthIndicator,
  ElasticsearchHealthIndicator,
  StellarSorobanHealthIndicator,
} from './indicators';
import {
  MEMORY_HEAP_THRESHOLD_BYTES,
  MEMORY_RSS_THRESHOLD_BYTES,
} from './health.constants';

@ApiTags('Health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly http: HttpHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly elasticsearch: ElasticsearchHealthIndicator,
    private readonly stellarSoroban: StellarSorobanHealthIndicator,
    private readonly healthService: HealthService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Full health check',
    description:
      'Returns comprehensive health status of the application including database, Redis, Stellar, memory, disk, and Elasticsearch connectivity.',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 200, description: 'All health checks passed' })
  @ApiResponse({ status: 503, description: 'One or more health checks failed' })
  @HealthCheck()
  async check() {
    this.logger.debug('Performing full health check', { context: 'HealthController' });

    const horizonUrl =
      this.configService.get<string>('stellar.horizonUrl') ||
      process.env.STELLAR_HORIZON_URL ||
      'https://horizon-testnet.stellar.org';

    const result = await this.health.check([
      () => this.db.pingCheck('database'),
      () => this.memory.checkHeap('memory_heap', MEMORY_HEAP_THRESHOLD_BYTES),
      () => this.memory.checkRSS('memory_rss', MEMORY_RSS_THRESHOLD_BYTES),
      () => this.checkRedis(),
      () => this.http.pingCheck('stellar_horizon', `${horizonUrl}/health`),
      () => this.disk.check('disk'),
      () => this.elasticsearch.check('elasticsearch'),
      () => this.stellarSoroban.check('stellar_soroban'),
    ]);

    this.logger.info('Full health check completed', {
      context: 'HealthController',
      status: result.status,
      checks: Object.keys(result.details || {}).length,
    });

    return result;
  }

  @Get('live')
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Lightweight probe for container orchestrators. Returns 200 if the process is alive and not shutting down. Does NOT check dependencies.',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 200, description: 'Process is alive' })
  @ApiResponse({ status: 503, description: 'Process is shutting down' })
  async checkLiveness() {
    const result = await this.healthService.checkLiveness();
    return result;
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Readiness probe for load balancers and container orchestrators. Checks if the application can serve traffic (DB, Redis).',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 200, description: 'Application is ready to serve traffic' })
  @ApiResponse({ status: 503, description: 'Application is not ready' })
  async checkReadiness() {
    const result = await this.healthService.checkReadiness();
    return result;
  }

  @Get('startup')
  @ApiOperation({
    summary: 'Startup probe',
    description:
      'Startup probe for container orchestrators. Returns 200 once the application has initialized successfully.',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 200, description: 'Application started successfully' })
  async checkStartup() {
    const result = await this.healthService.checkStartup();
    return result;
  }

  @Get('environment')
  @ApiOperation({
    summary: 'Environment info',
    description:
      'Returns blue/green deployment environment information for load balancer integration.',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 200, description: 'Environment information retrieved' })
  async checkEnvironment() {
    return this.healthService.getEnvironmentInfo();
  }

  @Get('version')
  @ApiOperation({
    summary: 'Version info',
    description:
      'Returns application version, uptime, and system information for monitoring integrations.',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 200, description: 'Version information retrieved' })
  async checkVersion() {
    return this.healthService.getSystemInfo();
  }

  private async checkRedis(): Promise<HealthIndicatorResult> {
    const key = 'health-check';
    const testValue = Date.now().toString();

    try {
      await this.cacheManager.set(key, testValue, 1000);
      const retrievedValue = await this.cacheManager.get(key);

      if (retrievedValue === testValue) {
        return {
          redis: {
            status: 'up',
            message: 'Redis is responsive',
          },
        };
      } else {
        throw new Error('Redis value mismatch');
      }
    } catch (error: any) {
      this.logger.warn('Redis health check failed', {
        context: 'HealthController',
        error: error.message,
      });
      throw new Error(`Redis health check failed: ${error.message}`);
    }
  }
}
