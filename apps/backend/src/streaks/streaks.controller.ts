import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from '../users/users.service';

@ApiTags('streaks')
@ApiBearerAuth()
@Controller('streaks')
export class StreaksController {
  constructor(private readonly usersService: UsersService) {}

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
}
