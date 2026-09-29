import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileStore } from '../store.mjs';
import { unlock } from '../unlock.mjs';

test('durable log survives reopening; second controller fails closed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hillink-hq-'));
  try {
    const a = new FileStore(dir);
    const event = { seq: 1, id: 'event-1', at: 1000, type: 'TEST', data: {} };
    a.append(event); assert.throws(() => new FileStore(dir), /lock exists/); a.close();
    const b = new FileStore(dir); assert.deepEqual(b.read(), [event]); b.close();
  } finally { fs.rmSync(dir, { recursive: true }); }
});
test('truncated journal is not silently treated as idle/empty', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hillink-hq-'));
  try {
    fs.writeFileSync(path.join(dir, 'events.jsonl'), '{"seq":1');
    assert.throws(() => new FileStore(dir), /Incomplete/);
    assert.equal(fs.existsSync(path.join(dir, 'controller.lock')), false);
  } finally { fs.rmSync(dir, { recursive: true }); }
});
test('stale-lock helper refuses live controllers and preserves the evidence journal', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hillink-hq-'));
  try {
    const store = new FileStore(dir);
    assert.throws(() => unlock(dir), /still exists/); store.close();
    // An absent PID exercises the real OS existence probe without starting a child.
    fs.writeFileSync(path.join(dir, 'controller.lock'), JSON.stringify({ pid: 2_147_483_647 }));
    unlock(dir); assert.equal(fs.existsSync(path.join(dir, 'controller.lock')), false);
    assert.equal(fs.existsSync(path.join(dir, 'events.jsonl')), true);
  } finally { fs.rmSync(dir, { recursive: true }); }
});
