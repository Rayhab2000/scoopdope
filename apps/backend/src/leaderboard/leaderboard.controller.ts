import { Controller, Get, MessageEvent, Sse } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Observable, from, interval, map, startWith, switchMap } from 'rxjs';
import { LeaderboardService } from './leaderboard.service';

@ApiTags('leaderboard')
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  @ApiOperation({ summary: 'Get the top 50 BST holders' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 200, description: 'Returns leaderboard entries' })
  getLeaderboard() {
    return this.leaderboardService.getTopUsers();
  }

  /**
   * Returns the top 50 users ranked by their current daily learning streak.
   * Useful for motivating consistent learner engagement.
   *
   * Results are cached for 60 seconds.
   */
  @Get('streaks')
  @ApiOperation({ summary: 'Get the top 50 users ranked by current learning streak' })
  @ApiResponse({
    status: 200,
    description: 'Returns streak leaderboard entries sorted by current streak descending',
    schema: {
      example: [
        {
          rank: 1,
          userId: 'uuid-here',
          username: 'alice',
          currentStreak: 42,
          longestStreak: 55,
          lastActivityAt: '2026-06-30T12:00:00.000Z',
        },
      ],
    },
  })
  getStreakLeaderboard() {
    return this.leaderboardService.getStreakLeaderboard();
  }

  @Sse('stream')
  @ApiOperation({ summary: 'Stream leaderboard updates over SSE' })
  stream(): Observable<MessageEvent> {
    return interval(30_000).pipe(
      startWith(0),
      switchMap(() => from(this.leaderboardService.getTopUsers())),
      map((data) => ({ data }))
    );
  }
}
