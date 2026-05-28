import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CredentialsService } from './credentials.service';
import { CertificatePdfService } from './certificate-pdf.service';

@ApiTags('credentials')
@Controller('credentials')
export class CredentialsController {
  constructor(
    private credentialsService: CredentialsService,
    private certificatePdfService: CertificatePdfService
  ) {}

  @Get('detail/:id')
  @ApiOperation({ summary: 'Public: Get a credential by ID' })
  @ApiResponse({ status: 200, description: 'Credential found' })
  @ApiResponse({ status: 404, description: 'Credential not found' })
  async findOne(@Param('id') id: string) {
    const credential = await this.credentialsService.findOne(id);
    return {
      id: credential.id,
      courseName: credential.course?.title,
      studentName: credential.user?.username || credential.user?.email || 'Student',
      issuedAt: credential.issuedAt,
      txHash: credential.txHash,
      grade: credential.grade,
      skills: credential.course?.skills,
    };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id/pdf')
  @Header('Content-Type', 'application/pdf')
  @ApiOperation({ summary: 'Download a credential as a PDF certificate' })
  @ApiResponse({ status: 200, description: 'PDF certificate generated successfully' })
  async downloadPdf(@Param('id') id: string) {
    const credential = await this.credentialsService.findOne(id);
    const pdf = this.certificatePdfService.generateCertificatePdf(credential);
    return new StreamableFile(pdf, {
      disposition: `attachment; filename="credential-${id}.pdf"`,
      type: 'application/pdf',
    });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':userId')
  @ApiOperation({ summary: 'List all credentials for a user' })
  @ApiResponse({
    status: 200,
    description: 'List of credentials',
    schema: {
      example: [
        { id: 'uuid', courseId: 'uuid', txHash: 'abc123', issuedAt: '2024-01-01T00:00:00.000Z' },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findByUser(@Param('userId') userId: string) {
    return this.credentialsService.findByUser(userId);
  }

  @Get('verify/:txHash')
  @ApiOperation({ summary: 'Verify a credential on-chain by transaction hash' })
  @ApiResponse({
    status: 200,
    description: 'Verification result',
    schema: { example: { valid: true, txHash: 'abc123' } },
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  verify(@Param('txHash') txHash: string) {
    return this.credentialsService.verify(txHash);
  }

  @Post('issue')
  @UseGuards(AuthGuard(['jwt', 'api-key']), RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Admin: manually issue a credential' })
  @ApiBody({
    schema: { example: { userId: 'uuid', courseId: 'uuid', stellarPublicKey: 'GABC...' } },
  })
  @ApiResponse({
    status: 201,
    description: 'Credential issued',
    schema: { example: { id: 'uuid', txHash: 'abc123' } },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  issue(@Body() body: { userId: string; courseId: string; stellarPublicKey: string }) {
    return this.credentialsService.issue(body.userId, body.courseId, body.stellarPublicKey);
  }
}
