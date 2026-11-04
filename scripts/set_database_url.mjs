#!/usr/bin/env node
/* Securely set DATABASE_URL (Supabase PostgreSQL connection string) in the
 * root .env. The connection string contains your database password, so the
 * input is hidden and the value is never printed, logged, or stored anywhere
 * except the git-ignored .env file.
 *
 * Where to get it:
 *   Supabase Dashboard -> Project Settings -> Database -> Connection string
 *   Use the "Session pooler" URI (port 5432) or the direct connection.
 *   Format: postgresql://postgres.<project-ref>:YOUR-DB-PASSWORD@host:5432/postgres
 *
 * Usage:  node scripts/set_database_url.mjs
 */
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const URL_RE = /^postgres(ql)?:\/\//i;

if (!fs.existsSync(envPath)) {
  console.error('x .env not found at the project root. Copy .env.example to .env first.');
  process.exit(1);
}

// hidden prompt: the interface always uses the real process.stdout (readline
// terminal mode requires output.on()); echo suppression is done by overriding
// readline's output writer after the question is registered — identical to
// scripts/auth_smoke_test.mjs.
function askHidden(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    process.stdout.write(query); // prompt shown once, before echo suppression
    rl.question('', (answer) => {
      rl.history = rl.history.slice(1); // keep the value out of readline history
      rl.close();
      resolve(answer);
    });
    rl._writeToOutput = () => {}; // swallow every write after the prompt
  });
}

function setKey(text, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.replace(/\s*$/, '\n')}${key}=${value}\n`;
}

async function main() {
  console.log('Supabase PostgreSQL connection string setup');
  console.log('-------------------------------------------');
  console.log('Get it from: Supabase Dashboard -> Project Settings -> Database');
  console.log('-> Connection string -> "Session pooler" (recommended) URI.');
  console.log('(input is hidden — nothing will appear as you type or paste)\n');

  let url = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    url = (await askHidden('DATABASE_URL (input hidden): ')).trim().replace(/^["']+|["']+$/g, '');
    if (URL_RE.test(url) && url.includes('@')) break;
    console.log(`\nx That does not look like a PostgreSQL connection string (expected postgresql://user:PASSWORD@host:5432/postgres). Attempt ${attempt}/3.\n`);
    if (attempt === 3) {
      console.error('x Too many invalid attempts. Nothing was changed.');
      process.exit(1);
    }
  }

  const before = fs.readFileSync(envPath, 'utf8');
  const after = setKey(before, 'DATABASE_URL', url);
  fs.writeFileSync(envPath, after, { mode: 0o600 });

  // ---- verification (prints nothing sensitive) ----
  const reread = fs.readFileSync(envPath, 'utf8');
  const linesBefore = before.split('\n');
  const linesAfter = reread.split('\n');
  const stored = (reread.match(/^DATABASE_URL=(.*)$/m) || [])[1] || '';

  let othersIdentical = linesBefore.length === linesAfter.length;
  if (othersIdentical) {
    for (let i = 0; i < linesBefore.length; i++) {
      if (linesBefore[i] !== linesAfter[i] && !linesBefore[i].startsWith('DATABASE_URL=')) {
        othersIdentical = false;
        break;
      }
    }
  }

  let ignored = false;
  try { execSync('git check-ignore -q .env', { cwd: root, stdio: 'ignore' }); ignored = true; } catch { ignored = false; }

  console.log('\nResult');
  console.log('------');
  console.log(`${othersIdentical ? 'OK' : 'FAIL'}  all other .env lines unchanged (${linesAfter.length} lines total)`);
  console.log(`${stored.startsWith('postgres') ? 'OK' : 'FAIL'}  DATABASE_URL set (value hidden)`);
  console.log(`${ignored ? 'OK' : 'FAIL'}  .env is git-ignored (verified with git check-ignore)`);

  if (othersIdentical && stored.startsWith('postgres') && ignored) {
    console.log('\nConfiguration successful. The connection string itself is never displayed.');
  } else {
    console.log('\nx Something failed — fix the FAIL line above or restore .env from a copy.');
    process.exit(1);
  }
}

main().catch((e) => { console.error('x Failed:', e.message); process.exit(1); });
