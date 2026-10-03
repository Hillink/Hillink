// HQ's acceptance-test controller (Pass 4.5 test-process isolation). This process never loads repository code.
//   1. HQ sends a fresh random run key on stdin; this file reads it and keeps it inside its own process.
//   2. For each acceptance file it starts one isolated test process (hq-test-child.mjs) with a per-file key derived
//      from the run key, sent on that child's stdin. The run key itself never enters a process that runs tests.
//   3. It accepts a child's result only when it carries a valid mac under that file's key, names that file, and the
//      child exited cleanly. The result is attributed to the file this controller launched, not to any file name
//      reported by the test run. Anything else fails that file.
//   4. It writes the single result HQ verifies (test-verdict.mjs): HQ-RESULT <json> <mac>, keyed with the run key.
// Child output is forwarded for humans; lines starting with "HQ-" are withheld, and any result-like line a child did
// not legitimately issue fails its file.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const writeSync = fs.writeSync, hash = crypto.hash;
const out = s => { try { writeSync(1, s); } catch { /* stdout closed: no result, fails closed */ } };

// Node 24+ only: Node 22 reports node:test events differently. Same check as node-version.mjs, inlined (standalone).
if (!(Number(process.versions.node.split('.')[0]) >= 24)) { out(`HQ-RUNNER: Node ${process.versions.node} is not supported (Node 24+ required); refusing to run.\n`); process.exit(99); }
let key = '';
try { const b = Buffer.alloc(200); const n = fs.readSync(0, b, 0, 200, null); key = b.toString('utf8', 0, n).trim(); } catch { /* none */ }
if (!/^[0-9a-f]{64}$/.test(key)) { out('HQ-RUNNER: no valid run key on stdin; refusing to run.\n'); process.exit(97); }
const macWith = (k, payload) => hash('sha256', `${k}:${hash('sha256', `${k}:${payload}`)}`);
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const fileKey = (runKey, index, file) => hash('sha256', `hq-test-file:${runKey}:${index}:${file}`);

const files = process.argv.slice(2);
if (!files.length || files.some(f => f.startsWith('-') || path.isAbsolute(f) || f.split(/[\\/]/).includes('..')) || new Set(files).size !== files.length) { out('HQ-RUNNER: bad test file list.\n'); process.exit(98); }

const root = process.cwd();
// fileURLToPath, not URL.pathname: correct on native Windows (drive letters, backslashes) and with spaces (%20).
const CHILD = fileURLToPath(new URL('./hq-test-child.mjs', import.meta.url));
// The child gets the controller's own hardening flags (minus child-process rights) and may read only /work and its script.
const passThrough = process.execArgv.filter(a => a === '--experimental-strip-types');
const childArgs = ['--frozen-intrinsics', '--no-warnings', ...passThrough, '--permission', `--allow-fs-read=${root}`, `--allow-fs-read=${CHILD}`, CHILD];
const count = v => (Number.isSafeInteger(v) && v >= 0 ? v : NaN);

function runChild(file, index) {
  const k = fileKey(key, index, file);
  return new Promise(resolve => {
    let child;
    try { child = spawn(process.execPath, [...childArgs, file], { cwd: root, stdio: ['pipe', 'pipe', 'inherit'], env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '/tmp', LANG: 'C.UTF-8' } }); }
    catch (error) { resolve({ ok: false, reason: `could not start the test process (${error.code ?? error.message})` }); return; }
    const chunks = [];
    child.stdout.on('data', c => chunks.push(c));
    child.stdin.on('error', () => {});
    child.stdin.end(`${k}\n`);
    child.on('error', error => resolve({ ok: false, reason: `test process error (${error.code ?? error.message})` }));
    child.on('close', (code, signal) => {
      const lines = Buffer.concat(chunks).toString('utf8').split(/\r?\n/);
      const results = [], stray = [];
      for (const line of lines) {
        if (!line.startsWith('HQ-')) { if (line) out(`${line}\n`); continue; }
        const m = /^HQ-CHILD (\{.*\}) ([0-9a-f]{64})$/.exec(line);
        if (m && safeEqual(m[2], macWith(k, m[1]))) results.push(m[1]); else stray.push(line);
      }
      if (stray.length) out(`# ${stray.length} result-like line(s) from ${file} withheld\n`);
      if (code !== 0 || signal) return resolve({ ok: false, reason: `the test process did not exit cleanly (${signal ?? `exit ${code}`})` });
      if (stray.length) return resolve({ ok: false, reason: 'the test output contained results HQ did not issue' });
      if (results.length !== 1) return resolve({ ok: false, reason: results.length ? 'more than one result' : 'no authenticated result from the test process' });
      let r; try { r = JSON.parse(results[0]); } catch { return resolve({ ok: false, reason: 'unreadable result' }); }
      const n = { passed: count(r.passed), failed: count(r.failed), skipped: count(r.skipped), todo: count(r.todo), cancelled: count(r.cancelled), outside: count(r.outside) };
      if (r.v !== 1 || r.file !== file || r.completed !== true || Object.values(n).some(Number.isNaN)) return resolve({ ok: false, reason: 'malformed result' });
      resolve({ ok: true, success: r.success === true, ...n });
    });
  });
}

const perFile = Object.create(null), errors = Object.create(null);
const totals = { passed: 0, failed: 0, skipped: 0, todo: 0, cancelled: 0, outside: 0 };
let success = true;
for (const [i, f] of files.entries()) {
  const r = await runChild(f, i);
  if (!r.ok) {
    out(`not ok - ${f}: ${r.reason}\n`);
    perFile[f] = { passed: 0, failed: 1, skipped: 0, todo: 0 }; errors[f] = r.reason;
    totals.failed++; success = false; continue;
  }
  perFile[f] = { passed: r.passed, failed: r.failed, skipped: r.skipped, todo: r.todo };
  for (const k of Object.keys(totals)) totals[k] += r[k];
  if (!r.success) success = false;
}
const payload = JSON.stringify({ v: 1, completed: true, success, files: perFile, errors, ...totals });
out(`# HQ verified: ${success ? '' : 'run reported errors; '}${totals.passed} passed, ${totals.failed} failed, ${totals.skipped} skipped, ${totals.todo} todo, ${totals.cancelled} cancelled\n`);
out(`HQ-RESULT ${payload} ${macWith(key, payload)}\n`);
process.exit(0);
