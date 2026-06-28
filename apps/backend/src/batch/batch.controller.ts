import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BatchService, BatchPayloadItem } from './batch.service';

@ApiTags('batch')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('batch')
export class BatchController {
  constructor(private readonly batchService: BatchService) {}

  @Post('users')
  @ApiOperation({ summary: 'Bulk user operations (update, ban, unban, changeRole, delete)' })
  @ApiBody({
    schema: {
      example: {
        operations: [
          { action: 'ban', userId: 'uuid' },
          { action: 'changeRole', userId: 'uuid', role: 'instructor' },
        ],
      },
    },
  })
  batchUsers(
    @Body('operations') operations: BatchPayloadItem[],
    @Request() req: { user: { id: string } },
  ) {
    return this.batchService.createUserBatch(operations, req.user.id);
  }

  @Post('courses')
  @ApiOperation({ summary: 'Bulk course operations (create, update, delete)' })
  @ApiBody({
    schema: {
      example: {
        operations: [
          { action: 'update', courseId: 'uuid', isPublished: false },
          { action: 'delete', courseId: 'uuid' },
        ],
      },
    },
  })
  batchCourses(
    @Body('operations') operations: BatchPayloadItem[],
    @Request() req: { user: { id: string } },
  ) {
    return this.batchService.createCourseBatch(operations, req.user.id);
  }

  @Get('jobs')
  @ApiOperation({ summary: 'List batch jobs' })
  @ApiQuery({ name: 'type', required: false, enum: ['users', 'courses'] })
  listJobs(@Query('type') type?: string) {
    return this.batchService.listJobs(type);
  }

  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Get batch job status' })
  getJobStatus(@Param('jobId') jobId: string) {
    return this.batchService.getJobStatus(jobId);
  }
}
