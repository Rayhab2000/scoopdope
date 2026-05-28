import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCoursePriceUsd1749000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "priceUsd" DECIMAL(10,2) DEFAULT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "courses" DROP COLUMN IF EXISTS "priceUsd"`);
  }
}
