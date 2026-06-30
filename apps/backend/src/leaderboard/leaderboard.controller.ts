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
