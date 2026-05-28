import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCredentialMetadataFields1748700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "credentials" ADD COLUMN IF NOT EXISTS "grade" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "credentials" ADD COLUMN IF NOT EXISTS "onChainId" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "credentials" DROP COLUMN IF EXISTS "grade"`,
    );
    await queryRunner.query(
      `ALTER TABLE "credentials" DROP COLUMN IF EXISTS "onChainId"`,
    );
  }
}
