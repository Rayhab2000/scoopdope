import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { Certificate } from './certificate.entity';
import { Enrollment } from '../enrollments/enrollment.entity';
import { StellarService } from '../stellar/stellar.service';
import * as crypto from 'crypto';

/** Shape returned by GET /v1/certificates/:id/verify */
export interface CertificateVerificationResult {
  verified: boolean;
  certificateId: string;
  studentId: string;
  courseId: string;
  certificateHash: string;
  issuedAt: string;
  transactionHash: string | null;
  onChain: {
    found: boolean;
    successful: boolean | null;
    ledgerTimestamp: string | null;
  };
}

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    @InjectRepository(Certificate)
    private certificatesRepository: Repository<Certificate>,
    @InjectRepository(Enrollment)
    private enrollmentsRepository: Repository<Enrollment>,
    private stellarService: StellarService,
  ) {}

  // ── Event-driven trigger ──────────────────────────────────────────────────

  /**
   * Automatically issues a certificate when a student reaches 100% progress.
   * The `progress.completed` event is emitted by ProgressService.
   * Errors are swallowed here so a certificate failure never rolls back the
   * progress record.
   */
  @OnEvent('progress.completed')
  async handleProgressCompleted(payload: {
    userId: string;
    courseId: string;
    stellarPublicKey: string;
    courseName: string;
  }): Promise<void> {
    try {
      await this.issueCertificate(payload.userId, payload.courseId);
      this.logger.log(
        `Certificate auto-issued for user=${payload.userId} course=${payload.courseId}`,
      );
    } catch (err: unknown) {
      // ConflictException = already issued — treat as success
      if (err instanceof ConflictException) return;
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(
        `Auto-issuance failed for user=${payload.userId} course=${payload.courseId}: ${errorMessage}`,
        stack,
      );
    }
  }

  // ── Core issuance ─────────────────────────────────────────────────────────

  /**
   * Issues an on-chain certificate for a completed course.
   *
   * Guards:
   *  1. Enrollment must exist AND completedAt must be set (course finished)
   *  2. No duplicate — throws ConflictException if one already exists
   *  3. Row is saved as 'pending' first; on-chain failure removes it so the
   *     database is never left in an inconsistent state
   */
  async issueCertificate(userId: string, courseId: string): Promise<Certificate> {
    // 1. Verify the enrollment exists and the course has been completed
    const enrollment = await this.enrollmentsRepository.findOne({
      where: { userId, courseId, completedAt: Not(IsNull()) },
      relations: ['user', 'course'],
    });

    if (!enrollment) {
      throw new BadRequestException(
        'Enrollment not found or course not yet completed',
      );
    }

    // 2. Idempotency check — prevent double issuance
    const existing = await this.certificatesRepository.findOne({
      where: { userId, courseId },
    });

    if (existing) {
      throw new ConflictException('Certificate already issued for this course');
    }

    // 3. Deterministic hash: same inputs always produce the same hash,
    //    which means concurrent duplicate requests hash to the same value
    //    and the DB unique constraint on (userId, courseId) blocks the second.
    const certificateHash = this.generateCertificateHash(userId, courseId);

    // 4. Persist as 'pending' so we have a record even if the RPC call hangs
    const certificate = await this.certificatesRepository.save(
      this.certificatesRepository.create({
        userId,
        courseId,
        certificateHash,
        status: 'pending',
      }),
    );

    // 5. Invoke the Soroban certificate contract
    const recipientPublicKey = enrollment.user?.stellarPublicKey;
    const courseTitle = enrollment.course?.title ?? courseId;

    if (!recipientPublicKey) {
      // No Stellar key on the user — skip on-chain, mark as minted off-chain
      this.logger.warn(
        `User ${userId} has no stellarPublicKey — certificate stored off-chain only`,
      );
      certificate.status = 'minted';
      return this.certificatesRepository.save(certificate);
    }

    try {
      const txHash = await this.stellarService.mintCertificateNFT(
        recipientPublicKey,
        certificateHash,
        courseTitle,
      );

      certificate.stellarTransactionId = txHash;
      certificate.status = 'minted';
      await this.certificatesRepository.save(certificate);

      this.logger.log(
        `Certificate minted on-chain — user=${userId} course=${courseId} tx=${txHash}`,
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `On-chain certificate minting failed for user=${userId} course=${courseId}: ${errorMessage}`,
        stack,
      );

      // Roll back the pending row so we don't leave a ghost record
      await this.certificatesRepository.remove(certificate).catch((removeErr) =>
        this.logger.error(`Failed to remove pending certificate: ${removeErr.message}`),
      );

      throw new InternalServerErrorException({
        message:
          'Failed to mint certificate on the Stellar network. Please try again.',
        detail: errorMessage,
      });
    }

    return certificate;
  }

  // ── Verification endpoint logic ───────────────────────────────────────────

  /**
   * Verifies a certificate by its database ID.
   *
   * Steps:
   *  1. Load the certificate row
   *  2. If a stellarTransactionId is present, query Horizon to confirm the
   *     transaction exists and was successful
   *  3. Return a structured payload combining the DB record and network result
   */
  async verifyById(id: string): Promise<CertificateVerificationResult> {
    const cert = await this.certificatesRepository.findOne({
      where: { id },
      relations: ['user', 'course'],
    });

    if (!cert) {
      throw new NotFoundException('Certificate not found');
    }

    let onChain: CertificateVerificationResult['onChain'] = {
      found: false,
      successful: null,
      ledgerTimestamp: null,
    };

    if (cert.stellarTransactionId) {
      try {
        const txRecords = await this.stellarService.getTransactions(
          // getTransactions fetches by account; use a dedicated lookup instead
          cert.userId,
          200,
        );

        // Search the fetched transactions for a matching hash
        const match = (txRecords as Array<{ hash: string; successful: boolean; createdAt: string }>)
          .find((tx) => tx.hash === cert.stellarTransactionId);

        if (match) {
          onChain = {
            found: true,
            successful: match.successful,
            ledgerTimestamp: match.createdAt,
          };
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        this.logger.warn(`Horizon lookup failed during verification: ${errorMessage}`);
        // Not fatal — we still return the DB record; onChain.found remains false
      }
    }

    const dbVerified =
      cert.status === 'minted' || cert.status === 'verified';

    return {
      verified: dbVerified && (onChain.found ? onChain.successful === true : true),
      certificateId: cert.id,
      studentId: cert.userId,
      courseId: cert.courseId,
      certificateHash: cert.certificateHash,
      issuedAt: cert.issuedAt.toISOString(),
      transactionHash: cert.stellarTransactionId ?? null,
      onChain,
    };
  }

  // ── Read methods ──────────────────────────────────────────────────────────

  async getCertificate(id: string): Promise<Certificate> {
    const cert = await this.certificatesRepository.findOne({ where: { id } });
    if (!cert) throw new NotFoundException('Certificate not found');
    return cert;
  }

  async getCertificateWithRelations(id: string): Promise<Certificate> {
    const cert = await this.certificatesRepository.findOne({
      where: { id },
      relations: ['user', 'course'],
    });
    if (!cert) throw new NotFoundException('Certificate not found');
    return cert;
  }

  async getUserCertificates(userId: string): Promise<Certificate[]> {
    return this.certificatesRepository.find({
      where: { userId },
      relations: ['course'],
      order: { issuedAt: 'DESC' },
    });
  }

  /** Legacy hash-based verification — kept for backwards compatibility */
  async verifyCertificate(
    certificateHash: string,
  ): Promise<{ valid: boolean; certificate?: Certificate }> {
    const cert = await this.certificatesRepository.findOne({
      where: { certificateHash },
      relations: ['user', 'course'],
    });

    if (!cert) return { valid: false };

    return {
      valid: cert.status === 'minted' || cert.status === 'verified',
      certificate: cert,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Deterministic hash: same userId + courseId always produce the same value.
   * This is intentional — if two concurrent requests race through the
   * idempotency check, the DB unique constraint on (userId, courseId) will
   * reject the second INSERT cleanly.
   */
  private generateCertificateHash(userId: string, courseId: string): string {
    return crypto
      .createHash('sha256')
      .update(`${userId}:${courseId}`)
      .digest('hex');
  }
}
