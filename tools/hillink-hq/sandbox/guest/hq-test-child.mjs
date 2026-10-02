// One acceptance file's test process (Pass 4.5 test-process isolation). HQ's controller (hq-test-runner.mjs) starts
// one of these per acceptance file, sends it a per-file key derived from HQ's run key on stdin, and attributes what
// it reports to the file it launched. This process:
//   1. reads its key from stdin before any repository code loads and keeps it only inside this module's closure;
//   2. runs exactly one file with node:test's run() and counts the events itself;
//   3. when the run ends normally, writes one line: HQ-CHILD <json> <mac>, the mac keyed with (1).
// Exiting early, crashing, hanging or closing stdout leaves no valid line, and the controller fails the file.
//
// Hardening: Node's permission model (reads of /work and this file only; no writes, child processes, workers,
// inspector, addons or native bindings) and --frozen-intrinsics. Heap snapshots, V8 flags, object queries and module
// hooks are disabled before repository code loads, and node:test and node:assert are frozen.
import fs from 'node:fs';
import crypto from 'node:crypto';
import v8 from 'node:v8';
import module from 'node:module';
import path from 'node:path';
import test, { run } from 'node:test';
import stream from 'node:stream';
import events from 'node:events';
import assert from 'node:assert';
import strict from 'node:assert/strict';

const writeSync = fs.writeSync, hash = crypto.hash, stringify = JSON.stringify, exit = process.exit.bind(process);
const out = s => { try { writeSync(1, s); } catch { /* stdout closed: no result, fails closed */ } };

// Node 24+ only: Node 22 reports node:test events differently. Same check as node-version.mjs, inlined (standalone).
if (!(Number(process.versions.node.split('.')[0]) >= 24)) { out(`HQ-CHILD-ERROR: Node ${process.versions.node} is not supported (Node 24+ required); refusing to run.\n`); process.exit(99); }

// 1. The key: exactly 64 hex characters on stdin, read before anything else.
let key = '';
try { const b = Buffer.alloc(200); const n = fs.readSync(0, b, 0, 200, null); key = b.toString('utf8', 0, n).trim(); } catch { /* none */ }
if (!/^[0-9a-f]{64}$/.test(key)) { out('HQ-CHILD-ERROR: no valid key on stdin; refusing to run.\n'); exit(97); }
const mac = payload => hash('sha256', `${key}:${hash('sha256', `${key}:${payload}`)}`);

// 2. Close the ways repository code could read the key or change what this runner observes.
const refuse = name => () => { throw Object.assign(Error(`${name} is disabled in HQ's test sandbox`), { code: 'ERR_HQ_DISABLED' }); };
for (const f of ['getHeapSnapshot', 'writeHeapSnapshot', 'setFlagsFromString', 'queryObjects', 'takeCoverage', 'stopCoverage']) if (f in v8) v8[f] = refuse(`v8.${f}`);
for (const f of ['register', 'registerHooks']) if (f in module) module[f] = refuse(`module.${f}`);
for (const o of [v8, module, test, assert, strict, assert.strict]) Object.freeze(o);
module.syncBuiltinESMExports();

// 3. Run the one acceptance file (validated by the controller and HQ: repository-relative, no "..", no options).
const files = process.argv.slice(2);
if (files.length !== 1 || files.some(f => f.startsWith('-') || path.isAbsolute(f) || f.split(/[\\/]/).includes('..'))) { out('HQ-CHILD-ERROR: expected exactly one test file.\n'); exit(98); }
const root = process.cwd();
const rel = f => (typeof f === 'string' && f.startsWith(root + path.sep) ? f.slice(root.length + 1).split(path.sep).join('/') : null);
const totals = { passed: 0, failed: 0, skipped: 0, todo: 0, cancelled: 0, outside: 0 };
const short = v => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, 300);

const launched = path.join(root, files[0]);
const results = run({ files: [launched], isolation: 'none', concurrency: 1 });

