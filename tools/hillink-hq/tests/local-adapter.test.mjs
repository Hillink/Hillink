import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { LocalAdapter } from '../local-adapter.mjs';

async function fixture(onSignal) {
  const child = new EventEmitter(); child.stderr = new EventEmitter();
  const signals = [], events = [];
  child.kill = signal => { signals.push(signal); return onSignal(child, signal); };
  const adapter = new LocalAdapter({ spawnWorker: () => child, cancelGraceMs: 10 });
  await adapter.start({ task: { operation: 'inspect-repo', safety: 'local-read-only' }, runId: 'run', emit: e => events.push(e) });
  return { adapter, child, signals, events };
}

test('cooperative cancellation confirms close without force escalation', async () => {
  const f = await fixture((child, signal) => { queueMicrotask(() => child.emit('close', null, signal)); return true; });
  assert.equal(await f.adapter.cancel('run'), true);
  assert.deepEqual(f.signals, ['SIGTERM']);
  assert.equal(f.events.at(-1).kind, 'CANCELLED');
});

test('ignored SIGTERM escalates once; concurrent cancels wait for actual close', async () => {
  const f = await fixture((child, signal) => {
    if (signal === 'SIGKILL') queueMicrotask(() => child.emit('close', null, signal));
    return true;
  });
  assert.deepEqual(await Promise.all([f.adapter.cancel('run'), f.adapter.cancel('run')]), [true, true]);
  assert.deepEqual(f.signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(f.events.filter(e => e.kind === 'CANCELLED').length, 1);
});

test('accepted kill without close cannot report stopped or release worker tracking', async () => {
  const f = await fixture(() => true);
  assert.equal(await f.adapter.cancel('run'), false);
  assert.deepEqual(f.signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(f.events.length, 0);
  assert.equal(f.adapter.children.has('run'), true);
  f.child.emit('message', { kind: 'COMPLETED' });
  assert.equal(f.events.length, 0);
  f.child.emit('close', null, 'SIGKILL');
  assert.equal(f.events.at(-1).kind, 'CANCELLED');
});

test('signal errors and missing pre-restart workers fail closed', async () => {
  const f = await fixture(() => { throw Error('signal denied'); });
  assert.equal(await f.adapter.cancel('run'), false);
  assert.deepEqual(f.signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(await f.adapter.cancel('unknown'), false);
  assert.equal(f.events.length, 0);
});
