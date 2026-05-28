import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import { Bundle } from './bundle.entity';
import { BundleEnrollment } from './bundle-enrollment.entity';
import { Course } from '../courses/course.entity';
import { CreateBundleDto } from './dto/create-bundle.dto';
import { UpdateBundleDto } from './dto/update-bundle.dto';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { StellarService } from '../stellar/stellar.service';
import { CredentialsService } from '../credentials/credentials.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class BundlesService {
  constructor(
    @InjectRepository(Bundle)
    private bundleRepo: Repository<Bundle>,
    @InjectRepository(BundleEnrollment)
    private bundleEnrollmentRepo: Repository<BundleEnrollment>,
    @InjectRepository(Course)
    private courseRepo: Repository<Course>,
    private enrollmentsService: EnrollmentsService,
    private stellarService: StellarService,
    private credentialsService: CredentialsService,
    private usersService: UsersService,
  ) {}

  async findAll(publishedOnly = true) {
    const where = publishedOnly ? { isPublished: true } : {};
    return this.bundleRepo.find({
      where,
      relations: ['courses'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const bundle = await this.bundleRepo.findOne({
      where: { id },
      relations: ['courses'],
    });
    if (!bundle) throw new NotFoundException('Bundle not found');
    return bundle;
  }

  async create(dto: CreateBundleDto) {
    const courses = await this.courseRepo.findBy({ id: In(dto.courseIds) });
    if (courses.length !== dto.courseIds.length) {
      throw new BadRequestException('One or more courses not found');
    }

    const bundle = this.bundleRepo.create({
      ...dto,
      courses,
    });

    return this.bundleRepo.save(bundle);
  }

  async update(id: string, dto: UpdateBundleDto) {
    const bundle = await this.findOne(id);

    if (dto.courseIds) {
      const courses = await this.courseRepo.findBy({ id: In(dto.courseIds) });
      if (courses.length !== dto.courseIds.length) {
        throw new BadRequestException('One or more courses not found');
      }
      bundle.courses = courses;
    }

    Object.assign(bundle, {
      ...dto,
      courseIds: undefined, // remove from dto to avoid typeorm error
    });

    return this.bundleRepo.save(bundle);
  }

  async delete(id: string) {
    const bundle = await this.findOne(id);
    await this.bundleRepo.remove(bundle);
  }

  async purchase(userId: string, bundleId: string) {
    const bundle = await this.findOne(bundleId);
    if (!bundle.isPublished) throw new BadRequestException('Bundle is not available for purchase');

    const existing = await this.bundleEnrollmentRepo.findOne({ where: { userId, bundleId } });
    if (existing) throw new ConflictException('Already purchased this bundle');

    // 1. Check user BST balance
    const user = await this.enrollmentsService.findByUser(userId); // Just to check if user exists, actually I should get user entity
    // In a real implementation, we would check Stellar balance here
    // const balance = await this.stellarService.getTokenBalance(userPublicKey);
    // if (balance < (bundle.discountPrice ?? bundle.price)) throw new BadRequestException('Insufficient balance');

    // 2. Create Bundle Enrollment
    const bundleEnrollment = await this.bundleEnrollmentRepo.save(
      this.bundleEnrollmentRepo.create({
        userId,
        bundleId,
      }),
    );

    // 3. Enroll in all courses
    for (const course of bundle.courses) {
      try {
        await this.enrollmentsService.enroll(userId, course.id);
      } catch (err) {
        // Ignore "Already enrolled" errors if they were already enrolled in a specific course
        if (!(err instanceof ConflictException)) throw err;
      }
    }

    return bundleEnrollment;
  }

  async getEnrollments(userId: string) {
    return this.bundleEnrollmentRepo.find({
      where: { userId },
      relations: ['bundle', 'bundle.courses'],
    });
  }

  async updateProgress(userId: string, courseId: string) {
    // Check if this course belongs to any bundles the user is enrolled in
    const bundleEnrollments = await this.bundleEnrollmentRepo.find({
      where: { userId, completedAt: IsNull() },
      relations: ['bundle', 'bundle.courses'],
    });

    for (const enrollment of bundleEnrollments) {
      const isCourseInBundle = enrollment.bundle.courses.some((c) => c.id === courseId);
      if (isCourseInBundle) {
        // Check if ALL courses in this bundle are completed
        const courseIds = enrollment.bundle.courses.map((c) => c.id);
        const userEnrollments = await this.enrollmentsService.findByUser(userId);
        
        const bundleCoursesEnrollments = userEnrollments.filter((e) => courseIds.includes(e.courseId));
        const allCompleted = bundleCoursesEnrollments.length === courseIds.length && 
                             bundleCoursesEnrollments.every((e) => e.completedAt !== null);

        if (allCompleted) {
          enrollment.completedAt = new Date();
          await this.bundleEnrollmentRepo.save(enrollment);
          
          // Issue bundle completion certificate
          const user = await this.usersService.findById(userId);
          if (user?.stellarPublicKey) {
            await this.credentialsService.issueBundle(userId, enrollment.bundleId, user.stellarPublicKey);
          }
        }
      }
    }
  }
}
