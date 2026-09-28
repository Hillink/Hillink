import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileStore } from '../store.mjs';

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
