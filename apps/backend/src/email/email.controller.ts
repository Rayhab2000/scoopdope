import { Controller, Get, Patch, Query, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EmailService } from './email.service';

class UpdatePrefsDto {
  @IsOptional() @IsBoolean() enrollment?: boolean;
  @IsOptional() @IsBoolean() completion?: boolean;
  @IsOptional() @IsBoolean() credentialIssued?: boolean;
  @IsOptional() @IsBoolean() marketing?: boolean;
}

@ApiTags('email')
@Controller('v1/email')
export class EmailController {
  constructor(private readonly service: EmailService) {}

  @Get('unsubscribe')
  @ApiOperation({ summary: 'Unsubscribe from all emails via token' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiQuery({ name: 'token', required: true })
  async unsubscribe(@Query('token') token: string) {
    await this.service.unsubscribeByToken(token);
    return { message: 'You have been unsubscribed from all emails.' };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('preferences')
  @ApiOperation({ summary: 'Get email preferences' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getPreferences(@Request() req: any) {
    return this.service.getPreferences(req.user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('preferences')
  @ApiOperation({ summary: 'Update email preferences' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  updatePreferences(@Request() req: any, @Body() dto: UpdatePrefsDto) {
    return this.service.updatePreferences(req.user.userId, dto);
  }
}
