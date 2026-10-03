// Owner approval with the ChatGPT connector: ChatGPT submits and follows objectives over the MCP ingress, but no
// connector tool can decide an approval gate. HQ cannot tell Kyle's words from the model's on that path, so Kyle
// decides gates in the Command Center (POST /api/objectives/approve), journaled with the channel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { startIngress, INGRESS_TOOLS } from '../ingress/mcp-ingress.mjs';
import { createHQ } from '../server.mjs';
import { MemoryStore } from '../store.mjs';
import { CommitVerifier } from '../orchestration/verify.mjs';
import { gatesFor, validateObjectiveInput } from '../orchestration/policy.mjs';
import { harness, scriptedAgent, handoffText, review } from './orchestration-harness.mjs';

const TOKEN = randomBytes(32).toString('base64url');
function client(base) {
  let n = 0;
  const rpc = async (method, params) => (await fetch(`${base}/mcp/${TOKEN}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method, params }) })).json();
  const call = async (name, args) => { const res = await rpc('tools/call', { name, arguments: args }); return res.error ? { rpcError: res.error } : { isError: res.result.isError, value: JSON.parse(res.result.content[0].text) }; };
  return { rpc, call };
}
const decided = engine => engine.state.events.filter(e => e.type === 'APPROVAL_DECIDED');
const fabricationAttempts = async (c, id, gate) => {
  // No connector tool approves: unknown tool names are JSON-RPC errors, and a gate is not an orchestrator decision.
  for (const name of ['approve_objective_gate', 'approve', 'approve_gate', 'request_kyle_approval']) assert.equal((await c.call(name, { objective_id: id, gate, decision: 'approve' })).rpcError?.code, -32602, name);
  const r = await c.call('resolve_objective_decision', { objective_id: id, decision_id: gate, choice: 'approve', rationale: 'Kyle said yes in chat.' });
  assert.equal(r.isError, true);
};

test('connector exposes no approval tool; the tool list is unchanged', async () => {
  const h = harness();
  const ing = await startIngress({ engine: h.engine, token: TOKEN, port: 0 });
  try {
    const names = (await client(ing.base).rpc('tools/list', {})).result.tools.map(t => t.name);
    assert.deepEqual(names.sort(), [...INGRESS_TOOLS].sort());
    assert.ok(!names.some(n => /approv/i.test(n)), names.join(', '));
  } finally { await ing.close(); }
});

test('end to end: ChatGPT submits an implementation over the connector → Claude → HQ CommitVerifier → review → merge gate; ChatGPT cannot approve; Kyle approves in the Command Center path', async () => {
  const h = harness({ codex: scriptedAgent('Codex', () => ({ text: handoffText(review()) })) });
  const ing = await startIngress({ engine: h.engine, token: TOKEN, port: 0 });
  try {
    const c = client(ing.base);
    const sub = await c.call('submit_objective', { objective: 'Add greet(name) returning "Hello, <name>!".', type: 'implement', title: 'Add greet()', scope: ['sandbox/hq-implementation/'], tests: ['sandbox/hq-implementation/greeting.test.mjs'], acceptance_criteria: 'greet("Kyle") returns "Hello, Kyle!".', constraints: 'Change nothing outside the scope.', requested_actions: ['merge'] });
    assert.equal(sub.isError, false, JSON.stringify(sub.value));
    const id = sub.value.objective_id;
    assert.deepEqual(h.objective(id).requestedBy, { agentId: 'chatgpt', taskId: null });
    await h.drive(h.settled(id));
    const waited = (await c.call('wait_for_objective', { objective_id: id, timeout_seconds: 1 })).value;
    assert.equal(waited.settled, true);
    const o = waited.objective;
    assert.equal(o.status, 'AWAITING_APPROVAL', o.why);
    assert.deepEqual(o.steps.map(s => [s.kind, s.agent, s.status]), [['implement', 'claude', 'DONE'], ['verify', 'hq', 'DONE'], ['review', 'codex', 'DONE']]);
    // The verify step is HQ's CommitVerifier, checking the commit from git.
    const verify = Object.values(h.objective(id).steps).find(s => s.kind === 'verify');
    assert.equal(verify.handoff.source, 'hq'); assert.equal(verify.handoff.ok, true);
    assert.ok(verify.handoff.checks.length > 0 && verify.handoff.checks.every(x => x.ok), JSON.stringify(verify.handoff.checks));
    assert.ok(h.verifier instanceof CommitVerifier);
    assert.match(o.approvals_pending_for_kyle[0].how, /Command Center/);
    // ChatGPT cannot fabricate the approval.
    await fabricationAttempts(c, id, 'merge');
    assert.throws(() => h.conductor.approve(id, 'merge', 'approve', { by: 'chatgpt' }), /Only Kyle/);
    assert.equal(decided(h.engine).length, 0);
    assert.equal(h.objective(id).status, 'AWAITING_APPROVAL');
    // Kyle decides (the Command Center route calls exactly this), journaled with the channel; the objective resumes.
    h.conductor.approve(id, 'merge', 'approve', { by: 'kyle', channel: 'command-center' });
    assert.deepEqual(decided(h.engine).map(e => [e.data.by, e.data.gate, e.data.channel]), [['kyle', 'merge', 'command-center']]);
    await h.drive(h.settled(id));
    const done = (await c.call('get_objective', { objective_id: id })).value;
    assert.equal(done.status, 'COMPLETE', done.why);
    assert.match(done.why, /Kyle approved merge; HQ does not perform it/);
  } finally { await ing.close(); }
});

test('real server: the Command Center approve route rejects wrong objective, wrong gate, bad decision and replay; the connector on the same HQ cannot approve; no OpenAI key needed', async () => {
  const hq = await createHQ({ port: 0, store: new MemoryStore(), intervalMs: 20, env: {} });
  const ing = await startIngress({ engine: hq.engine, token: TOKEN, port: 0 });
  try {
    assert.ok(hq.engine.conductor.verifier instanceof CommitVerifier, 'the server Conductor uses the CommitVerifier');
    const c = client(ing.base);
    const sub = await c.call('submit_objective', { objective: 'Investigate how the inbox is loaded.', type: 'investigate', title: 'Inbox', scope: [], tests: [], acceptance_criteria: null, constraints: null, requested_actions: ['production-change'] });
    assert.equal(sub.isError, false, JSON.stringify(sub.value));
    const id = sub.value.objective_id;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && hq.engine.state.objectives[id].status !== 'AWAITING_APPROVAL') await new Promise(r => setTimeout(r, 20));
    assert.equal(hq.engine.state.objectives[id].status, 'AWAITING_APPROVAL');
    await fabricationAttempts(c, id, 'production-change');
    const headers = { 'X-HQ-Client': 'command-center' };
    headers.Authorization = `Bearer ${(await fetch(`${hq.origin}/api/session`, { headers }).then(r => r.json())).token}`;
    const approve = body => fetch(`${hq.origin}/api/objectives/approve`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await fetch(`${hq.origin}/api/objectives/approve`, { method: 'POST', headers: { 'X-HQ-Client': 'command-center', 'Content-Type': 'application/json' }, body: JSON.stringify({ id, gate: 'production-change', decision: 'approve' }) })).status, 401, 'no session, no approval');
    assert.equal((await approve({ id: '00000000-0000-4000-8000-000000000000', gate: 'production-change', decision: 'approve' })).status, 400);
    assert.equal((await approve({ id, gate: 'merge', decision: 'approve' })).status, 400);
    assert.equal((await approve({ id, gate: 'production-change', decision: 'maybe' })).status, 400);
    assert.equal(decided(hq.engine).length, 0);
    assert.equal((await approve({ id, gate: 'production-change', decision: 'approve' })).status, 200);
    assert.equal((await approve({ id, gate: 'production-change', decision: 'approve' })).status, 400, 'replay');
    assert.deepEqual(decided(hq.engine).map(e => [e.data.by, e.data.channel]), [['kyle', 'command-center']]);
    const until = Date.now() + 5000;
    while (Date.now() < until && hq.engine.state.objectives[id].status === 'AWAITING_APPROVAL') await new Promise(r => setTimeout(r, 20));
    assert.notEqual(hq.engine.state.objectives[id].status, 'AWAITING_APPROVAL', 'the Conductor resumed it');
  } finally { await ing.close(); await hq.close(); }
});

test('architecture-change: isolated World asset/data staging is not flagged by breadth; real breadth and text signals still are', () => {
  const gates = raw => gatesFor(validateObjectiveInput(raw));
  const world = ['tools/hillink-world/assets/sprites/', 'tools/hillink-world/assets/tiles/', 'tools/hillink-world/data/agents.json', 'tools/hillink-world/data/map.json', 'tools/hillink-world/public/manifest.json'];
  assert.ok(!gates({ objective: 'Stage new sprite and map data for the World', type: 'fix', scope: world }).includes('architecture-change'));
  assert.ok(gates({ objective: 'Stage assets', type: 'fix', scope: [...world.slice(0, 3), 'app/page.tsx'] }).includes('architecture-change'));
  assert.ok(gates({ objective: 'Stage assets', type: 'fix', scope: ['tools/hillink-world/assets/', 'lib/ui/', 'components/world/'] }).includes('architecture-change'));
  assert.ok(gates({ objective: 'Update docs', type: 'fix', scope: ['docs/a.md', 'docs/b.md', 'docs/c.md', 'docs/d.md'] }).includes('architecture-change'));
  assert.ok(gates({ objective: 'Rewrite the World renderer', type: 'fix', scope: ['tools/hillink-world/src/'] }).includes('architecture-change'));
  assert.ok(gates({ objective: 'Stage assets and deploy to production', type: 'fix', scope: world }).includes('deploy'));
  assert.ok(gates({ objective: 'Stage assets', type: 'fix', scope: world, requestedActions: ['merge'] }).includes('merge'));
});
