import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type BatchJobStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type BatchJobType = 'users' | 'courses';

@Entity('batch_jobs')
export class BatchJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  type!: BatchJobType;

  @Column({ default: 'pending' })
  status!: BatchJobStatus;

  @Column('jsonb')
  payload!: Array<Record<string, unknown>>;

  @Column('jsonb', { nullable: true })
  results!: Array<Record<string, unknown>> | null;

  @Column('jsonb', { nullable: true })
  errors!: Array<Record<string, unknown>> | null;

  @Column({ default: 0 })
  totalItems!: number;

  @Column({ default: 0 })
  processedItems!: number;

  @Column({ default: 0 })
  failedItems!: number;

  @Column({ nullable: true })
  createdById!: string;

  @Column({ nullable: true, type: 'timestamp' })
  startedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
