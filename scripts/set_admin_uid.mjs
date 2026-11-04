#!/usr/bin/env node
/* Securely set ADMIN_UID (+ its client copy VITE_ADMIN_UID) in the root .env.
 *
 * Usage (run yourself in Git Bash or PowerShell):
 *     node scripts/set_admin_uid.mjs
 *
 * - Input is hidden: typed characters are never echoed to the terminal.
 * - The value is never printed, logged, or stored anywhere except .env
 *   (which is git-ignored).
 * - Every other line of .env is preserved byte-for-byte (verified after write).
 */
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';

if (!fs.existsSync(envPath)) {
  console.error('x .env not found at the project root. Copy .env.example to .env first.');
  process.exit(1);
}

// prompt with fully suppressed echo (like a sudo password prompt)
// hidden prompt, Node 24 / Windows PowerShell compatible:
// the interface ALWAYS uses the real process.stdout (readline terminal mode
// requires output.on() — a bare { write } object throws TypeError). Password
// hiding is done by overriding readline's output writer immediately after the
// question is registered, so echoed characters are never written to the
// terminal. The prompt itself is written once, before the override.
function askHidden(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout, // real stream — required by readline terminal mode
      terminal: true,
    });
    process.stdout.write(query); // prompt shown once, before echo suppression
    rl.question('', (answer) => {
      rl.history = rl.history.slice(1); // keep the value out of readline history
      rl.close();
      resolve(answer);
    });
    // swallow every readline write after the prompt: typed characters are
    // never echoed to the terminal
    rl._writeToOutput = () => {};
  });
}

function setKey(text, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.replace(/\s*$/, '\n')}${key}=${value}\n`;
}

async function main() {
  console.log('Supabase administrator UID setup');
  console.log('--------------------------------');
  console.log('Paste the UID copied from: Supabase Dashboard -> Authentication -> Users');
  console.log('(input is hidden — nothing will appear as you type or paste)\n');

  let uid = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    uid = (await askHidden('Administrator UID: ')).trim().replace(/^["'`]+|["'`]+$/g, '');
    if (UUID_RE.test(uid)) break;
    if (!uid) continue;
    console.log(`\nx That does not look like a Supabase user UID (expected a UUID such as 8a1b2c3d-e4f5-6789-abcd-ef0123456789). Attempt ${attempt}/3.\n`);
    if (attempt === 3) {
      console.error('x Too many invalid attempts. Nothing was changed.');
      process.exit(1);
    }
  }
  if (!UUID_RE.test(uid)) {
    console.error('x No UID entered. Nothing was changed.');
    process.exit(1);
  }

  const before = fs.readFileSync(envPath, 'utf8');
  const after = setKey(setKey(before, 'ADMIN_UID', uid), 'VITE_ADMIN_UID', uid);
  fs.writeFileSync(envPath, after, { mode: 0o600 });

  // ---- verification (prints nothing sensitive) ----
  const reread = fs.readFileSync(envPath, 'utf8');
  const linesBefore = before.split('\n');
  const linesAfter = reread.split('\n');

  const touched = new Set(['ADMIN_UID', 'VITE_ADMIN_UID']);
  let othersIdentical = linesBefore.length === linesAfter.length;
  if (othersIdentical) {
    for (let i = 0; i < linesBefore.length; i++) {
      const keyB = linesBefore[i].split('=')[0];
      const keyA = linesAfter[i].split('=')[0];
      if (linesBefore[i] !== linesAfter[i] && !touched.has(keyB)) { othersIdentical = false; break; }
    }
  }

  const getValue = (text, key) => (text.match(new RegExp(`^${key}=(.*)$`, 'm')) || [])[1];
  const adminUid = getValue(reread, 'ADMIN_UID');
  const viteUid = getValue(reread, 'VITE_ADMIN_UID');

  console.log('\nResult');
  console.log('------');
  console.log(`${othersIdentical ? 'OK' : 'FAIL'}  all other .env lines unchanged (${linesAfter.length - 2} other lines)`);
  console.log(`${adminUid && adminUid !== PLACEHOLDER && UUID_RE.test(adminUid) ? 'OK' : 'FAIL'}  ADMIN_UID set to a valid non-placeholder value (value hidden)`);
  console.log(`${adminUid === viteUid ? 'OK' : 'FAIL'}  VITE_ADMIN_UID matches ADMIN_UID (client-side UX copy)`);

  let ignored = false;
  try { execSync('git check-ignore -q .env', { cwd: root, stdio: 'ignore' }); ignored = true; } catch { ignored = false; }
  console.log(`${ignored ? 'OK' : 'FAIL'}  .env is git-ignored (verified with git check-ignore)`);

  if (othersIdentical && adminUid && adminUid !== PLACEHOLDER && adminUid === viteUid && ignored) {
    console.log('\nConfiguration successful. The UID itself is never displayed.');
  } else {
    console.log('\nx Something failed — restore .env from the backup copy or fix the FAIL line above.');
    process.exit(1);
  }
}

main().catch((e) => { console.error('x Failed:', e.message); process.exit(1); });
