import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';

import { PayoutsService } from './payouts.service';
import { Payout } from './payout.entity';
import { Enrollment } from '../enrollments/enrollment.entity';
import { Course } from '../courses/course.entity';
import { ConfigService } from '@nestjs/config';
import { KycService } from '../kyc/kyc.service';

function makeEnrollment(id: string, courseId: string, completedAt: Date | null): Enrollment {
  return {
    id,
    userId: `user-${id}`,
    courseId,
    enrolledAt: new Date('2026-01-01'),
    completedAt,
    enrolledVersionNumber: 1,
    transactionHash: null,
    user: null as any,
    course: null as any,
  };
}

function makeCourse(id: string, instructorId: string | null): Course {
  return {
    id,
    instructorId,
    instructor: instructorId ? { id: instructorId, email: `${instructorId}@test.com` } as any : null,
  } as any;
}

describe('PayoutsService — calculatePayouts pagination', () => {
  let service: PayoutsService;
  let enrollmentsRepo: jest.Mocked<Repository<Enrollment>>;
  let coursesRepo: jest.Mocked<Repository<Course>>;
  let payoutsRepo: jest.Mocked<Repository<Payout>>;
  let configService: jest.Mocked<ConfigService>;

  const START_DATE = new Date('2026-01-01');
  const END_DATE = new Date('2026-12-31');
  const COURSE_ID = 'course-uuid-1';
  const INSTRUCTOR_ID = 'instructor-uuid-1';

  beforeEach(async () => {
    const mockEnrollmentsRepo: Partial<jest.Mocked<Repository<Enrollment>>> = {
      find: jest.fn(),
      count: jest.fn(),
    };

    const mockCoursesRepo: Partial<jest.Mocked<Repository<Course>>> = {
      find: jest.fn(),
    };

    const mockPayoutsRepo: Partial<jest.Mocked<Repository<Payout>>> = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const mockConfigService: Partial<jest.Mocked<ConfigService>> = {
      get: jest.fn(),
    };

    const mockKycService: Partial<jest.Mocked<KycService>> = {
      isApproved: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutsService,
        { provide: getRepositoryToken(Enrollment), useValue: mockEnrollmentsRepo },
        { provide: getRepositoryToken(Course), useValue: mockCoursesRepo },
        { provide: getRepositoryToken(Payout), useValue: mockPayoutsRepo },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: KycService, useValue: mockKycService },
      ],
    }).compile();

    service = module.get(PayoutsService);
    enrollmentsRepo = module.get(getRepositoryToken(Enrollment));
    coursesRepo = module.get(getRepositoryToken(Course));
    payoutsRepo = module.get(getRepositoryToken(Payout));
    configService = module.get(ConfigService);

    configService.get.mockImplementation((key: string, defaultValue?: any) => {
      if (key === 'PLATFORM_FEE_PERCENT') return 20;
      if (key === `COURSE_PRICE_${COURSE_ID}`) return 100;
      if (key === 'payouts.batchSize') return 500;
      return defaultValue;
    });
  });

  it('processes 2500 enrollments across 5 paginated batches', async () => {
    const courses = [makeCourse(COURSE_ID, INSTRUCTOR_ID)];
    coursesRepo.find.mockResolvedValueOnce(courses as any);

    const allEnrollments = Array.from({ length: 2500 }, (_, i) =>
      makeEnrollment(`enrollment-${i}`, COURSE_ID, new Date('2026-06-01')),
    );

    const batchSize = 500;
    let callCount = 0;

    enrollmentsRepo.find.mockImplementation((options: any) => {
      const skip = options?.skip ?? 0;
      const take = options?.take ?? batchSize;
      const batch = allEnrollments.slice(skip, skip + take);
      callCount++;
      return Promise.resolve(batch);
    });

    payoutsRepo.save.mockResolvedValueOnce([] as any);

    const result = await service.calculatePayouts(START_DATE, END_DATE);

    expect(enrollmentsRepo.find).toHaveBeenCalledTimes(6);

    for (let i = 0; i < 5; i++) {
      expect(enrollmentsRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ courseId: COURSE_ID }),
          order: { id: 'ASC' },
          skip: i * batchSize,
          take: batchSize,
        }),
      );
    }

    expect(enrollmentsRepo.find).toHaveBeenLastCalledWith(
      expect.objectContaining({
        skip: 2500,
        take: batchSize,
      }),
    );

    expect(payoutsRepo.create).toHaveBeenCalledTimes(1);
    const createdPayout = payoutsRepo.create.mock.calls[0][0];
    expect(createdPayout.totalRevenue).toBe(2500 * 100);
    expect(createdPayout.platformFee).toBe(2500 * 100 * 0.2);
    expect(createdPayout.instructorShare).toBe(2500 * 100 * 0.8);
  });

  it('does not call find() once with no limit', async () => {
    const courses = [makeCourse(COURSE_ID, INSTRUCTOR_ID)];
    coursesRepo.find.mockResolvedValueOnce(courses as any);

    const allEnrollments = Array.from({ length: 1500 }, (_, i) =>
      makeEnrollment(`enrollment-${i}`, COURSE_ID, new Date('2026-06-01')),
    );

    enrollmentsRepo.find.mockImplementation((options: any) => {
      const skip = options?.skip ?? 0;
      const take = options?.take ?? 500;
      return Promise.resolve(allEnrollments.slice(skip, skip + take));
    });

    payoutsRepo.save.mockResolvedValueOnce([] as any);

    await service.calculatePayouts(START_DATE, END_DATE);

    expect(enrollmentsRepo.find).toHaveBeenCalledTimes(4);

    const firstCallArgs = enrollmentsRepo.find.mock.calls[0][0] as any;
    expect(firstCallArgs).toHaveProperty('take');
    expect(firstCallArgs.take).toBe(500);
  });

  it('skips courses with no instructor', async () => {
    const courses = [makeCourse(COURSE_ID, null)];
    coursesRepo.find.mockResolvedValueOnce(courses as any);

    payoutsRepo.save.mockResolvedValueOnce([] as any);

    const result = await service.calculatePayouts(START_DATE, END_DATE);

    expect(enrollmentsRepo.find).not.toHaveBeenCalled();
    expect(payoutsRepo.create).not.toHaveBeenCalled();
  });

  it('skips courses with zero completions', async () => {
    const courses = [makeCourse(COURSE_ID, INSTRUCTOR_ID)];
    coursesRepo.find.mockResolvedValueOnce(courses as any);

    enrollmentsRepo.find.mockResolvedValueOnce([]);

    payoutsRepo.save.mockResolvedValueOnce([] as any);

    await service.calculatePayouts(START_DATE, END_DATE);

    expect(payoutsRepo.create).not.toHaveBeenCalled();
  });

  it('continues processing remaining batches when one batch fetch fails', async () => {
    const courses = [makeCourse(COURSE_ID, INSTRUCTOR_ID)];
    coursesRepo.find.mockResolvedValueOnce(courses as any);

    const allEnrollments = Array.from({ length: 1500 }, (_, i) =>
      makeEnrollment(`enrollment-${i}`, COURSE_ID, new Date('2026-06-01')),
    );

    let callCount = 0;
    enrollmentsRepo.find.mockImplementation((options: any) => {
      callCount++;
      const skip = options?.skip ?? 0;
      const take = options?.take ?? 500;

      if (callCount === 2) {
        throw new Error('DB connection timeout');
      }

      return Promise.resolve(allEnrollments.slice(skip, skip + take));
    });

    payoutsRepo.save.mockResolvedValueOnce([] as any);

    await service.calculatePayouts(START_DATE, END_DATE);

    expect(enrollmentsRepo.find).toHaveBeenCalledTimes(4);

    const createdPayout = payoutsRepo.create.mock.calls[0][0];
    expect(createdPayout.totalRevenue).toBe(1000 * 100);
    expect(createdPayout.platformFee).toBe(1000 * 100 * 0.2);
    expect(createdPayout.instructorShare).toBe(1000 * 100 * 0.8);
  });
});
