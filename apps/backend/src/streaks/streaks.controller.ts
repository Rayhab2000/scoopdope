import { Controller, Get, Post, UseGuards, Request } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { StreaksService } from './streaks.service';

@ApiTags('streaks')
@ApiBearerAuth()
@Controller('streaks')
export class StreaksController {
  constructor(
    private readonly usersService: UsersService,
    private readonly streaksService: StreaksService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('current')
  @ApiOperation({ summary: 'Get current user streak info' })
  @ApiResponse({
    status: 200,
    description: 'Returns streak info',
    schema: {
      example: {
        currentStreak: 5,
        longestStreak: 12,
        lastActivityAt: '2024-01-01T12:00:00.000Z',
      },
    },
  })
  async getCurrentStreak(@Request() req: { user: { id: string } }) {
    const user = await this.usersService.findById(req.user.id);
    return {
      currentStreak: user?.currentStreak ?? 0,
      longestStreak: user?.longestStreak ?? 0,
      lastActivityAt: user?.lastActivityAt ?? null,
    };
  }

  /**
   * Records a learning-activity event for the authenticated user.
   *
   * - Calling this endpoint once per calendar day (UTC) increments the
   *   user's `currentStreak` by 1.
   * - Calling it multiple times on the same day is idempotent — only
   *   `lastActivityAt` is updated; the streak counter is not inflated.
   * - Missing a full UTC day resets `currentStreak` to 1.
   * - When the streak crosses a milestone (7 / 30 / 100 days) BST token
   *   rewards are automatically minted on the Stellar network.
   *
   * Returns the updated streak snapshot so the client can update its UI
   * immediately without a follow-up GET.
   */
  @UseGuards(JwtAuthGuard)
  @Post('activity')
  @ApiOperation({
    summary: 'Record a learning activity for the current user',
    description:
      'Increments the daily streak counter. Idempotent within the same UTC day. ' +
      'Milestone rewards (7 / 30 / 100 days) are minted as BST tokens automatically.',
  })
  @ApiResponse({
    status: 201,
    description: 'Activity recorded; returns the updated streak snapshot',
    schema: {
      example: {
        currentStreak: 8,
        longestStreak: 12,
        lastActivityAt: '2026-06-30T16:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized – valid JWT required',
  })
  async recordActivity(@Request() req: { user: { id: string } }) {
    const updated = await this.streaksService.recordActivity(req.user.id);
    return {
      currentStreak: updated.currentStreak,
      longestStreak: updated.longestStreak,
      lastActivityAt: updated.lastActivityAt,
    };
  }
}
