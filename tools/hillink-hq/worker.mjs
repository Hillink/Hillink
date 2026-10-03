import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const operation = process.argv[2];
const started = Date.now();
const send = event => process.send?.(event);
send({ kind: 'ACK', summary: `Worker process ${process.pid} acknowledged ${operation}.` });
const heartbeat = setInterval(() => send({ kind: 'HEARTBEAT', summary: `Worker process ${process.pid} alive.` }), 3000);
heartbeat.unref();
process.channel?.unref();
let failed = false;
try {
  if (operation === 'inspect-repo') {
    const files = [];
    const walk = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else files.push(path.relative(root, full).replaceAll('\\', '/')); } };
    for (const dir of ['app', 'lib']) walk(path.join(root, dir));
    send({ kind: 'FINDING', summary: `Inspected ${files.length} repository source paths in app/ and lib/. File inventory only; not a code-quality verdict.`, files: files.slice(0, 100) });
  } else if (['verify-hq', 'verify-unit'].includes(operation)) {
    const directory = operation === 'verify-hq' ? path.join(root, 'tools/hillink-hq/tests') : path.join(root, 'tests/unit');
    const files = fs.readdirSync(directory).filter(name => operation === 'verify-hq' ? ['engine.test.mjs', 'store.test.mjs'].includes(name) : name.endsWith('.test.ts')).map(name => path.join(directory, name));
    if (!files.length) throw Error('No test files found');
    // A single slow test prints nothing until it ends: the run is a declared quiet phase with a hard bound.
    send({ kind: 'TEST_STARTED', summary: `Running ${files.length} test files with Node's test runner.`, phases: [{ id: 'tests', state: 'begin', reason: 'Node test run', boundMs: 10 * 60_000 }] });
    // No child test processes: cancellation can be confirmed without an orphaned tree.
    const stream = run({ files, isolation: 'none', concurrency: false });
    let passed = 0, failures = 0, lastProgressAt = 0;
    for await (const event of stream) {
      if (event.type === 'test:pass') passed++;
      if (event.type === 'test:fail') { failures++; send({ kind: 'FINDING', summary: `Test failed: ${event.data.name}` }); }
      if (['test:pass', 'test:fail'].includes(event.type) && Date.now() - lastProgressAt >= 1000) {
        send({ kind: 'TEST_PROGRESS', completedTests: passed + failures, summary: `${passed} tests passed; ${failures} tests failed so far.` });
        lastProgressAt = Date.now();
      }
    }
    if (passed + failures === 0) throw Error('Test runner produced no test results');
    send({ kind: 'TEST_RESULT', result: failures > 0 ? 'failed' : 'passed', summary: `${passed} passed; ${failures} failed.`, phases: [{ id: 'tests', state: 'end' }], files: files.map(file => path.relative(root, file).replaceAll('\\', '/')) });
    // A completed verification with failing assertions is useful evidence, not a worker crash.
    process.exitCode = 0;
  } else throw Error('Operation is not allowlisted');
} catch (error) {
  failed = true;
  send({ kind: 'FINDING', summary: `Local check failed: ${error.message}` });
} finally {
  clearInterval(heartbeat);
  send({ kind: 'USAGE', summary: 'Measured worker elapsed time and final process memory; provider cost/credits unavailable.', usage: { source: 'node-process', elapsedMs: Date.now() - started, rssBytes: process.memoryUsage().rss, cpuMicroseconds: process.cpuUsage().user + process.cpuUsage().system } });
  process.exitCode = failed ? 1 : 0;
  process.disconnect?.();
}
