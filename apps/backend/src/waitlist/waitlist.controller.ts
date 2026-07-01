import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { WaitlistService } from './waitlist.service';

@ApiTags('waitlist')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  // ── Student endpoints ──────────────────────────────────────────────────────

  @Post('courses/:id/waitlist')
  @ApiOperation({ summary: 'Join the waitlist for a full course' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 201, description: 'Joined waitlist successfully' })
  @ApiResponse({ status: 400, description: 'Course has available spots or not available' })
  @ApiResponse({ status: 409, description: 'Already enrolled or on waitlist' })
  join(
    @Param('id') courseId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.waitlistService.join(req.user.id, courseId);
  }

  @Delete('courses/:id/waitlist')
  @ApiOperation({ summary: 'Leave the waitlist for a course' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 200, description: 'Left waitlist successfully' })
  @ApiResponse({ status: 404, description: 'Not on waitlist' })
  leave(
    @Param('id') courseId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.waitlistService.leave(req.user.id, courseId);
  }

  @Get('courses/:id/waitlist/position')
  @ApiOperation({ summary: "Get the current user's waitlist position for a course" })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 200, description: 'Position (null if not on waitlist)' })
  async getPosition(
    @Param('id') courseId: string,
    @Request() req: { user: { id: string } },
  ) {
    const position = await this.waitlistService.getPosition(req.user.id, courseId);
    const total = await this.waitlistService.getWaitlistCount(courseId);
    return { position, total };
  }

  @Get('users/me/waitlist')
  @ApiOperation({ summary: "Get all courses the current user is waitlisted for" })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 200, description: 'List of waitlist entries with course details' })
  getMyWaitlist(@Request() req: { user: { id: string } }) {
    return this.waitlistService.listForUser(req.user.id);
  }

  // ── Admin endpoints ────────────────────────────────────────────────────────

  @Get('admin/courses/:id/waitlist')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Admin: list all waitlist entries for a course' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 200, description: 'Ordered list of waitlist entries' })
  adminList(@Param('id') courseId: string) {
    return this.waitlistService.listForCourse(courseId);
  }

  @Delete('admin/courses/:courseId/waitlist/:userId')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Admin: remove a user from a course waitlist' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 200, description: 'User removed from waitlist' })
  adminRemove(
    @Param('courseId') courseId: string,
    @Param('userId') userId: string,
  ) {
    return this.waitlistService.adminRemove(courseId, userId);
  }

  @Post('admin/courses/:id/waitlist/promote')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Admin: manually trigger promotion of next waitlisted student' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 200, description: 'Next student promoted (if spot available)' })
  adminPromote(@Param('id') courseId: string) {
    return this.waitlistService.promoteNext(courseId);
  }
}
