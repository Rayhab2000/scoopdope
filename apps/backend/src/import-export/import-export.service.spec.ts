import { Repository } from 'typeorm';
import { ImportExportService } from './import-export.service';
import { ImportStrategy } from './strategies/import-strategy.interface';
import { Course } from '../courses/course.entity';
import { CourseModule } from '../courses/course-module.entity';
import { Lesson } from '../courses/lesson.entity';
import { ImportJob } from './import-job.entity';

describe('ImportExportService', () => {
  let service: ImportExportService;
  let jsonStrategy: jest.Mocked<ImportStrategy>;
  let csvStrategy: jest.Mocked<ImportStrategy>;
  let scormStrategy: jest.Mocked<ImportStrategy>;

  beforeEach(() => {
    jsonStrategy = {
      canHandle: jest.fn().mockImplementation((mimeType: string) => mimeType === 'application/json'),
      import: jest.fn().mockResolvedValue({ courseId: 'json-course' }),
    };
    csvStrategy = {
      canHandle: jest.fn().mockImplementation((mimeType: string) => mimeType === 'text/csv'),
      import: jest.fn().mockResolvedValue({ courseId: 'csv-course' }),
    };
    scormStrategy = {
      canHandle: jest.fn().mockImplementation((mimeType: string) => mimeType === 'application/zip'),
      import: jest.fn().mockResolvedValue({ courseId: 'scorm-course' }),
    };

    service = new ImportExportService(
      {} as Repository<Course>,
      {} as Repository<CourseModule>,
      {} as Repository<Lesson>,
      {} as Repository<ImportJob>,
      [jsonStrategy, csvStrategy, scormStrategy]
    );
  });

  it('delegates JSON imports to the JSON strategy', async () => {
    const buffer = Buffer.from('{"course":{"title":"Demo"}}');

    await expect(service.importJson(buffer, 'user-1')).resolves.toEqual({ courseId: 'json-course' });
    expect(jsonStrategy.import).toHaveBeenCalledWith(buffer, 'user-1');
  });

  it('delegates CSV imports to the CSV strategy', async () => {
    const buffer = Buffer.from('course_title,course_description\nDemo,Test');

    await expect(service.importCsv(buffer, 'user-2')).resolves.toEqual({ courseId: 'csv-course' });
    expect(csvStrategy.import).toHaveBeenCalledWith(buffer, 'user-2');
  });

  it('delegates SCORM imports to the SCORM strategy', async () => {
    const buffer = Buffer.from('zip');

    await expect(service.importScorm(buffer, 'user-3')).resolves.toEqual({ courseId: 'scorm-course' });
    expect(scormStrategy.import).toHaveBeenCalledWith(buffer, 'user-3');
  });
});
