import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  Body,
  Header,
  StreamableFile,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { CertificatesService, CertificateVerificationResult } from './certificates.service';
import { CertificatePdfService } from './certificate-pdf.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';

@ApiTags('certificates')
@Controller('v1/certificates')
export class CertificatesController {
  constructor(
    private certificatesService: CertificatesService,
    private certificatePdfService: CertificatePdfService,
    private configService: ConfigService,
  ) {}

  // ── Manual issuance (admin / instructor trigger) ──────────────────────────

  @Post(':userId/:courseId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually issue a certificate for a completed course' })
  @ApiParam({ name: 'userId', description: 'UUID of the student' })
  @ApiParam({ name: 'courseId', description: 'UUID of the completed course' })
  @ApiResponse({ status: 201, description: 'Certificate issued successfully' })
  @ApiResponse({ status: 400, description: 'Enrollment not found or course not completed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 409, description: 'Certificate already issued' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'On-chain minting failed' })
  async issueCertificate(
    @Param('userId') userId: string,
    @Param('courseId') courseId: string,
    @Request() req: { user: { id: string; role: string } },
  ) {
    // Only allow admins or the student themselves to trigger manual issuance
    if (req.user.id !== userId && req.user.role !== 'admin') {
      throw new ForbiddenException('You can only issue certificates for your own account');
    }
    return this.certificatesService.issueCertificate(userId, courseId);
  }

  // ── Public verification ───────────────────────────────────────────────────

  /**
   * Public endpoint — no authentication required.
   *
   * Fetches the certificate by ID, cross-checks the stored transaction hash
   * against the Stellar network, and returns a structured verification payload.
   *
   * Example response:
   * {
   *   "verified": true,
   *   "certificateId": "uuid",
   *   "studentId": "uuid",
   *   "courseId": "uuid",
   *   "certificateHash": "sha256hex",
   *   "issuedAt": "2026-06-02T10:00:00.000Z",
   *   "transactionHash": "abc123...",
   *   "onChain": {
   *     "found": true,
   *     "successful": true,
   *     "ledgerTimestamp": "2026-06-02T10:00:01Z"
   *   }
   * }
   */
  @Get(':id/verify')
  @ApiOperation({
    summary: 'Publicly verify a certificate against the Stellar ledger',
    description:
      'Returns the certificate record cross-checked with the on-chain transaction. ' +
      'No authentication required — safe to embed in QR codes.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the certificate to verify' })
  @ApiResponse({
    status: 200,
    description: 'Verification result',
    schema: {
      example: {
        verified: true,
        certificateId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        studentId: 'user-uuid',
        courseId: 'course-uuid',
        certificateHash: 'abc123def456...',
        issuedAt: '2026-06-02T10:00:00.000Z',
        transactionHash: 'abcdef1234567890...',
        onChain: {
          found: true,
          successful: true,
          ledgerTimestamp: '2026-06-02T10:00:01Z',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Certificate not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async verify(@Param('id') id: string): Promise<CertificateVerificationResult> {
    return this.certificatesService.verifyById(id);
  }

  // ── Authenticated read endpoints ──────────────────────────────────────────

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all certificates for a user' })
  @ApiResponse({ status: 200, description: 'List of certificates' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getUserCertificates(@Param('userId') userId: string) {
    return this.certificatesService.getUserCertificates(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a certificate by ID' })
  @ApiResponse({ status: 200, description: 'Certificate record' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Certificate not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getCertificate(@Param('id') id: string) {
    return this.certificatesService.getCertificate(id);
  }

  // ── Legacy hash verification ──────────────────────────────────────────────

  @Post('verify')
  @ApiOperation({ summary: 'Verify a certificate by its SHA-256 hash (legacy)' })
  @ApiResponse({ status: 200, description: 'Verification result' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async verifyCertificate(@Body() body: { certificateHash: string }) {
    return this.certificatesService.verifyCertificate(body.certificateHash);
  }

  // ── PDF download ──────────────────────────────────────────────────────────

  @Get(':id/pdf')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Header('Content-Type', 'application/pdf')
  @ApiOperation({ summary: 'Download a certificate as a branded PDF with QR code' })
  @ApiResponse({ status: 200, description: 'PDF certificate binary' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Certificate not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async downloadPdf(@Param('id') id: string): Promise<StreamableFile> {
    const certificate = await this.certificatesService.getCertificateWithRelations(id);
    const baseUrl = this.configService.get<string>('frontend.url') ?? 'http://localhost:3000';
    const pdf = await this.certificatePdfService.generateCertificatePdf(certificate, baseUrl);
    return new StreamableFile(pdf, {
      disposition: `attachment; filename="certificate-${id}.pdf"`,
      type: 'application/pdf',
    });
  }
}
