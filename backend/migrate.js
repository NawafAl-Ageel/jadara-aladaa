require('dotenv').config();

const fs = require('fs');
const path = require('path');

async function migratePostgres(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => /^\d+_.+\.sql$/.test(f))
    .sort();

  for (const file of files) {
    const id = file;
    const already = await pool.query('SELECT 1 FROM schema_migrations WHERE id = $1', [id]);
    if (already.rowCount) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations (id) VALUES ($1)', [id]);
      await pool.query('COMMIT');
      // eslint-disable-next-line no-console
      console.log(`Applied migration: ${id}`);
    } catch (e) {
      await pool.query('ROLLBACK');
      throw e;
    }
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL not set, skipping Postgres migrations.');
    return;
  }

  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await migratePostgres(pool);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

