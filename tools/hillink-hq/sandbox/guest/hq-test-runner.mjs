// HQ's acceptance-test runner (Pass 4.5 repair). HQ never trusts test output: node:test's TAP, its "# pass" summary
// and the exit code are all written by the process that also runs repository code, so that code could print a
// forged report and exit before the real reporter runs (found by Codex's audit). Instead:
//   1. HQ sends a fresh random key on stdin. This file reads it before any repository code loads and keeps it only
//      inside this module's closure.
//   2. Repository code is loaded by node:test's run() in this process, and this file counts the events itself.
//   3. Only when the run ends normally does it write one line: HQ-RESULT <json> <mac>, the mac keyed with (1).
// HQ accepts a result only with a valid mac, so printed text cannot forge success, and exiting early, crashing,
// hanging or closing stdout leaves no valid result: the run fails closed.
//
// Hardening for the in-process part: the process runs under Node's permission model (reads of /work and this file
// only; no writes, child processes, workers, inspector, addons or native bindings) and with --frozen-intrinsics.
// Heap snapshots, V8 flags, object queries and module hooks, which could reveal the key or rewrite this runner's
// view of the run, are disabled before repository code loads. node:test and node:assert are frozen so repository
// code cannot replace their functions.
import fs from 'node:fs';
import crypto from 'node:crypto';
import v8 from 'node:v8';
import module from 'node:module';
import path from 'node:path';
import test, { run } from 'node:test';
import assert from 'node:assert';
import strict from 'node:assert/strict';

const writeSync = fs.writeSync, hash = crypto.hash, stringify = JSON.stringify, exit = process.exit.bind(process);
const out = s => { try { writeSync(1, s); } catch { /* stdout closed: no result, fails closed */ } };

// 1. The key: exactly 64 hex characters on stdin, read before anything else.
let key = '';
try { const b = Buffer.alloc(200); const n = fs.readSync(0, b, 0, 200, null); key = b.toString('utf8', 0, n).trim(); } catch { /* none */ }
if (!/^[0-9a-f]{64}$/.test(key)) { out('HQ-RUNNER: no valid run key on stdin; refusing to run.\n'); exit(97); }
const mac = payload => hash('sha256', `${key}:${hash('sha256', `${key}:${payload}`)}`);

// 2. Close the ways repository code could read the key or change what this runner observes.
const refuse = name => () => { throw Object.assign(Error(`${name} is disabled in HQ's test sandbox`), { code: 'ERR_HQ_DISABLED' }); };
for (const f of ['getHeapSnapshot', 'writeHeapSnapshot', 'setFlagsFromString', 'queryObjects', 'takeCoverage', 'stopCoverage']) if (f in v8) v8[f] = refuse(`v8.${f}`);
for (const f of ['register', 'registerHooks']) if (f in module) module[f] = refuse(`module.${f}`);
for (const o of [v8, module, test, assert, strict, assert.strict]) Object.freeze(o);
module.syncBuiltinESMExports();

// 3. Run the acceptance files (validated by HQ: repository-relative, no "..", no options).
const files = process.argv.slice(2);
if (!files.length || files.some(f => f.startsWith('-') || path.isAbsolute(f) || f.split(/[\\/]/).includes('..'))) { out('HQ-RUNNER: bad test file list.\n'); exit(98); }
const root = process.cwd();
const rel = f => (typeof f === 'string' && f.startsWith(root + path.sep) ? f.slice(root.length + 1).split(path.sep).join('/') : null);
const perFile = Object.create(null);
for (const f of files) perFile[f] = { passed: 0, failed: 0, skipped: 0, todo: 0 };
const totals = { passed: 0, failed: 0, skipped: 0, todo: 0, cancelled: 0, outside: 0 };
const short = v => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, 300);

const stream = run({ files: files.map(f => path.join(root, f)), isolation: 'none', concurrency: 1 });
// Own, non-writable properties so later prototype changes cannot reroute this stream's events.
Object.defineProperty(stream, 'emit', { value: stream.emit, writable: false, configurable: false });
let success = null; // node:test's own verdict for the whole run (false after e.g. an uncaught error once a test ended)
stream.on('data', e => {
  if (e.type === 'test:summary' && e.data.file === undefined) { success = e.data.success === true && success !== false; return; }
  if (e.type === 'test:diagnostic' && /uncaughtException|unhandledRejection/.test(String(e.data.message))) { success = false; out(`#   ${short(e.data.message)}\n`); return; }
  if (e.type !== 'test:pass' && e.type !== 'test:fail') return;
  const d = e.data, f = rel(d.file), bucket = f && perFile[f] ? perFile[f] : null;
  let kind;
  // node:test reports a file that defines no tests as one passing "test" named after the file: that proves nothing.
  if (e.type === 'test:pass' && d.name === d.file) { out(`not ok - ${short(f ?? 'a file')} defines no tests\n`); return; }
  if (d.skip !== undefined && d.skip !== false) kind = 'skipped';
  else if (d.todo !== undefined && d.todo !== false) kind = 'todo';
  else if (e.type === 'test:fail' && d.details?.error?.failureType === 'cancelledByParent') kind = 'cancelled';
  else kind = e.type === 'test:pass' ? 'passed' : 'failed';
  totals[kind]++;
  if (bucket && kind !== 'cancelled') bucket[kind]++;
  if (!bucket) totals.outside++;
  const where = f ?? 'outside the acceptance files';
  out(`${kind === 'passed' ? 'ok' : 'not ok'} - ${short(d.name)} (${where}${kind === 'passed' || kind === 'failed' ? '' : `, ${kind}`})\n`);
  if (kind === 'failed' || kind === 'cancelled') out(`#   ${short(d.details?.error?.cause?.message ?? d.details?.error?.message)}\n`);
});
stream.on('end', () => {
  const payload = stringify({ v: 1, completed: true, success: success === true, files: perFile, ...totals });
  out(`# HQ verified: ${success === true ? '' : 'run reported errors; '}${totals.passed} passed, ${totals.failed} failed, ${totals.skipped} skipped, ${totals.todo} todo, ${totals.cancelled} cancelled\n`);
  out(`HQ-RESULT ${payload} ${mac(payload)}\n`);
  exit(0);
});
