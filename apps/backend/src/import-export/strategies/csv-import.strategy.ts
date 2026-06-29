import { BadRequestException, Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { parse as parseCsv } from 'csv-parse/sync';
import { Course } from '../../courses/course.entity';
import { CourseModule } from '../../courses/course-module.entity';
import { Lesson } from '../../courses/lesson.entity';
import { CourseJsonExport } from '../import-export.types';
import { ImportStrategy } from './import-strategy.interface';

@Injectable()
export class CsvImportStrategy implements ImportStrategy {
  constructor(
    private readonly courseRepo: Repository<Course>,
    private readonly moduleRepo: Repository<CourseModule>,
    private readonly lessonRepo: Repository<Lesson>
  ) {}

  canHandle(mimeType: string): boolean {
    return mimeType === 'text/csv' || mimeType === 'application/csv' || mimeType.endsWith('.csv');
  }

  async import(file: Buffer, userId: string): Promise<{ courseId: string }> {
    let rows: Record<string, string>[];
    try {
      rows = parseCsv(file, { columns: true, skip_empty_lines: true, trim: true });
    } catch {
      throw new BadRequestException('Invalid CSV file');
    }
    if (!rows.length) throw new BadRequestException('CSV file is empty');

    const first = rows[0];
    if (!first['course_title']) throw new BadRequestException('Missing required CSV column: course_title');
    if (!first['course_description']) throw new BadRequestException('Missing required CSV column: course_description');

    const modulesMap = new Map<string, { title: string; order: number; lessons: CourseJsonExport['course']['modules'][0]['lessons'] }>();

    for (const row of rows) {
      const moduleKey = `${row['module_order'] ?? '0'}:${row['module_title'] ?? 'Module'}`;
      if (!modulesMap.has(moduleKey)) {
        modulesMap.set(moduleKey, {
          title: row['module_title'] || 'Module',
          order: parseInt(row['module_order'] || '0', 10),
          lessons: [],
        });
      }
      if (row['lesson_title']) {
        modulesMap.get(moduleKey)!.lessons.push({
          title: row['lesson_title'],
          content: row['lesson_content'] || '',
          videoUrl: row['lesson_video_url'] || undefined,
          order: parseInt(row['lesson_order'] || '0', 10),
          durationMinutes: parseInt(row['lesson_duration_minutes'] || '0', 10),
        });
      }
    }

    const payload: CourseJsonExport = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      course: {
        title: first['course_title'],
        description: first['course_description'],
        level: first['course_level'] || 'beginner',
        durationHours: parseInt(first['course_duration_hours'] || '0', 10),
        requiresKyc: first['requires_kyc'] === 'true',
        modules: Array.from(modulesMap.values()).sort((a, b) => a.order - b.order),
      },
    };

    return this.importCoursePayload(payload, userId);
  }

  private async importCoursePayload(payload: CourseJsonExport, userId: string): Promise<{ courseId: string }> {
    const course = await this.courseRepo.save(
      this.courseRepo.create({
        title: payload.course.title,
        description: payload.course.description,
        level: payload.course.level,
        durationHours: payload.course.durationHours,
        requiresKyc: payload.course.requiresKyc ?? false,
        instructorId: userId,
        isPublished: false,
      })
    );

    for (const mod of payload.course.modules ?? []) {
      const savedModule = await this.moduleRepo.save(
        this.moduleRepo.create({ courseId: course.id, title: mod.title, order: mod.order })
      );
      for (const lesson of mod.lessons ?? []) {
        await this.lessonRepo.save(
          this.lessonRepo.create({
            moduleId: savedModule.id,
            title: lesson.title,
            content: lesson.content,
            videoUrl: lesson.videoUrl ?? undefined,
            order: lesson.order,
            durationMinutes: lesson.durationMinutes,
          })
        );
      }
    }

    return { courseId: course.id };
  }
}
