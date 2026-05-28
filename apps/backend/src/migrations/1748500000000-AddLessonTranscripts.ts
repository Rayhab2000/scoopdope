import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLessonTranscripts1748500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "transcript" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "transcriptSrt" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "transcriptionJobName" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "lessons" DROP COLUMN IF EXISTS "transcript"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lessons" DROP COLUMN IF EXISTS "transcriptSrt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lessons" DROP COLUMN IF EXISTS "transcriptionJobName"`,
    );
  }
}
