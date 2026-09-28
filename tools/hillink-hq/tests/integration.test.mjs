import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHQ } from '../server.mjs';
import { MemoryStore } from '../store.mjs';
import http from 'node:http';

test('real HTTP → dispatch → process evidence → completion; hostile browser requests refused', async () => {
  const hq = await createHQ({ port: 0, store: new MemoryStore(), intervalMs: 20 });
  try {
    const headers = { 'X-HQ-Client': 'command-center' };
    assert.equal((await fetch(`${hq.origin}/api/state`)).status, 403);
    assert.equal((await fetch(`${hq.origin}/api/session`, { headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
    const hostileHost = await new Promise((resolve, reject) => {
      http.get(`${hq.origin}/api/session`, { headers: { ...headers, Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
    });
    assert.equal(hostileHost, 403);
    const session = await fetch(`${hq.origin}/api/session`, { headers }).then(r => r.json());
    headers.Authorization = `Bearer ${session.token}`;
    assert.equal((await fetch(`${hq.origin}/api/tasks`, { method: 'POST', headers: { ...headers, Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    const result = await fetch(`${hq.origin}/api/tasks`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Inspect actual repository', description: 'Integration proof', operation: 'inspect-repo', priority: 50, safety: 'local-read-only' }) });
    assert.equal(result.status, 201); const { id } = await result.json();
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && hq.engine.state.tasks[id].stage !== 'DONE') await new Promise(resolve => setTimeout(resolve, 30));
    const task = hq.engine.state.tasks[id];
    assert.equal(task.stage, 'DONE');
    assert.ok(task.evidence.some(e => e.kind === 'ACK'));
    assert.ok(task.evidence.some(e => e.kind === 'FINDING' && e.files.length > 0));
    assert.ok(task.evidence.some(e => e.kind === 'USAGE' && e.usage.elapsedMs >= 0));
    const state = await fetch(`${hq.origin}/api/state`, { headers }).then(r => r.json());
    assert.equal(state.agents.find(a => a.id === 'codex').status, 'UNKNOWN');
    const beforeDispatch = hq.engine.state.events.find(e => e.type === 'TASK_CREATED').seq;
    const historical = await fetch(`${hq.origin}/api/history?seq=${beforeDispatch}`, { headers }).then(r => r.json());
    assert.equal(historical.tasks[0].stage, 'READY'); assert.equal(historical.replay, true);
  } finally { await hq.close(); }
});
test('actual local Node runner reports tests, not fabricated telemetry', async () => {
  const hq = await createHQ({ port: 0, store: new MemoryStore(), intervalMs: 20 });
  try {
    const id = hq.engine.createTask({ title: 'HQ tests', description: 'Verify actual runner', operation: 'verify-hq', priority: 50, safety: 'local-read-only' });
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline && !['DONE', 'BLOCKED'].includes(hq.engine.state.tasks[id].stage)) await new Promise(resolve => setTimeout(resolve, 30));
    const task = hq.engine.state.tasks[id];
    assert.equal(task.stage, 'DONE', JSON.stringify(task.evidence));
    assert.ok(task.evidence.some(e => e.kind === 'TEST_RESULT' && e.result === 'passed'));
  } finally { await hq.close(); }
});
