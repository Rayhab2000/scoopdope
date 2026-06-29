import { Body, Controller, Delete, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrerequisitesService } from './prerequisites.service';

@ApiTags('course-prerequisites')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('courses/:courseId/prerequisites')
export class PrerequisitesController {
  constructor(private readonly prereqService: PrerequisitesService) {}

  @Get()
  @Roles('admin', 'instructor', 'student')
  @ApiOperation({ summary: 'List prerequisites for a course' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getPrerequisites(@Param('courseId') courseId: string) {
    return this.prereqService.getPrerequisites(courseId);
  }

  @Get('chain')
  @Roles('admin', 'instructor', 'student')
  @ApiOperation({ summary: 'Get full prerequisite chain for visualization' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getChain(@Param('courseId') courseId: string) {
    return this.prereqService.getPrerequisiteChain(courseId);
  }

  @Get('status')
  @Roles('admin', 'instructor', 'student')
  @ApiOperation({ summary: 'Get prerequisite completion status for the current user' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getStatus(
    @Param('courseId') courseId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.prereqService.getPrerequisiteStatus(courseId, req.user.id);
  }

  @Post()
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Add a prerequisite to a course' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  addPrerequisite(
    @Param('courseId') courseId: string,
    @Body('prerequisiteId') prerequisiteId: string,
  ) {
    return this.prereqService.addPrerequisite(courseId, prerequisiteId);
  }

  @Delete(':prerequisiteId')
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Remove a prerequisite from a course' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  removePrerequisite(
    @Param('courseId') courseId: string,
    @Param('prerequisiteId') prerequisiteId: string,
  ) {
    return this.prereqService.removePrerequisite(courseId, prerequisiteId);
  }

  @Post('validate/:userId')
  @Roles('admin')
  @ApiOperation({ summary: 'Check if a user satisfies prerequisites (admin can override)' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  validatePrerequisites(
    @Param('courseId') courseId: string,
    @Param('userId') userId: string,
    @Body('adminOverride') adminOverride?: boolean,
  ) {
    return this.prereqService.validatePrerequisites(userId, courseId, adminOverride ?? false);
  }
}
