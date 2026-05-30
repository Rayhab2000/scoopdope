import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Enrollment } from './enrollment.entity';
import { PrerequisitesService } from '../courses/prerequisites.service';
import { CourseVersioningService } from '../courses/course-versioning.service';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class EnrollmentsService {
  constructor(
    @InjectRepository(Enrollment)
    private repo: Repository<Enrollment>,
    private eventEmitter: EventEmitter2,
    private prereqService: PrerequisitesService,
    private versioningService: CourseVersioningService,
    private metrics: MetricsService,
  ) {}

  async enroll(userId: string, courseId: string, adminOverride = false): Promise<Enrollment> {
    const existing = await this.repo.findOne({ where: { userId, courseId } });
    if (existing) throw new ConflictException('Already enrolled in this course');

    await this.prereqService.enforcePrerequisites(userId, courseId, adminOverride);

    // Pin the student to the latest published version at enrollment time
    const versions = await this.versioningService.listVersions(courseId);
    const latestVersion = versions[0] ?? null;

    const enrollment = await this.repo.save(
      this.repo.create({
        userId,
        courseId,
        enrolledVersionNumber: latestVersion?.versionNumber ?? null,
      }),
    );

    this.eventEmitter.emit('enrollment.created', {
      enrollmentId: enrollment.id,
      userId,
      courseId,
      enrolledAt: enrollment.enrolledAt,
    });

    this.metrics.incrementEnrollment(courseId, 'all');

    return enrollment;
  }

  async unenroll(userId: string, courseId: string): Promise<void> {
    const enrollment = await this.repo.findOne({ where: { userId, courseId } });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    await this.repo.remove(enrollment);

    // Notify waitlist system that a spot has opened
    this.eventEmitter.emit('enrollment.removed', { userId, courseId });
  }

  findByUser(userId: string): Promise<Enrollment[]> {
    return this.repo.find({
      where: { userId },
      relations: ['course'],
      order: { enrolledAt: 'DESC' },
    });
  }

  /** Upgrade a student's pinned version to the latest available version. */
  async upgradeVersion(userId: string, courseId: string): Promise<Enrollment> {
    const enrollment = await this.repo.findOne({ where: { userId, courseId } });
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    const versions = await this.versioningService.listVersions(courseId);
    const latestVersion = versions[0];
    if (!latestVersion) throw new NotFoundException('No versions found for this course');

    enrollment.enrolledVersionNumber = latestVersion.versionNumber;
    return this.repo.save(enrollment);
  }
}
