/* PostgreSQL (Supabase) connection for the Labour Manager backend.
 *
 * Phase 2: SQLite (node:sqlite) was replaced by a pg connection pool that
 * talks to the Supabase PostgreSQL instance through DATABASE_URL.
 * The SQLite file itself is NOT deleted — it remains on disk untouched as a
 * rollback snapshot, and the external pre-migration backup is unaffected.
 *
 * SECURITY
 * - DATABASE_URL contains the database password: it lives ONLY in the
 *   git-ignored root .env and is used server-side. Never expose it to the
 *   client bundle, Git, or logs.
 * - The connection uses a privileged role, which BYPASSES Row Level Security
 *   by design. RLS (enabled in migrations/001) protects the public REST API;
 *   API authorization is enforced by the admin middleware in server/auth.js —
 *   never by RLS.
 * - All SQL is parameterized ($1..$n). No string interpolation of values.
 */
const { Pool, types } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

// fail fast with a clear message instead of serving an API with no database
if (!DATABASE_URL) {
  console.error(
    'Missing database configuration.\n' +
    'Create a .env file at the project root (see .env.example) containing:\n' +
    '  DATABASE_URL=<your Supabase connection string>\n' +
    'You can set it securely with: node scripts/set_database_url.mjs\n' +
    'Server will not start until this is set.'
  );
  process.exit(1);
}

/* ---- type parsers: keep API JSON shapes identical to the SQLite era ----
 * pg returns these Postgres types as strings by default; the app (and the
 * frontend) expect the same JavaScript types the SQLite driver produced. */
types.setTypeParser(1082, (v) => v);                                  // DATE     -> 'YYYY-MM-DD' string
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // NUMERIC  -> number
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // BIGINT (COUNT, ids) -> number

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Supabase pooler/managed endpoints
  max: 5,                             // single-admin app: a small pool is plenty
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => console.error('Unexpected PostgreSQL pool error:', err));

/* parameterized query helper — all statements in index.js go through here */
async function query(text, params = []) {
  const result = await pool.query(text, params);
  return { rows: result.rows, rowCount: result.rowCount };
}

module.exports = { pool, query };
