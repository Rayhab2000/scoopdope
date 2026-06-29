import { Controller, Post, Get, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CohortsService } from './cohorts.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('cohorts')
@Controller('v1/cohorts')
@UseGuards(JwtAuthGuard)
export class CohortsController {
  constructor(private cohortsService: CohortsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new cohort' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async createCohort(@Body() data: any, @CurrentUser() user: any) {
    return this.cohortsService.createCohort(data.courseId, user.id, data);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get cohort by ID' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getCohort(@Param('id') id: string) {
    return this.cohortsService.getCohort(id);
  }

  @Post(':cohortId/members')
  @ApiOperation({ summary: 'Add member to cohort' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async addMember(
    @Param('cohortId') cohortId: string,
    @Body() data: any,
  ) {
    return this.cohortsService.addMember(cohortId, data.userId);
  }

  @Delete(':cohortId/members/:userId')
  @ApiOperation({ summary: 'Remove member from cohort' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async removeMember(
    @Param('cohortId') cohortId: string,
    @Param('userId') userId: string,
  ) {
    return this.cohortsService.removeMember(cohortId, userId);
  }

  @Post(':cohortId/progress')
  @ApiOperation({ summary: 'Update member progress' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async updateProgress(
    @Param('cohortId') cohortId: string,
    @Body() data: any,
  ) {
    return this.cohortsService.updateMemberProgress(
      cohortId,
      data.userId,
      data.progressPercentage,
    );
  }

  @Get(':cohortId/progress')
  @ApiOperation({ summary: 'Get cohort progress' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getCohortProgress(@Param('cohortId') cohortId: string) {
    return this.cohortsService.getCohortProgress(cohortId);
  }

  @Get('course/:courseId')
  @ApiOperation({ summary: 'Get cohorts by course' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getCohortsByCourse(@Param('courseId') courseId: string) {
    return this.cohortsService.getCohortsByCourse(courseId);
  }
}
