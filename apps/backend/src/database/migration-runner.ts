import { AppDataSource } from '../data-source';

const command = process.argv[2];

async function main() {
  if (!command || !['run', 'revert', 'show'].includes(command)) {
    console.error('Usage: node dist/database/migration-runner.js <run|revert|show>');
    process.exit(1);
  }

  try {
    await AppDataSource.initialize();
    console.log(`DataSource initialized. Running command: ${command}`);

    switch (command) {
      case 'run': {
        const migrations = await AppDataSource.runMigrations();
        if (migrations.length === 0) {
          console.log('No pending migrations to run.');
        } else {
          console.log(`Ran ${migrations.length} migration(s):`);
          migrations.forEach((m) => console.log(`  ✅ ${m.name}`));
        }
        break;
      }
      case 'revert': {
        const reverted = await AppDataSource.undoLastMigration();
        if (reverted) {
          console.log(`Reverted migration: ${reverted.name}`);
        } else {
          console.log('No migrations to revert.');
        }
        break;
      }
      case 'show': {
        const executedMigrations = await AppDataSource.query(
          `SELECT name, "timestamp", "executedAt" FROM "${AppDataSource.options.migrationsTableName || 'migrations'}" ORDER BY "timestamp" ASC`,
        );
        const pendingMigrations = AppDataSource.migrations.filter(
          (m) => !executedMigrations.some((em: any) => em.name === m.name),
        );

        console.log('\nExecuted migrations:');
        if (executedMigrations.length === 0) {
          console.log('  (none)');
        } else {
          executedMigrations.forEach((em: any) =>
            console.log(`  ✅ ${em.name} (${em.executedAt})`),
          );
        }

        console.log('\nPending migrations:');
        if (pendingMigrations.length === 0) {
          console.log('  (none)');
        } else {
          pendingMigrations.forEach((pm) => console.log(`  ⏳ ${pm.name}`));
        }
        break;
      }
    }

    await AppDataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error('Migration command failed:', error);
    process.exit(1);
  }
}

main();
