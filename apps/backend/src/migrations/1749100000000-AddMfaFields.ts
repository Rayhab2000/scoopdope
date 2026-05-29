import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddMfaFields1749100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('users', [
      new TableColumn({
        name: 'mfaEnabled',
        type: 'boolean',
        default: false,
      }),
      new TableColumn({
        name: 'mfaSecret',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'mfaBackupCodes',
        type: 'text',
        isNullable: true,
        comment: 'Comma-separated hashed backup codes',
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'mfaBackupCodes');
    await queryRunner.dropColumn('users', 'mfaSecret');
    await queryRunner.dropColumn('users', 'mfaEnabled');
  }
}
