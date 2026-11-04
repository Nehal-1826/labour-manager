/* Supabase Auth smoke test for the Labour Manager API.
 *
 * Usage:  node scripts/auth_smoke_test.mjs <admin-email> <admin-password>
 *
 * Requires the server to be running (npm run dev:server) and a real .env.
 * Verifies: login, admin UID match, every API endpoint, all Word report
 * downloads, session refresh, logout, and unauthorized-access blocking.
 * Creates ONE temporary labour (name prefixed "ZZZ_SMOKE_TEST") and deletes
 * it at the end, then compares the labours/attendance tables to the baseline.
 */
import { createClient } from '@supabase/supabase-js';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// ---- load .env (only missing keys fall back to process env) ----
const env = {};
for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}
const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, ADMIN_UID } = env;
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !ADMIN_UID) {
  console.error('x .env must contain SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, ADMIN_UID');
  process.exit(1);
}

// credentials: pass as CLI args, or answer the prompt (password input hidden)
// NOTE: readline in terminal mode requires a real output stream (output.on
// must exist — a bare { write } object throws TypeError), so the interface
// always uses process.stdout. Password hiding is done by overriding
// readline's output writer AFTER the prompt is printed, so the typed
// characters are never echoed to the terminal.
function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    rl.question(question, (answer) => {
      rl.history = rl.history.slice(1); // keep secrets out of readline history
      rl.close();
      if (hidden) process.stdout.write('\n'); // newline after the silent input
      resolve(answer.trim());
    });
    if (hidden) {
      // swallow every readline write after the prompt: typed characters are
      // never echoed (prompt itself was already printed by rl.question above)
      rl._writeToOutput = () => {};
    }
  });
}

let [email, password] = process.argv.slice(2);
if (!email) email = await ask('Administrator email: ');
if (!password) password = await ask('Administrator password (input hidden): ', true);
if (!email || !password) {
  console.error('x Email and password are required.');
  process.exit(1);
}

const API = 'http://localhost:4000/api';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const results = [];
const check = (name, pass, detail = '') =>
  results.push({ name, pass, detail }) && console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);

const baseline = new DatabaseSync(path.join(root, 'data', 'labour.db'), { readOnly: true });
const snapshot = () => JSON.stringify({
  l: baseline.prepare('SELECT * FROM labours ORDER BY id').all(),
  a: baseline.prepare('SELECT * FROM attendance ORDER BY id').all(),
});
const before = snapshot();

// ---- 1. login ----
console.log('\n== login ==');
const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
check('sign in with email + password', !signInErr && !!signIn?.session, signInErr?.message);
let token = signIn?.session?.access_token;
check('user id matches ADMIN_UID (value hidden)', signIn?.user?.id === ADMIN_UID);
check('email confirmed (session issued)', !!token);

