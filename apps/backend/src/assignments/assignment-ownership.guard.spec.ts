import { ForbiddenException, NotFoundException, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AssignmentOwnershipGuard } from './assignment-ownership.guard';
import { AssignmentSubmission } from './submission.entity';

describe('AssignmentOwnershipGuard', () => {
  let guard: AssignmentOwnershipGuard;
  const submissionRepo = { findOne: jest.fn() };

  const buildContext = (user: any, params: any = { id: 'submission-1' }) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user, params }),
      }),
    }) as unknown as ExecutionContext;

  const submissionOwnedBy = (instructorId: string) => ({
    id: 'submission-1',
    assignment: {
      lesson: { module: { course: { instructorId } } },
    },
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AssignmentOwnershipGuard,
        { provide: getRepositoryToken(AssignmentSubmission), useValue: submissionRepo },
      ],
    }).compile();

    guard = moduleRef.get(AssignmentOwnershipGuard);
  });

  it('rejects a foreign instructor with 403', async () => {
    submissionRepo.findOne.mockResolvedValue(submissionOwnedBy('owner-instructor'));

    const context = buildContext({ id: 'other-instructor', role: 'instructor' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the instructor who owns the course', async () => {
    submissionRepo.findOne.mockResolvedValue(submissionOwnedBy('owner-instructor'));

    const context = buildContext({ id: 'owner-instructor', role: 'instructor' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows admins to bypass the ownership check', async () => {
    const context = buildContext({ id: 'any-admin', role: 'admin' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(submissionRepo.findOne).not.toHaveBeenCalled();
  });

  it('returns 404 when the submission does not exist', async () => {
    submissionRepo.findOne.mockResolvedValue(null);

    const context = buildContext({ id: 'owner-instructor', role: 'instructor' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(NotFoundException);
  });
});
