import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { Lesson } from './lesson.entity';
import { SearchService } from '../search/search.service';
import { TranscribeService } from './transcribe.service';
import { Interval } from '@nestjs/schedule';

@Injectable()
export class LessonsService {
  private readonly logger = new Logger(LessonsService.name);

  constructor(
    @InjectRepository(Lesson) private repo: Repository<Lesson>,
    private readonly searchService: SearchService,
    private readonly transcribeService: TranscribeService,
  ) {}

  findByModule(moduleId: string) {
    return this.repo.find({ where: { moduleId }, order: { order: 'ASC' } });
  }

  findOne(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  async create(moduleId: string, data: Partial<Lesson>) {
    const lesson = await this.repo.save(this.repo.create({ ...data, moduleId }));
    await this.searchService.indexLesson(lesson).catch(() => {});
    
    if (lesson.videoUrl) {
      this.triggerTranscription(lesson);
    }
    
    return lesson;
  }

  async update(id: string, data: Partial<Lesson>) {
    const lesson = await this.findOne(id);
    if (!lesson) throw new NotFoundException('Lesson not found');
    
    const oldVideoUrl = lesson.videoUrl;
    const updated = await this.repo.save({ ...lesson, ...data });
    await this.searchService.indexLesson(updated).catch(() => {});
    
    if (updated.videoUrl && updated.videoUrl !== oldVideoUrl) {
      this.triggerTranscription(updated);
    }
    
    return updated;
  }

  private async triggerTranscription(lesson: Lesson) {
    try {
      const jobName = await this.transcribeService.startTranscription(lesson.id, lesson.videoUrl);
      await this.repo.update(lesson.id, { transcriptionJobName: jobName });
    } catch (error) {
      this.logger.error(`Failed to trigger transcription for lesson ${lesson.id}: ${error.message}`);
    }
  }

  @Interval(60000) // Every 1 minute
  async checkTranscriptionJobs() {
    const lessons = await this.repo.find({
      where: {
        transcriptionJobName: Not(IsNull()),
        transcript: IsNull(),
      },
    });

    for (const lesson of lessons) {
      try {
        const result = await this.transcribeService.getTranscriptionResult(lesson.transcriptionJobName);
        if (result && typeof result !== 'string') {
          // COMPLETED
          const srt = this.transcribeService.convertToSrt(result);
          await this.repo.update(lesson.id, {
            transcript: result,
            transcriptSrt: srt,
          });
          this.logger.log(`Transcription completed for lesson ${lesson.id}`);
        }
      } catch (error) {
        this.logger.error(`Error checking transcription for lesson ${lesson.id}: ${error.message}`);
      }
    }
  }

  async remove(id: string) {
    const lesson = await this.findOne(id);
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.searchService.deleteFromIndex('lessons', id).catch(() => {});
    return this.repo.remove(lesson);
  }
}
