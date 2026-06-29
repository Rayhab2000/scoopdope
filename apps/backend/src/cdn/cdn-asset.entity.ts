import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AssetType {
  VIDEO = 'video',
  IMAGE = 'image',
  PDF = 'pdf',
}

export enum ContentType {
  VIDEO = 'video',
  DOCUMENT = 'document',
  IMAGE = 'image',
  AUDIO = 'audio',
}

@Entity('cdn_assets')
export class CdnAsset {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ nullable: true })
  lessonId!: string;

  @Column()
  fileName!: string;

  @Column()
  originalName!: string;

  @Column()
  cdnUrl!: string;

  @Column({ type: 'enum', enum: ContentType })
  contentType!: ContentType;

  @Column({ type: 'enum', enum: AssetType, nullable: true })
  assetType!: AssetType | null;

  @Column({ type: 'bigint' })
  fileSize!: number;

  @Column({ nullable: true })
  mimeType!: string | null;

  @Column({ nullable: true })
  duration!: number;

  @Column({ default: false })
  isTranscoded!: boolean;

  @Column({ default: true })
  isPrivate!: boolean;

  @Column('simple-array', { nullable: true })
  availableBitrates!: string[];

  @Column({ nullable: true })
  thumbnailUrl!: string;

  @Column({ nullable: true })
  uploadedByUserId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
