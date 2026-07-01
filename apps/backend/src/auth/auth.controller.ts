import { Body, Controller, Get, Post, Query, Redirect, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { AUTH_RATE_LIMIT } from '../rate-limit/rate-limit.constants';
import { AuthService } from './auth.service';
import { StellarAuthService } from './stellar-auth.service';
import { GoogleAuthGuard } from './google-auth.guard';
import { GoogleProfile } from './google.strategy';
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

class AuthDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
}

class LoginDto extends AuthDto {
  @IsString()
  @IsOptional()
  mfa_token?: string;
}

class ResendVerificationDto {
  @IsEmail() email: string;
}

class ForgotPasswordDto {
  @IsEmail() email: string;
}

class ResetPasswordDto {
  @IsString() token: string;
  @IsString() @MinLength(8) newPassword: string;
}

class RefreshDto {
  @IsString() refresh_token: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private stellarAuthService: StellarAuthService,
    private configService: ConfigService,
  ) {}

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  @ApiResponse({ status: 302, description: 'Redirects to Google OAuth consent screen' })
  googleLogin() {
    // Guard redirects to Google
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @Redirect()
  @ApiOperation({ summary: 'Google OAuth callback — issues JWT and redirects to frontend' })
  @ApiResponse({ status: 302, description: 'Redirects to frontend with tokens' })
  async googleCallback(@Req() req: { user: GoogleProfile }) {
    const tokens = await this.authService.googleOAuthLogin(req.user);
    const frontendUrl = this.configService.get<string>('frontend.url');
    return {
      url: `${frontendUrl}/auth/callback?access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token}`,
    };
  }

  @Get('stellar')
  @ApiOperation({ summary: 'SEP-0010: get challenge transaction' })
  @ApiResponse({
    status: 200,
    description: 'Returns unsigned challenge XDR and network passphrase',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  stellarChallenge(@Query('account') account: string) {
    return this.stellarAuthService.buildChallenge(account);
  }

  @Post('stellar')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @RateLimit(AUTH_RATE_LIMIT)
  @ApiOperation({ summary: 'SEP-0010: verify signed challenge and receive JWT' })
  @ApiResponse({ status: 201, description: 'Returns access_token' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Invalid or expired challenge' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  stellarVerify(@Body('transaction') transaction: string) {
    return this.stellarAuthService.verifyChallenge(transaction);
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @RateLimit({ limit: 5, windowMs: 60000 })
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ schema: { example: { email: 'user@example.com', password: 'password123' } } })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
    schema: { example: { access_token: 'jwt', refresh_token: 'token' } },
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  register(@Body() dto: AuthDto, @Query('ref') ref?: string) {
    return this.authService.register(dto.email, dto.password, ref);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @RateLimit({ limit: 5, windowMs: 60000 })
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({ schema: { example: { email: 'user@example.com', password: 'password123' } } })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: { example: { access_token: 'jwt', refresh_token: 'token' } },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password, dto.mfa_token);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiBody({ schema: { example: { refresh_token: 'token' } } })
  @ApiResponse({
    status: 200,
    description: 'New access token issued',
    schema: { example: { access_token: 'jwt' } },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refresh_token);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  @ApiBody({ schema: { example: { refresh_token: 'token' } } })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  logout(@Body() dto: RefreshDto) {
    return this.authService.logout(dto.refresh_token);
  }

  @Get('verify')
  @ApiOperation({ summary: 'Verify email address via token' })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend email verification link' })
  @ApiBody({ schema: { example: { email: 'user@example.com' } } })
  @ApiResponse({ status: 200, description: 'Verification email sent' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }

  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @RateLimit({ limit: 3, windowMs: 3600000 })
  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiBody({ schema: { example: { email: 'user@example.com' } } })
  @ApiResponse({ status: 200, description: 'Password reset email sent' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using token' })
  @ApiBody({ schema: { example: { token: 'reset-token', newPassword: 'newpassword123' } } })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('mfa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Enable MFA - generate TOTP secret' })
  @ApiResponse({ status: 200, description: 'Returns TOTP secret and QR code URL' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  enableMfa(@Req() req) {
    return this.authService.generateMfaSecret(req.user.id);
  }

  @Post('mfa/verify')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Verify MFA code and enable TOTP' })
  @ApiResponse({ status: 200, description: 'MFA enabled successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  verifyMfa(@Req() req, @Body('code') code: string) {
    return this.authService.verifyMfaSecret(req.user.id, code);
  }

  @Post('mfa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Disable MFA' })
  @ApiResponse({ status: 200, description: 'MFA disabled successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  disableMfa(@Req() req, @Body('code') code: string) {
    return this.authService.disableMfa(req.user.id, code);
  }

  @Post('mfa/backup-codes/regenerate')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Regenerate backup codes (requires valid TOTP)' })
  @ApiResponse({ status: 200, description: 'Backup codes regenerated' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  regenerateBackupCodes(@Req() req, @Body('code') code: string) {
    return this.authService.regenerateBackupCodes(req.user.id, code);
  }

  @Post('admin/api-keys')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Generate an API key for a user (admin)' })
  @ApiResponse({ status: 201, description: 'API key generated' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  generateApiKey(@Body('userId') userId: string, @Body('name') name: string) {
    return this.authService.generateApiKey(userId, name);
  }

  @Post('admin/api-keys/revoke')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Revoke an API key (admin)' })
  @ApiResponse({ status: 200, description: 'API key revoked' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  revokeApiKey(@Body('id') id: string) {
    return this.authService.revokeApiKey(id);
  }

  @Post('stellar-challenge')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Generate a challenge for Stellar wallet signing' })
  @ApiResponse({ status: 200, description: 'Challenge generated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  generateStellarChallenge(@Body('publicKey') publicKey: string) {
    return this.authService.generateStellarChallenge(publicKey);
  }

  @Post('stellar-verify')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify Stellar wallet signature and link to account' })
  @ApiResponse({ status: 200, description: 'Wallet linked successfully' })
  @ApiResponse({ status: 400, description: 'Invalid signature or challenge' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  verifyStellarSignature(
    @Req() req,
    @Body('publicKey') publicKey: string,
    @Body('signature') signature: string,
    @Body('challenge') challenge: string
  ) {
    return this.authService.verifyStellarSignature(req.user.id, publicKey, signature, challenge);
  }
}
