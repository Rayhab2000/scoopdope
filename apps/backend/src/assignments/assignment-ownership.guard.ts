import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssignmentSubmission } from './submission.entity';

/**
 * Ensures the authenticated instructor owns the course that a submission
 * belongs to before allowing the request to proceed.
 *
 * Ownership chain: submission -> assignment -> lesson -> module -> course.
 * Admins bypass the ownership check. Designed to be reused on any route that
 * carries a submission id in the `id` route parameter.
 */
@Injectable()
export class AssignmentOwnershipGuard implements CanActivate {
  constructor(
    @InjectRepository(AssignmentSubmission)
    private readonly submissionRepo: Repository<AssignmentSubmission>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Admins are allowed to override grades for any course.
    if (user.role === 'admin') {
      return true;
    }

    const submissionId = request.params?.id;
    if (!submissionId) {
      throw new NotFoundException('Submission not found');
    }

    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: [
        'assignment',
        'assignment.lesson',
        'assignment.lesson.module',
        'assignment.lesson.module.course',
      ],
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const course = submission.assignment?.lesson?.module?.course;
    if (!course || course.instructorId !== user.id) {
      throw new ForbiddenException(
        'You do not own the course that contains this submission',
      );
    }

    return true;
  }
}
