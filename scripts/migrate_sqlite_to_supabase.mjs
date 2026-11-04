#!/usr/bin/env node
/* Phase 2 data migration: SQLite -> Supabase PostgreSQL.
 *
 * Usage:  node scripts/migrate_sqlite_to_supabase.mjs
 * Requires: DATABASE_URL in .env and migrations/001_supabase_schema.sql
 *           already executed in the Supabase SQL Editor.
 *
 * - Preserves existing ids, dates, amounts and relationships (explicit id inserts).
 * - Skips any leftover ZZZ_SMOKE_TEST_* rows (test artifacts, should not exist).
 * - After inserting, syncs identity sequences and compares EVERY row against
 *   the SQLite source. The SQLite file is opened READ-ONLY and is never
 *   modified, deleted, or overwritten.
 */
import { Pool, types } from 'pg';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// ---- load .env ----
const env = {};
for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}
const DATABASE_URL = env.DATABASE_URL;
if (!DATABASE_URL || !DATABASE_URL.startsWith('postgres')) {
  console.error('x DATABASE_URL missing or invalid in .env. Set it with scripts/set_database_url.mjs first.');
  process.exit(1);
}

// same type parsers as server/db.js (dates as strings, numerics as numbers)
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
const sqlite = new DatabaseSync(path.join(root, 'data', 'labour.db'), { readOnly: true });

const results = [];
const check = (name, pass, detail = '') =>
  results.push({ name, pass }) && console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);

// strip a trailing 'Z' / '+00' and normalize to 'YYYY-MM-DD HH:MM:SS' for comparison
const normTs = (s) => (s ? String(s).slice(0, 19).replace('T', ' ') : '');
const eq = (a, b, tol = 0.001) => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= tol;
  return a === b;
};

async function main() {
  // ---- 1. read source (READ-ONLY SQLite) ----
  let labours = sqlite.prepare('SELECT * FROM labours ORDER BY id').all();
  let attendance = sqlite.prepare('SELECT * FROM attendance ORDER BY id').all();

  // defensively skip test artifacts from any previous smoke-test crash
  const skipped = labours.filter((l) => l.name.startsWith('ZZZ_SMOKE_TEST'));
  if (skipped.length) {
    console.log(`skipping ${skipped.length} leftover smoke-test labour(s) (test artifacts)`);
    labours = labours.filter((l) => !l.name.startsWith('ZZZ_SMOKE_TEST'));
    const keep = new Set(labours.map((l) => l.id));
    attendance = attendance.filter((a) => keep.has(a.labour_id));
  }
  console.log(`source: ${labours.length} labour(s), ${attendance.length} attendance row(s)\n`);

  // ---- 2. insert into PostgreSQL preserving ids ----
  for (const l of labours) {
    await pool.query(
      `INSERT INTO labours (id, name, phone, role, join_date, active, wage_full, wage_half, wage_quarter, notes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO NOTHING`,
      [l.id, l.name, l.phone, l.role, l.join_date, l.active,
       l.wage_full, l.wage_half, l.wage_quarter, l.notes,
       l.created_at ? l.created_at + '+00' : null]
    );
  }
  for (const a of attendance) {
    await pool.query(
      `INSERT INTO attendance (id, labour_id, date, base, extra, days_worked, amount, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO NOTHING`,
      [a.id, a.labour_id, a.date, a.base, a.extra, a.days_worked, a.amount, a.note]
    );
  }

  // ---- 3. sync identity sequences past the migrated ids ----
  for (const table of ['labours', 'attendance']) {
    try {
      await pool.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), (SELECT COALESCE(MAX(id), 1) FROM ${table}))`,
        [table]
      );
      check(`sequence for "${table}" synced to max(id)`, true);
    } catch (e) {
      check(`sequence for "${table}" synced`, false, e.message);
    }
  }

  // ---- 4. row-by-row verification ----
  const pgLabours = (await pool.query('SELECT * FROM labours ORDER BY id')).rows;
  const pgAttendance = (await pool.query('SELECT * FROM attendance ORDER BY id')).rows;

  let lOk = pgLabours.length === labours.length;
  for (const s of labours) {
    const p = pgLabours.find((r) => r.id === s.id);
    if (!p) { lOk = false; break; }
    if (!(p.name === s.name && p.phone === s.phone && p.role === s.role &&
          String(p.join_date) === String(s.join_date) &&
          Number(p.active) === Number(s.active) &&
          eq(p.wage_full, s.wage_full) && eq(p.wage_half, s.wage_half) && eq(p.wage_quarter, s.wage_quarter) &&
          p.notes === s.notes)) { lOk = false; break; }
  }
  check(`labours migrated and verified (${labours.length} rows)`, lOk);

  let aOk = pgAttendance.length === attendance.length;
  for (const s of attendance) {
    const p = pgAttendance.find((r) => r.id === s.id);
    if (!p) { aOk = false; break; }
    if (!(String(p.date) === String(s.date) &&
          eq(p.base, s.base) && eq(p.extra, s.extra) &&
          eq(p.days_worked, s.days_worked) && eq(p.amount, s.amount) &&
          p.labour_id === s.labour_id && p.note === s.note)) { aOk = false; break; }
  }
  check(`attendance migrated and verified (${attendance.length} rows)`, aOk);

  check('total row counts match', pgLabours.length === labours.length && pgAttendance.length === attendance.length,
    `pg: ${pgLabours.length}+${pgAttendance.length}`);

  // ---- 5. summary ----
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${'='.repeat(50)}\n${results.length - failed.length}/${results.length} migration checks passed`);
  if (failed.length) {
    failed.forEach((f) => console.log('  - ' + f.name));
    process.exitCode = 1;
  }
  console.log('SQLite file untouched (opened read-only). The API server can now use Supabase.');
}

main()
  .then(() => pool.end())
  .then(() => process.exit(process.exitCode || 0))
  .catch(async (e) => {
    console.error('x migration failed:', e.message);
    try { await pool.end(); } catch {}
    process.exit(1);
  });
