import { Controller, Get, Patch, Query, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
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
  @ApiQuery({ name: 'token', required: true })
  async unsubscribe(@Query('token') token: string) {
    await this.service.unsubscribeByToken(token);
    return { message: 'You have been unsubscribed from all emails.' };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('preferences')
  @ApiOperation({ summary: 'Get email preferences' })
  getPreferences(@Request() req: { user: { userId: string } }) {
    return this.service.getPreferences(req.user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('preferences')
  @ApiOperation({ summary: 'Update email preferences' })
  updatePreferences(@Request() req: { user: { userId: string } }, @Body() dto: UpdatePrefsDto) {
    return this.service.updatePreferences(req.user.userId, dto);
  }
}