// ---- helpers ----
async function call(path, { method = 'GET', body, useToken = token, status } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(useToken ? { Authorization: `Bearer ${useToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') || '';
  const payload = ct.includes('json') ? await res.json().catch(() => ({})) : await res.arrayBuffer();
  return { res, payload, ok: status ? res.status === status : res.ok, status: res.status };
}

// ---- 2. unauthorized access ----
console.log('\n== unauthorized access ==');
check('no token -> 401', (await call('/dashboard', { useToken: null })).status === 401);
check('garbage token -> 401', (await call('/dashboard', { useToken: 'garbage.token.here' })).status === 401);

// ---- 3. every read endpoint ----
console.log('\n== endpoints (authenticated) ==');
const reads = [
  ['/dashboard', (d) => typeof d.stats.today_wages === 'number'],
  ['/labours', (d) => Array.isArray(d)],
  [`/labours/${JSON.parse(before).l[0].id}`, (d) => d.periods && d.history],
  ['/attendance/' + new Date().toISOString().slice(0, 10), (d) => Array.isArray(d.records)],
];
for (const [p, v] of reads) {
  const r = await call(p);
  check(`GET ${p} -> 200 + valid shape`, r.ok && v(r.payload), `status ${r.status}`);
}

// ---- 4..6. write round-trip, downloads, session refresh ----
// wrapped in try/catch/finally: the temporary labour is deleted in the
// finally block even if an unexpected error aborts the tests above.
console.log('\n== write round-trip (temporary labour, removed afterwards) ==');
let tid = null;
try {
  const stamp = Date.now();
  const created = await call('/labours', {
    method: 'POST',
    body: { name: `ZZZ_SMOKE_TEST_${stamp}`, role: 'connectivity-test', wage_full: 400, join_date: new Date().toISOString().slice(0, 10) },
  });
  check('POST /labours -> 201', created.status === 201, `status ${created.status}`);
  tid = created.payload?.id;

  if (tid) {
    const marked = await call('/attendance', {
      method: 'POST',
      body: { labour_id: tid, date: new Date().toISOString().slice(0, 10), base: 1, extra: 0.5, note: 'smoke test' },
    });
    check('POST /attendance (full + 1/2 extra) -> 200, amount = wage_half + wage_full = 600',
      marked.ok && marked.payload.amount === 600 && marked.payload.days_worked === 1.5,
      `amount=${marked.payload?.amount} days=${marked.payload?.days_worked}`);

    const upsert = await call('/attendance', {
      method: 'POST',
      body: { labour_id: tid, date: new Date().toISOString().slice(0, 10), base: 0.25, extra: 0 },
    });
    check('POST /attendance again (upsert) -> 200, amount = quarter rate = 100',
      upsert.ok && upsert.payload.amount === 100 && upsert.payload.days_worked === 0.25,
      `amount=${upsert.payload?.amount}`);

    const invalid = await call('/attendance', {
      method: 'POST',
      body: { labour_id: tid, date: new Date().toISOString().slice(0, 10), base: 0, extra: 0.5 },
    });
    check('extra on absent day -> rejected 400', invalid.status === 400, `status ${invalid.status}`);

    const updated = await call(`/labours/${tid}`, {
      method: 'PUT',
      body: { name: `ZZZ_SMOKE_TEST_${stamp}`, role: 'helper', wage_full: 500, join_date: new Date().toISOString().slice(0, 10), active: true },
    });
    check('PUT /labours/:id -> 200', updated.status === 200 && updated.payload.wage_full === 500, `status ${updated.status}`);

  // ---- deactivate / reactivate (Remove Labour modal backend) ----
  // active is stored as INTEGER 0/1 — the API contract returns 0/1
  const deact = await call(`/labours/${tid}/active`, { method: 'PATCH', body: { active: false } });
  check('PATCH /labours/:id/active {false} -> 200, active = 0 (deactivated)',
    deact.ok && Number(deact.payload.active) === 0, `status ${deact.status}`);
  const stillThere = await call(`/labours/${tid}`);
  check('deactivated labour keeps record + attendance history',
    stillThere.ok && Number(stillThere.payload.labour.active) === 0 && stillThere.payload.history.length > 0,
    `${stillThere.payload?.history?.length ?? 0} history rows preserved`);

  const reactivated = await call(`/labours/${tid}/active`, { method: 'PATCH', body: { active: true } });
  check('PATCH {true} -> active = 1 (reactivated)', reactivated.ok && Number(reactivated.payload.active) === 1,
    `status ${reactivated.status}`);

  const dash = await call('/dashboard');
  check('GET /dashboard after writes -> 200', dash.ok && typeof dash.payload.stats.today_wages === 'number');
}

  // ---- 5. Word report downloads ----
  console.log('\n== word report downloads ==');
  const today = new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);
  const month = today.slice(5, 7);
  const downloads = [
    [`/labours/${JSON.parse(before).l[0].id}/report/docx`, 'individual'],
    [`/reports/monthly/${year}/${month}/docx`, 'monthly'],
    [`/reports/yearly/${year}/docx`, 'yearly'],
  ];
  for (const [p, label] of downloads) {
    const res = await fetch(API + p, { headers: { Authorization: `Bearer ${token}` } });
    const buf = Buffer.from(await res.arrayBuffer());
    const isZip = buf.subarray(0, 2).toString() === 'PK';
    const cd = res.headers.get('content-disposition') || '';
    check(`GET ${p} -> 200 + valid .docx (${label})`,
      res.status === 200 && isZip && buf.length > 4000 && cd.includes('attachment'),
      `${buf.length} bytes, ${cd.match(/filename="([^"]+)"/)?.[1] ?? 'no filename'}`);
  }

  // ---- 6. session refresh ----
  console.log('\n== session refresh ==');
  const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
  const newToken = refreshData?.session?.access_token;
  check('refreshSession() issues a new access token', !refreshErr && !!newToken && newToken !== token, refreshErr?.message);
  const afterRefresh = await call('/labours', { useToken: newToken });
  check('API accepts the refreshed token', afterRefresh.ok, `status ${afterRefresh.status}`);
  token = newToken;
} catch (err) {
  check('unexpected error during test suite', false, err?.message || String(err));
} finally {
  // ---- cleanup: runs on success, on failed checks, AND on unexpected errors ----
  console.log('\n== cleanup ==');
  if (tid) {
    try {
      const del = await call(`/labours/${tid}`, { method: 'DELETE' });
      check('DELETE temporary labour -> 200 (attendance cascaded)', del.ok, `status ${del.status}`);
    } catch (cleanupErr) {
      check('DELETE temporary labour (cleanup)', false, cleanupErr?.message || String(cleanupErr));
    }
  } else {
    check('no temporary labour to clean up (creation never succeeded)', true);
  }
  await new Promise((r) => setTimeout(r, 300));
  check('labours + attendance tables restored to baseline', snapshot() === before);
}

// ---- 8. logout ----
console.log('\n== logout ==');
const { error: signOutErr } = await supabase.auth.signOut();
check('signOut() succeeds', !signOutErr, signOutErr?.message);

// ---- summary ----
const failed = results.filter((r) => !r.pass);
console.log(`\n${'='.repeat(50)}\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('FAILED:');
  failed.forEach((f) => console.log('  - ' + f.name + (f.detail ? ' (' + f.detail + ')' : '')));
  process.exit(1);
}
