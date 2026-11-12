const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/toolsvilla',
});

// Idle-client errors (e.g. Postgres restart) throw if unhandled and crash the process.
pool.on('error', (err) => {
  console.error('[db] idle pool client error:', err.message);
});

let migrated = false;

async function migrate() {
  if (migrated) return;
  migrated = true;
  const schemaPath = path.join(__dirname, '..', 'sql', 'schema.sql');
  try {
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(sql);
    console.log('[db] schema ensured from sql/schema.sql');
  } catch (err) {
    console.error('[db] migration failed:', err.message);
  }
}

// Lazy: run migration on first query
async function query(text, params) {
  await migrate();
  return pool.query(text, params);
}

module.exports = { pool, query };
