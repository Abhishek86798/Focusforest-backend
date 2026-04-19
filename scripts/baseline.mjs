// baseline.mjs — inserts migration history records directly via pg driver
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Parse .env manually (no dotenv dependency on pg)
const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
const envContent = readFileSync(envPath, 'utf8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
  if (match) envVars[match[1]] = match[2];
}

// Use DATABASE_URL (pooler port 6543) — works from this machine
const connStr = envVars['DATABASE_URL'];
if (!connStr) { console.error('DATABASE_URL not found in .env'); process.exit(1); }

const { Client } = pg;
const client = new Client({ connectionString: connStr });

const migrations = [
  '20260319183521_init',
  '20260325151244_add_immersive_mode_session_fields',
  '20260325201939_add_is_private_to_users',
  'add_user_preferences',
];

async function run() {
  await client.connect();
  console.log('Connected to database.');

  // Create table if it doesn't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      checksum VARCHAR(64) NOT NULL,
      finished_at TIMESTAMPTZ,
      migration_name VARCHAR(255) NOT NULL,
      logs TEXT,
      rolled_back_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_steps_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  console.log('_prisma_migrations table ready.');

  for (const name of migrations) {
    const exists = await client.query(
      'SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1',
      [name]
    );
    if (exists.rowCount > 0) {
      console.log(`  SKIP (already exists): ${name}`);
      continue;
    }
    await client.query(
      `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES (gen_random_uuid()::text, 'baseline', now(), $1, NULL, NULL, now(), 1)`,
      [name]
    );
    console.log(`  INSERTED: ${name}`);
  }

  console.log('\nAll baseline migrations recorded. Verifying...');
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