// 4. Lock the objects this runner's view of the run depends on, before repository code loads (run() imports the file
//    asynchronously, after this synchronous block). These are the prototypes that carry node:test's events to the
//    listener below: node:test's own reporter stream class and the stream and event-emitter classes it builds on,
//    plus their module exports. Each writable data property becomes an accessor: reading is unchanged, assigning on
//    an instance creates an own property on that instance (so ordinary code that sets its own fields keeps working),
//    and assigning on the locked object itself throws.
const locked = new WeakSet();
function lock(obj) {
  if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function') || locked.has(obj)) return;
  locked.add(obj);
  for (const key of Reflect.ownKeys(obj)) {
    const d = Object.getOwnPropertyDescriptor(obj, key);
    if (!d || !('value' in d) || !d.writable) continue;
    const value = d.value;
    if (!d.configurable) {
      // Cannot become an accessor. Functions are made read-only; non-function fields (flags such as the emitter's
      // capture setting, which Node assigns on instances) stay writable so instances keep working.
      if (typeof value === 'function') Object.defineProperty(obj, key, { writable: false });
      continue;
    }
    Object.defineProperty(obj, key, {
      enumerable: d.enumerable, configurable: false,
      get() { return value; },
      set(v) {
        if (this === obj) throw new TypeError(`Cannot assign to read only property '${String(key)}' of HQ's locked test runner objects`);
        Object.defineProperty(this, key, { value: v, writable: true, enumerable: true, configurable: true });
      },
    });
  }
  Object.preventExtensions(obj);
}
const classes = new Set();
for (let p = Object.getPrototypeOf(results); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) { classes.add(p); classes.add(p.constructor); }
for (const C of [stream, stream.Stream, stream.Readable, stream.Writable, stream.Duplex, stream.Transform, stream.PassThrough, events, events.EventEmitter]) { classes.add(C); if (C?.prototype) classes.add(C.prototype); }
for (const o of classes) lock(o);
Object.defineProperties(results, Object.fromEntries(['emit', 'on', 'push', 'read'].map(k => [k, { value: results[k], writable: false, configurable: false }])));
let success = null; // node:test's own verdict for the whole run (false after e.g. an uncaught error once a test ended)
results.on('data', e => {
  if (e.type === 'test:summary' && e.data.file === undefined) { success = e.data.success === true && success !== false; return; }
  if (e.type === 'test:diagnostic' && /uncaughtException|unhandledRejection/.test(String(e.data.message))) { success = false; out(`#   ${short(e.data.message)}\n`); return; }
  if (e.type !== 'test:pass' && e.type !== 'test:fail') return;
  const d = e.data, f = rel(d.file);
  let kind;
  // node:test reports a file that defines no tests as one passing "test" named after the file: that proves nothing.
  // Node 22 omits data.file on that event and Node 24 sets it, so match the launched path itself, not data.file.
  if (e.type === 'test:pass' && (d.name === launched || d.name === d.file || (d.nesting === 0 && d.file == null))) { out(`not ok - ${short(files[0])} defines no tests\n`); return; }
  // Only a test that node:test attributes to the launched file can pass it. A pass with no file or from another file
  // (a helper, or an event whose shape this Node version reports differently) proves nothing about this file.
  if (e.type === 'test:pass' && f !== files[0]) { totals.outside++; out(`# ignored pass outside ${short(files[0])}: ${short(d.name)}\n`); return; }
  if (d.skip !== undefined && d.skip !== false) kind = 'skipped';
  else if (d.todo !== undefined && d.todo !== false) kind = 'todo';
  else if (e.type === 'test:fail' && d.details?.error?.failureType === 'cancelledByParent') kind = 'cancelled';
  else kind = e.type === 'test:pass' ? 'passed' : 'failed';
  totals[kind]++;
  if (f !== files[0]) totals.outside++; // a failure from elsewhere still fails this file
  const where = f ?? 'outside the repository';
  out(`${kind === 'passed' ? 'ok' : 'not ok'} - ${short(d.name)} (${where}${kind === 'passed' || kind === 'failed' ? '' : `, ${kind}`})\n`);
  if (kind === 'failed' || kind === 'cancelled') out(`#   ${short(d.details?.error?.cause?.message ?? d.details?.error?.message)}\n`);
});
results.on('end', () => {
  // Everything this process ran is attributed to the file it was launched for; the reported file names are shown only.
  const payload = stringify({ v: 1, file: files[0], completed: true, success: success === true, ...totals });
  out(`HQ-CHILD ${payload} ${mac(payload)}\n`);
  exit(0);
});
