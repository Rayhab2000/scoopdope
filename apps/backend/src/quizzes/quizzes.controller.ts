import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { QuizzesService } from './quizzes.service';

@Controller('v1/quizzes')
@UseGuards(JwtAuthGuard)
export class QuizzesController {
  constructor(private quizzesService: QuizzesService) {}

  @Post(':lessonId')
  async createQuiz(@Param('lessonId') lessonId: string, @Body() data: any) {
    return this.quizzesService.createQuiz(lessonId, data);
  }

  @Get(':id')
  async getQuiz(@Param('id') id: string) {
    return this.quizzesService.getQuiz(id);
  }

  @Post(':quizId/questions')
  async addQuestion(@Param('quizId') quizId: string, @Body() data: any) {
    return this.quizzesService.addQuestion(quizId, data);
  }

  @Post('questions/:questionId/answers')
  async addAnswer(@Param('questionId') questionId: string, @Body() data: any) {
    return this.quizzesService.addAnswer(questionId, data);
  }

  @Post(':quizId/submit')
  async submitAttempt(
    @Param('quizId') quizId: string,
    @Body() data: any,
    @CurrentUser() user: any,
  ) {
    return this.quizzesService.submitAttempt(quizId, user.id, data.answers);
  }

  @Post(':attemptId/grade')
  async gradeEssay(
    @Param('attemptId') attemptId: string,
    @Body() data: any,
  ) {
    return this.quizzesService.gradeEssay(
      attemptId,
      data.questionId,
      data.points,
      data.feedback,
    );
  }

  @Get(':quizId/attempts')
  async getAttempts(@Param('quizId') quizId: string, @CurrentUser() user: any) {
    return this.quizzesService.getAttempts(quizId, user.id);
  }
}
