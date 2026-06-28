import { Controller, Post, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { CdnService } from './cdn.service';
import { ContentType } from './cdn-asset.entity';

@Controller('v1/cdn')
@UseGuards(JwtAuthGuard)
export class CdnController {
  constructor(private cdnService: CdnService) {}

  @Post('upload')
  @UseGuards(RolesGuard)
  @Roles('admin', 'instructor')
  async uploadAsset(
    @Body() data: { lessonId?: string; fileName?: string; originalName?: string; mimeType?: string; contentType?: ContentType; fileSize?: number; isPrivate?: boolean },
    @CurrentUser() user: { id: string },
  ) {
    return this.cdnService.uploadAsset({
      lessonId: data.lessonId,
      fileName: data.fileName ?? 'upload',
      originalName: data.originalName ?? data.fileName ?? 'upload',
      mimeType: data.mimeType ?? 'application/octet-stream',
      contentType: data.contentType ?? ContentType.DOCUMENT,
      fileSize: data.fileSize ?? 0,
      uploadedByUserId: user.id,
      isPrivate: data.isPrivate ?? true,
    });
  }

  @Get(':assetId/signed-url')
  async getSignedUrl(
    @Param('assetId') assetId: string,
    @Query('expirationMinutes') expirationMinutes?: string,
  ) {
    const signedUrl = await this.cdnService.generateSignedUrl(
      assetId,
      expirationMinutes ? parseInt(expirationMinutes, 10) : 60,
    );
    return { signedUrl };
  }

  @Post(':assetId/transcode')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async markTranscoded(@Param('assetId') assetId: string, @Body() data: { bitrates?: number[]; thumbnailUrl?: string }) {
    return this.cdnService.markAsTranscoded(assetId, data.bitrates?.map(String) ?? [], data.thumbnailUrl);
  }

  @Post(':assetId/invalidate')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async invalidateCache(@Param('assetId') assetId: string) {
    return this.cdnService.invalidateCache(assetId);
  }

  @Get('lesson/:lessonId')
  async getLessonAssets(@Param('lessonId') lessonId: string) {
    return this.cdnService.getLessonAssets(lessonId);
  }

  @Get(':assetId')
  async getAsset(@Param('assetId') assetId: string) {
    return this.cdnService.getAsset(assetId);
  }
}
