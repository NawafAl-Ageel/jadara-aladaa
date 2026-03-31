const bcrypt = require('bcryptjs');

let sqliteDb;
let pgPool;

function usingPostgres() {
  return Boolean(process.env.DATABASE_URL);
}

function getDb() {
  if (usingPostgres()) {
    if (!pgPool) {
      const { Pool } = require('pg');
      pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
    }
    return pgPool;
  }

  if (!sqliteDb) {
    const Database = require('better-sqlite3');
    const path = require('path');
    sqliteDb = new Database(path.join(__dirname, 'jadara.db'));
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
  }
  return sqliteDb;
}

async function initDb() {
  if (usingPostgres()) {
    // Run migrations then seed admin user.
    // We keep migrations in a separate entrypoint too, but this makes local/dev safer.
    // eslint-disable-next-line global-require
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      // eslint-disable-next-line global-require
      await require('./migrate');
    } catch (e) {
      // If migrate.js runs as a script, require() won't apply; so we just ignore here.
      // In production we run `npm run migrate` during deploy.
    } finally {
      await pool.end();
    }
    await seedAdminPg();
    return;
  }

  initSqlite();
  seedAdminSqlite();
}

function initSqlite() {
  const database = getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      company TEXT,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      message TEXT NOT NULL,
      questionnaire TEXT,
      status TEXT DEFAULT 'new' CHECK(status IN ('new', 'in_review', 'contacted', 'closed')),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      ip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function seedAdminSqlite() {
  const database = getDb();
  const adminCount = database.prepare('SELECT COUNT(*) as count FROM admin_users').get().count;
  if (adminCount !== 0) return;

  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = bcrypt.hashSync(password, 12);
  database.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(username, hash);
  // eslint-disable-next-line no-console
  console.log(`Admin user seeded: ${username}`);
}

async function seedAdminPg() {
  const pool = getDb();
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM admin_users');
  if (rows[0].count !== 0) return;

  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = bcrypt.hashSync(password, 12);
  await pool.query('INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)', [username, hash]);
  // eslint-disable-next-line no-console
  console.log(`Admin user seeded: ${username}`);
}

module.exports = { getDb, initDb, usingPostgres };
