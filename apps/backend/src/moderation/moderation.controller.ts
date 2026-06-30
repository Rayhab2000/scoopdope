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
import { ModerationService } from './moderation.service';
import { ContentType } from './moderation.enums';
import {
  AppealDto,
  FlagContentDto,
  ModerationQueueQueryDto,
  ReviewItemDto,
} from './dto/moderation.dto';

@ApiTags('moderation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('moderation')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get('content/:contentType/:contentId/hidden')
  @ApiOperation({ summary: 'Check if content is auto-hidden' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  isHidden(
    @Param('contentType') contentType: ContentType,
    @Param('contentId') contentId: string,
  ) {
    return this.moderationService.isContentHidden(contentType, contentId);
  }

  @Post('flag')
  @ApiOperation({ summary: 'Flag content for review' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  flag(@Body() dto: FlagContentDto, @Request() req: { user: { id: string } }) {
    return this.moderationService.flagContent(dto, req.user.id);
  }

  @Get('queue')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Get moderation queue (admin)' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getQueue(@Query() query: ModerationQueueQueryDto) {
    return this.moderationService.getQueue(query);
  }

  @Patch(':id/review')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Review a moderation item (admin)' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  review(
    @Param('id') id: string,
    @Body() dto: ReviewItemDto,
    @Request() req: { user: { id: string } }
  ) {
    return this.moderationService.reviewItem(id, dto, req.user.id);
  }

  @Post(':id/appeal')
  @ApiOperation({ summary: 'Submit an appeal for a rejected item' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  appeal(
    @Param('id') id: string,
    @Body() dto: AppealDto,
    @Request() req: { user: { id: string } }
  ) {
    return this.moderationService.submitAppeal(id, dto, req.user.id);
  }

  @Patch(':id/appeal/resolve')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Resolve an appeal (admin)' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  resolveAppeal(
    @Param('id') id: string,
    @Body() body: { approve: boolean; note?: string },
    @Request() req: { user: { id: string } }
  ) {
    return this.moderationService.resolveAppeal(id, body.approve, req.user.id, body.note);
  }

  @Get(':id/logs')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Get audit logs for a moderation item (admin)' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getLogs(@Param('id') id: string) {
    return this.moderationService.getLogs(id);
  }
}
