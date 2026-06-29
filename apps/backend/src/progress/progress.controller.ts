import { Controller, Post, Get, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProgressService } from './progress.service';
import { RecordProgressDto } from './dto/record-progress.dto';

@ApiTags('progress')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ProgressController {
  constructor(private progressService: ProgressService) {}

  @Post('progress')
  @ApiOperation({ summary: 'Record lesson completion and update on-chain progress' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiBody({ schema: { example: { courseId: 'uuid', lessonId: 'uuid', progressPct: 75 } } })
  @ApiResponse({
    status: 201,
    description: 'Progress recorded',
    schema: { example: { id: 'uuid', courseId: 'uuid', progressPct: 75 } },
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  record(@Request() req, @Body() dto: RecordProgressDto) {
    return this.progressService.record(req.user.id, dto, req.user.stellarPublicKey);
  }

  @Get('users/:id/progress')
  @ApiOperation({ summary: 'Get all progress records for a user' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({
    status: 200,
    description: 'List of progress records',
    schema: {
      example: [{ courseId: 'uuid', progressPct: 75, updatedAt: '2024-01-01T00:00:00.000Z' }],
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findByUser(@Param('id') id: string) {
    return this.progressService.findByUser(id);
  }
}
