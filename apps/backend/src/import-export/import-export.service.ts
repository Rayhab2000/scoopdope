import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from '../courses/course.entity';
import { CourseModule } from '../courses/course-module.entity';
import { Lesson } from '../courses/lesson.entity';
import { ImportJob, ImportJobStatus } from './import-job.entity';
import { CourseJsonExport } from './import-export.types';
import { ImportStrategy } from './strategies/import-strategy.interface';

@Injectable()
export class ImportExportService {
  private readonly logger = new Logger(ImportExportService.name);

  constructor(
    @InjectRepository(Course) private readonly courseRepo: Repository<Course>,
    @InjectRepository(CourseModule) private readonly moduleRepo: Repository<CourseModule>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(ImportJob) private readonly jobRepo: Repository<ImportJob>,
    @Inject('IMPORT_STRATEGIES') private readonly strategies: ImportStrategy[]
  ) {}

  // ─── Export ────────────────────────────────────────────────────────────────

  async exportCourse(courseId: string): Promise<CourseJsonExport> {
    const course = await this.courseRepo.findOne({
      where: { id: courseId, isDeleted: false },
      relations: ['modules', 'modules.lessons'],
    });
    if (!course) throw new NotFoundException('Course not found');

    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      course: {
        title: course.title,
        description: course.description,
        level: course.level,
        durationHours: course.durationHours,
        requiresKyc: course.requiresKyc,
        modules: (course.modules ?? [])
          .sort((a, b) => a.order - b.order)
          .map((m) => ({
            title: m.title,
            order: m.order,
            lessons: (m.lessons ?? [])
              .sort((a, b) => a.order - b.order)
              .map((l) => ({
                title: l.title,
                content: l.content,
                videoUrl: l.videoUrl ?? undefined,
                order: l.order,
                durationMinutes: l.durationMinutes,
              })),
          })),
      },
    };
  }

  async importJson(buffer: Buffer, instructorId: string): Promise<{ courseId: string }> {
    return this.importWithStrategy(buffer, 'application/json', instructorId);
  }

  async importCsv(buffer: Buffer, instructorId: string): Promise<{ courseId: string }> {
    return this.importWithStrategy(buffer, 'text/csv', instructorId);
  }

  async importScorm(buffer: Buffer, instructorId: string): Promise<{ courseId: string }> {
    return this.importWithStrategy(buffer, 'application/zip', instructorId);
  }

  async startBulkImport(
    buffers: { name: string; data: Buffer }[],
    instructorId: string
  ): Promise<ImportJob> {
    const job = await this.jobRepo.save(
      this.jobRepo.create({
        instructorId,
        status: ImportJobStatus.PENDING,
        total: buffers.length,
        processed: 0,
      })
    );

    this.processBulk(job.id, buffers, instructorId).catch((err) =>
      this.logger.error(`Bulk import job ${job.id} failed: ${err}`)
    );

    return job;
  }

  async getJobStatus(jobId: string): Promise<ImportJob> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Import job not found');
    return job;
  }

  private async importWithStrategy(
    buffer: Buffer,
    mimeType: string,
    instructorId: string
  ): Promise<{ courseId: string }> {
    const strategy = this.getStrategy(mimeType);
    return strategy.import(buffer, instructorId);
  }

  private getStrategy(mimeType: string): ImportStrategy {
    const strategy = this.strategies.find((candidate) => candidate.canHandle(mimeType));
    if (!strategy) throw new BadRequestException(`Unsupported import format: ${mimeType}`);
    return strategy;
  }

  private async processBulk(
    jobId: string,
    buffers: { name: string; data: Buffer }[],
    instructorId: string
  ) {
    await this.jobRepo.update(jobId, { status: ImportJobStatus.PROCESSING });
    const results: Record<string, unknown> = {};
    let processed = 0;

    for (const { name, data } of buffers) {
      try {
        const mimeType = this.resolveMimeType(name);
        const res = await this.importWithStrategy(data, mimeType, instructorId);
        results[name] = { success: true, courseId: res.courseId };
      } catch (err: unknown) {
        results[name] = { success: false, error: err instanceof Error ? err.message : String(err) };
      }
      processed++;
      await this.jobRepo.update(jobId, { processed });
    }

    await this.jobRepo
      .createQueryBuilder()
      .update(ImportJob)
      .set({ status: ImportJobStatus.DONE, result: () => `:result` })
      .where('id = :id', { id: jobId })
      .setParameter('result', JSON.stringify(results))
      .execute();
  }

  private resolveMimeType(fileName: string): string {
    const normalized = fileName.toLowerCase();
    if (normalized.endsWith('.zip')) return 'application/zip';
    if (normalized.endsWith('.csv')) return 'text/csv';
    return 'application/json';
  }
}
