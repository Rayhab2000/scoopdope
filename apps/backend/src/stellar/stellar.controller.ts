import { Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { StellarService } from './stellar.service';
import { NetworkMonitorService } from './network-monitor.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('stellar')
@Controller('stellar')
export class StellarController {
  constructor(
    private stellarService: StellarService,
    private networkMonitorService: NetworkMonitorService
  ) {}

  @Get('network-status')
  @ApiOperation({ summary: 'Get Stellar network health status' })
  @ApiResponse({ status: 200, description: 'Returns network health metrics' })
  getNetworkStatus() {
    return this.networkMonitorService.getNetworkStatus();
  }

  @Get('balance/:publicKey')
  @ApiOperation({ summary: 'Get Stellar account balance' })
  @ApiResponse({ status: 200, description: 'Returns account balances' })
  getBalance(@Param('publicKey') publicKey: string) {
    return this.stellarService.getAccountBalance(publicKey);
  }

  @Get('transactions/:publicKey')
  @ApiOperation({ summary: 'Get recent Stellar transactions for an account' })
  @ApiResponse({ status: 200, description: 'Returns recent transactions' })
  getTransactions(
    @Param('publicKey') publicKey: string,
    @Query('limit') limit?: string
  ) {
    return this.stellarService.getTransactions(publicKey, limit ? parseInt(limit, 10) : 10);
  }

  @Post('fund-testnet')
  @ApiOperation({ summary: 'Fund a testnet account via Friendbot (testnet only)' })
  @ApiResponse({ status: 201, description: 'Account funded successfully' })
  @ApiResponse({ status: 400, description: 'Not available on mainnet or Friendbot error' })
  async fundTestnet(@Body() body: { publicKey: string }) {
    return this.stellarService.fundTestnetAccount(body.publicKey);
  }

  @Post('mint')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mint a credential NFT' })
  @ApiBody({ schema: { example: { recipientPublicKey: 'GABC...', courseId: 'uuid' } } })
  @ApiResponse({
    status: 201,
    description: 'Credential minted successfully',
    schema: {
      example: { data: 'transaction_hash', statusCode: 201, timestamp: '2024-01-01T00:00:00.000Z' },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  mintCredential(@Body() body: { recipientPublicKey: string; courseId: string }) {
    return this.stellarService.issueCredential(body.recipientPublicKey, body.courseId);
  }
}

@ApiTags('credentials')
@Controller('credentials')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class CredentialsController {
  constructor(private stellarService: StellarService) {}

  @Post('issue')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Roles('admin')
  @ApiOperation({ summary: 'Issue a credential for course completion' })
  @ApiBody({ schema: { example: { recipientPublicKey: 'GABC...', courseId: 'uuid' } } })
  @ApiResponse({
    status: 201,
    description: 'Credential issued successfully',
    schema: {
      example: { data: 'transaction_hash', statusCode: 201, timestamp: '2024-01-01T00:00:00.000Z' },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  issueCredential(@Body() body: { recipientPublicKey: string; courseId: string }) {
    return this.stellarService.issueCredential(body.recipientPublicKey, body.courseId);
  }
}
