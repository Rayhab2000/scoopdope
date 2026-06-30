import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { InstructorApplicationsService } from './instructor-applications.service';
import {
  CreateInstructorApplicationDto,
  ReviewApplicationDto,
} from './dto/instructor-application.dto';

@ApiTags('instructor-applications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('instructor-applications')
export class InstructorApplicationsController {
  constructor(private readonly service: InstructorApplicationsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit an instructor application' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 201, description: 'Application submitted' })
  @ApiResponse({ status: 400, description: 'Agreement not accepted or validation error' })
  @ApiResponse({ status: 409, description: 'Pending application already exists' })
  apply(
    @Body() dto: CreateInstructorApplicationDto,
    @Request() req: { user: { id: string } }
  ) {
    return this.service.apply(req.user.id, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get my instructor application status' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 200, description: 'Returns the most recent application' })
  getMyApplication(@Request() req: { user: { id: string } }) {
    return this.service.findMyApplication(req.user.id);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'List all instructor applications (admin)' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 200, description: 'Returns list of applications' })
  findAll(@Query('status') status?: string) {
    return this.service.findAll(status);
  }

  @Patch(':id/review')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Approve or reject an instructor application (admin)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 200, description: 'Application reviewed; user role updated if approved' })
  @ApiResponse({ status: 400, description: 'Already reviewed' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  review(
    @Param('id') id: string,
    @Body() dto: ReviewApplicationDto,
    @Request() req: { user: { id: string } }
  ) {
    return this.service.review(id, req.user.id, dto);
  }
}
