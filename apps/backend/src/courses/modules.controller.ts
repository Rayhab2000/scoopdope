import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, Res, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ModulesService } from './modules.service';
import { LessonsService } from './lessons.service';
import { TranscribeService } from './transcribe.service';
import { CreateModuleDto } from './dto/create-module.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';

@ApiTags('modules')
@Controller()
export class ModulesController {
  constructor(
    private modulesService: ModulesService,
    private lessonsService: LessonsService,
    private transcribeService: TranscribeService,
  ) {}

  // ── Modules ──────────────────────────────────────────────────────────────

  @Get('courses/:courseId/modules')
  @ApiOperation({ summary: 'Get all modules for a course' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({
    status: 200,
    description: 'List of modules',
    schema: { example: [{ id: 'uuid', title: 'Module 1', order: 1 }] },
  })
  @ApiResponse({ status: 404, description: 'Course not found' })
  getModules(@Param('courseId') courseId: string) {
    return this.modulesService.findByCourse(courseId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('instructor', 'admin')
  @Post('courses/:courseId/modules')
  @ApiOperation({ summary: 'Create a module in a course' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiBody({ schema: { example: { title: 'Module 1', description: 'Intro module', order: 1 } } })
  @ApiResponse({
    status: 201,
    description: 'Module created',
    schema: { example: { id: 'uuid', title: 'Module 1' } },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  createModule(@Param('courseId') courseId: string, @Body() dto: CreateModuleDto) {
    return this.modulesService.create(courseId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('instructor', 'admin')
  @Patch('modules/:id')
  @ApiOperation({ summary: 'Update a module' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiBody({ schema: { example: { title: 'Updated title', order: 2 } } })
  @ApiResponse({ status: 200, description: 'Module updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Module not found' })
  updateModule(@Param('id') id: string, @Body() dto: Partial<CreateModuleDto>) {
    return this.modulesService.update(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('instructor', 'admin')
  @Delete('modules/:id')
  @ApiOperation({ summary: 'Delete a module' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 200, description: 'Module deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Module not found' })
  deleteModule(@Param('id') id: string) {
    return this.modulesService.remove(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('modules/:id/unlock')
  @ApiOperation({ summary: 'Admin override: unlock a module immediately by clearing its release date' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 200, description: 'Module unlocked', schema: { example: { id: 'uuid', title: 'Module 1', isLocked: false } } })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Module not found' })
  unlockModule(@Param('id') id: string) {
    return this.modulesService.unlockNow(id);
  }

  // ── Lessons ───────────────────────────────────────────────────────────────

  @Get('modules/:moduleId/lessons')
  @ApiOperation({ summary: 'Get all lessons for a module' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({
    status: 200,
    description: 'List of lessons',
    schema: { example: [{ id: 'uuid', title: 'Lesson 1', order: 1 }] },
  })
  @ApiResponse({ status: 404, description: 'Module not found' })
  getLessons(@Param('moduleId') moduleId: string) {
    return this.lessonsService.findByModule(moduleId);
  }

  @Get('lessons/:id')
  @ApiOperation({ summary: 'Get a lesson by id' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 200, description: 'Lesson found' })
  @ApiResponse({ status: 404, description: 'Lesson not found' })
  getLesson(@Param('id') id: string) {
    return this.lessonsService.findOne(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('instructor', 'admin')
  @Post('modules/:moduleId/lessons')
  @ApiOperation({ summary: 'Create a lesson in a module' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiBody({ schema: { example: { title: 'Lesson 1', content: 'Content here', order: 1 } } })
  @ApiResponse({
    status: 201,
    description: 'Lesson created',
    schema: { example: { id: 'uuid', title: 'Lesson 1' } },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  createLesson(@Param('moduleId') moduleId: string, @Body() dto: CreateLessonDto) {
    return this.lessonsService.create(moduleId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('instructor', 'admin')
  @Patch('lessons/:id')
  @ApiOperation({ summary: 'Update a lesson' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiBody({ schema: { example: { title: 'Updated title', content: 'New content' } } })
  @ApiResponse({ status: 200, description: 'Lesson updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Lesson not found' })
  updateLesson(@Param('id') id: string, @Body() dto: Partial<CreateLessonDto>) {
    return this.lessonsService.update(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('instructor', 'admin')
  @Delete('lessons/:id')
  @ApiOperation({ summary: 'Delete a lesson' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 200, description: 'Lesson deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Lesson not found' })
  deleteLesson(@Param('id') id: string) {
    return this.lessonsService.remove(id);
  }

  @Get('lessons/:id/transcript/srt')
  @ApiOperation({ summary: 'Download lesson transcript as SRT' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async downloadSrt(@Param('id') id: string, @Res() res: Response) {
    const lesson = await this.lessonsService.findOne(id);
    if (!lesson || !lesson.transcriptSrt) throw new NotFoundException('Transcript not found');
    
    res.set({
      'Content-Type': 'text/plain',
      'Content-Disposition': `attachment; filename="lesson-${id}.srt"`,
    });
    res.send(lesson.transcriptSrt);
  }

  @Get('lessons/:id/transcript/pdf')
  @ApiOperation({ summary: 'Download lesson transcript as PDF' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    const lesson = await this.lessonsService.findOne(id);
    if (!lesson || !lesson.transcript) throw new NotFoundException('Transcript not found');
    
    const pdfBuffer = this.transcribeService.generateTranscriptPdf(lesson);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="lesson-${id}.pdf"`,
    });
    res.send(pdfBuffer);
  }
}
