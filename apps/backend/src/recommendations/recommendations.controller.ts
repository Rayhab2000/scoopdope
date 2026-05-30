import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RecommendationsService } from './recommendations.service';

@ApiTags('recommendations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/recommendations')
export class RecommendationsController {
  constructor(private readonly service: RecommendationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get personalized course recommendations' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getRecommendations(
    @Request() req: any,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const capped = Math.min(limit, 50);
    const recommendations = await this.service.getRecommendations(
      req.user.userId,
      capped,
    );
    return {
      data: recommendations,
      total: recommendations.length,
      limit: capped,
    };
  }
}
