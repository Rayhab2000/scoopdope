import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Reminder } from './reminder.entity';
import { Enrollment } from '../enrollments/enrollment.entity';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    @InjectRepository(Reminder)
    private remindersRepository: Repository<Reminder>,
    @InjectRepository(Enrollment)
    private enrollmentsRepository: Repository<Enrollment>,
    private mailService: MailService,
    private configService: ConfigService,
  ) {}

  async sendInactiveReminders(): Promise<void> {
    const inactivityDays = this.configService.get<number>('REMINDER_INACTIVITY_DAYS', 7);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - inactivityDays);
    const batchSize = 100;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const inactiveEnrollments = await this.enrollmentsRepository
        .createQueryBuilder('e')
        .leftJoinAndSelect('e.user', 'user')
        .leftJoinAndSelect('e.course', 'course')
        .where('e.completedAt IS NULL')
        .andWhere('e.enrolledAt < :cutoffDate', { cutoffDate })
        .take(batchSize)
        .skip(offset)
        .getMany();

      if (inactiveEnrollments.length === 0) {
        hasMore = false;
        break;
      }

      for (const enrollment of inactiveEnrollments) {
        const reminder = await this.remindersRepository.findOne({
          where: { userId: enrollment.userId, courseId: enrollment.courseId },
        });

        if (!reminder || !reminder.isActive) continue;

        const lastReminder = new Date(reminder.lastReminderSentAt);
        const reminderFrequencyHours = this.configService.get<number>('REMINDER_FREQUENCY_HOURS', 168);
        const nextReminderTime = new Date(lastReminder.getTime() + reminderFrequencyHours * 60 * 60 * 1000);

        if (new Date() < nextReminderTime) continue;

        await this.mailService.sendReminderEmail(
          enrollment.user.email,
          enrollment.user.username,
          enrollment.course.title,
        );

        reminder.lastReminderSentAt = new Date();
        await this.remindersRepository.save(reminder);
        this.logger.log(`Reminder sent to ${enrollment.user.email} for course ${enrollment.course.title}`);
      }

      offset += batchSize;
    }

  async createReminder(userId: string, courseId: string): Promise<Reminder> {
    const reminder = this.remindersRepository.create({
      userId,
      courseId,
      lastReminderSentAt: new Date(),
      isActive: true,
    });
    return this.remindersRepository.save(reminder);
  }

  async disableReminder(userId: string, courseId: string): Promise<void> {
    await this.remindersRepository.update(
      { userId, courseId },
      { isActive: false },
    );
  }

  async enableReminder(userId: string, courseId: string): Promise<void> {
    await this.remindersRepository.update(
      { userId, courseId },
      { isActive: true },
    );
  }

  async getReminderStats(): Promise<{ totalReminders: number; activeReminders: number; sentToday: number }> {
    const totalReminders = await this.remindersRepository.count();
    const activeReminders = await this.remindersRepository.count({ where: { isActive: true } });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sentToday = await this.remindersRepository.count({
      where: { lastReminderSentAt: MoreThanOrEqual(today) },
    });

    return { totalReminders, activeReminders, sentToday };
  }
}
