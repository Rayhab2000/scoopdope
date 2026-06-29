import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { Course } from '../courses/course.entity';
import { CourseModule } from '../courses/course-module.entity';
import { Lesson } from '../courses/lesson.entity';
import { ImportJob } from './import-job.entity';
import { ImportExportService } from './import-export.service';
import { ImportExportController } from './import-export.controller';
import { JsonImportStrategy } from './strategies/json-import.strategy';
import { CsvImportStrategy } from './strategies/csv-import.strategy';
import { ScormImportStrategy } from './strategies/scorm-import.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([Course, CourseModule, Lesson, ImportJob]),
    MulterModule.register({ storage: undefined }), // use memory storage (buffer)
  ],
  providers: [
    ImportExportService,
    JsonImportStrategy,
    CsvImportStrategy,
    ScormImportStrategy,
    {
      provide: 'IMPORT_STRATEGIES',
      useFactory: (jsonStrategy: JsonImportStrategy, csvStrategy: CsvImportStrategy, scormStrategy: ScormImportStrategy) => [
        jsonStrategy,
        csvStrategy,
        scormStrategy,
      ],
      inject: [JsonImportStrategy, CsvImportStrategy, ScormImportStrategy],
    },
  ],
  controllers: [ImportExportController],
})
export class ImportExportModule {}
