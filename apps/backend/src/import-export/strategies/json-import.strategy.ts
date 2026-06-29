import { BadRequestException, Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Course } from '../../courses/course.entity';
import { CourseModule } from '../../courses/course-module.entity';
import { Lesson } from '../../courses/lesson.entity';
import { CourseJsonExport } from '../import-export.types';
import { ImportStrategy } from './import-strategy.interface';

@Injectable()
export class JsonImportStrategy implements ImportStrategy {
  constructor(
    private readonly courseRepo: Repository<Course>,
    private readonly moduleRepo: Repository<CourseModule>,
    private readonly lessonRepo: Repository<Lesson>
  ) {}

  canHandle(mimeType: string): boolean {
    return mimeType === 'application/json' || mimeType === 'application/x-json' || mimeType.endsWith('+json');
  }

  async import(file: Buffer, userId: string): Promise<{ courseId: string }> {
    let payload: CourseJsonExport;
    try {
      payload = JSON.parse(file.toString('utf-8'));
    } catch {
      throw new BadRequestException('Invalid JSON file');
    }
    this.validateJsonPayload(payload);
    const courseId = await this.persistCourse(payload.course, userId);
    return { courseId };
  }

  private async persistCourse(data: CourseJsonExport['course'], instructorId: string): Promise<string> {
    const course = await this.courseRepo.save(
      this.courseRepo.create({
        title: data.title,
        description: data.description,
        level: data.level,
        durationHours: data.durationHours,
        requiresKyc: data.requiresKyc ?? false,
        instructorId,
        isPublished: false,
      })
    );

    for (const mod of data.modules ?? []) {
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

    return course.id;
  }

  private validateJsonPayload(payload: unknown): asserts payload is CourseJsonExport {
    const p = payload as CourseJsonExport;
    if (!p?.course?.title) throw new BadRequestException('Missing required field: course.title');
    if (!p.course.description) throw new BadRequestException('Missing required field: course.description');
    if (!Array.isArray(p.course.modules)) throw new BadRequestException('course.modules must be an array');
    for (const mod of p.course.modules) {
      if (!mod.title) throw new BadRequestException('Each module must have a title');
      if (!Array.isArray(mod.lessons)) throw new BadRequestException('Each module must have a lessons array');
      for (const lesson of mod.lessons) {
        if (!lesson.title) throw new BadRequestException('Each lesson must have a title');
        if (lesson.content === undefined) throw new BadRequestException('Each lesson must have content');
      }
    }
  }
}
