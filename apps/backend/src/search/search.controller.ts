import { Body, Controller, Get, Optional, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SearchService, IndexName } from './search.service';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Full-text fuzzy search across courses, lessons, and posts' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiQuery({ name: 'q', description: 'Search query' })
  @ApiQuery({ name: 'indices', required: false, description: 'Comma-separated: courses,lessons,posts' })
  search(
    @Query('q') q: string,
    @Query('indices') indices?: string,
    @Request() req?: { user?: { id: string } }
  ) {
    const idx = indices
      ? (indices.split(',').filter(Boolean) as IndexName[])
      : undefined;
    return this.searchService.search(q, idx, req?.user?.id);
  }

  @Get('autocomplete')
  @ApiOperation({ summary: 'Autocomplete / search suggestions' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiQuery({ name: 'q', description: 'Prefix to complete' })
  @ApiQuery({ name: 'indices', required: false })
  autocomplete(
    @Query('q') q: string,
    @Query('indices') indices?: string
  ) {
    const idx = indices
      ? (indices.split(',').filter(Boolean) as IndexName[])
      : undefined;
    return this.searchService.autocomplete(q, idx);
  }

  @Post('click')
  @ApiOperation({ summary: 'Track a search result click for analytics' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  trackClick(
    @Body() body: { query: string; resultId: string; resultType: string },
    @Request() req?: { user?: { id: string } }
  ) {
    return this.searchService.trackClick(body.query, body.resultId, body.resultType, req?.user?.id);
  }

  @Get('analytics/top-queries')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get top search queries (admin)' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getTopQueries(@Query('limit') limit?: string) {
    return this.searchService.getTopQueries(limit ? parseInt(limit, 10) : 10);
  }
}
