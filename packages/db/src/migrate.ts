import { db } from './client.js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  console.log('Running database migrations...');
  try {
    // Resolved relative to packages/db/dist/migrate.js
    const migrationsFolder = resolve(__dirname, '../src/migrations');
    console.log(`Loading migrations from: ${migrationsFolder}`);
    await migrate(db, { migrationsFolder });
    console.log('✓ Database migrations completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database migration failed:', error);
    process.exit(1);
  }
}

main();
