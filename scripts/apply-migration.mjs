// apply-migration.mjs — applies the phone/auth_provider migration and records it in _prisma_migrations
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
const envContent = readFileSync(envPath, 'utf8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
  if (match) envVars[match[1]] = match[2];
}

const connStr = envVars['DATABASE_URL'];
if (!connStr) { console.error('DATABASE_URL not found in .env'); process.exit(1); }

const migrationName = '20260419120000_add_phone_and_auth_provider';

const { Client } = pg;
const client = new Client({ connectionString: connStr });

async function run() {
  await client.connect();
  console.log('Connected to database.');

  // Check if already applied
  const exists = await client.query(
    'SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1',
    [migrationName]
  );
  if (exists.rowCount > 0) {
    console.log(`Migration "${migrationName}" already applied. Skipping SQL execution.`);
  } else {
    console.log('Applying migration SQL...');

    // Add phone column if missing
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" TEXT`);
    console.log('  ✓ phone column: OK');

    // Add auth_provider column if missing
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auth_provider" TEXT DEFAULT 'email'`);
    console.log('  ✓ auth_provider column: OK');

    // Create unique index on phone if missing
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_key" ON "users"("phone")`);
    console.log('  ✓ users_phone_key index: OK');

    // Record in migration history
    await client.query(
      `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES (gen_random_uuid()::text, 'manual', now(), $1, NULL, NULL, now(), 1)`,
      [migrationName]
    );
    console.log(`  ✓ Recorded in _prisma_migrations`);
  }

  // Verify columns exist
  console.log('\nVerifying columns in users table...');
  const cols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name IN ('phone', 'auth_provider')
    ORDER BY column_name
  `);
  if (cols.rows.length === 0) {
    console.log('  ⚠️  No columns found! Something went wrong.');
  } else {
    for (const r of cols.rows) {
      console.log(`  ✓ ${r.column_name} | type: ${r.data_type} | nullable: ${r.is_nullable} | default: ${r.column_default}`);
    }
  }

  // List all migration history
  console.log('\nCurrent _prisma_migrations table:');
  const rows = await client.query('SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at');
  for (const r of rows.rows) {
    console.log(`  ✓ ${r.migration_name}`);
  }

  await client.end();
  console.log('\nDone.');
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
