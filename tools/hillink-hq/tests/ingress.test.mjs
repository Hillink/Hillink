// ChatGPT ingress: the objective tools as a remote MCP server. Real HTTP, real engine, conductor, runner, git and
// HQ-run tests (the Pass 3 harness); fake agents in place of the model CLIs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { startIngress, INGRESS_TOOLS } from '../ingress/mcp-ingress.mjs';
import { createHQ } from '../server.mjs';
import { harness, scriptedAgent, handoffText, investigation, review, role } from './orchestration-harness.mjs';

const TOKEN = randomBytes(32).toString('base64url');
const codexInvestigatesAndReviews = (inv = investigation(), rev = review()) => scriptedAgent('Codex', task => ({ text: handoffText(role(task) === 'investigate' ? inv : rev) }));

function client(base, token = TOKEN) {
  let n = 0;
  const post = (body, { pathPart = `/mcp/${token}`, headers = {} } = {}) => fetch(`${base}${pathPart}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const rpc = async (method, params) => { const r = await post({ jsonrpc: '2.0', id: ++n, method, params }); assert.equal(r.status, 200); return r.json(); };
  const call = async (name, args) => { const res = await rpc('tools/call', { name, arguments: args }); if (res.error) return { rpcError: res.error }; return { isError: res.result.isError, value: JSON.parse(res.result.content[0].text) }; };
  return { post, rpc, call };
}
async function withIngress(h, fn) {
  const ing = await startIngress({ engine: h.engine, token: TOKEN, port: 0 });
  try { return await fn(client(ing.base), ing); } finally { await ing.close(); }
}

test('I1. the secret URL is the only door: wrong or missing token, other methods and other content types are refused', async () => {
  const h = harness();
  await withIngress(h, async (c, ing) => {
    const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };
    for (const pathPart of ['/mcp/', `/mcp/${TOKEN}x`, `/mcp/${TOKEN.slice(0, -1)}${TOKEN.endsWith('A') ? 'B' : 'A'}`, '/', '/api/state', `/MCP/${TOKEN}`]) assert.equal((await c.post(init, { pathPart })).status, 404, pathPart);
    assert.equal((await fetch(`${ing.base}/mcp/${TOKEN}`)).status, 405, 'no GET stream');
    assert.equal((await c.post(init, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
    assert.equal((await c.post('{not json')).status, 400);
    assert.equal((await c.post('x'.repeat(70_000))).status, 413);
    assert.equal(ing.base.includes(TOKEN), false, 'the reported base never carries the token');
  });
  await assert.rejects(startIngress({ engine: h.engine, token: 'short', port: 0 }), /43 to 128/);
  await assert.rejects(startIngress({ engine: h.engine, token: TOKEN, port: 0, host: '0.0.0.0' }), /127\.0\.0\.1 only/);
});

test('I2. MCP handshake: initialize, notifications, tools/list exposes exactly the seven objective tools', async () => {
  const h = harness();
  await withIngress(h, async c => {
    const init = await c.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'chatgpt', version: '1' } });
    assert.equal(init.result.protocolVersion, '2025-06-18');
    assert.deepEqual(init.result.capabilities, { tools: { listChanged: false } });
    assert.equal((await c.post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
    const tools = (await c.rpc('tools/list', {})).result.tools;
    assert.deepEqual(tools.map(t => t.name).sort(), [...INGRESS_TOOLS].sort());
    for (const t of tools) { assert.equal(t.inputSchema.type, 'object'); assert.equal(t.inputSchema.additionalProperties, false); }
    // Everything else the in-HQ orchestrator has is not reachable through the door.
    for (const name of ['request_implementation', 'request_repo_review', 'request_kyle_approval', 'approve', 'shell']) assert.equal((await c.call(name, {})).rpcError.code, -32602, name);
    assert.equal((await c.rpc('resources/list', {})).error.code, -32601);
  });
});

test('I3. closed loop over HTTP: ChatGPT submits a fix, HQ runs Codex -> Claude -> HQ tests -> review, ChatGPT reads the result and evidence, then submits a dependent follow-up', async () => {
  const h = harness({ codex: codexInvestigatesAndReviews() });
  await withIngress(h, async c => {
    const sub = await c.call('submit_objective', { objective: 'greet() is missing; find out why and fix it.', type: 'fix', title: 'Fix greet()', scope: ['sandbox/hq-implementation/'], tests: [], acceptance_criteria: null, constraints: null, requested_actions: [] });
    assert.equal(sub.isError, false, JSON.stringify(sub.value));
    const id = sub.value.objective_id;
    assert.deepEqual(h.objective(id).requestedBy, { agentId: 'chatgpt', taskId: null }, 'attributed to ChatGPT, through the connector');
    await h.drive(h.settled(id));
    const o = (await c.call('get_objective', { objective_id: id })).value;
    assert.equal(o.status, 'COMPLETE', o.why);
    assert.deepEqual(o.steps.map(s => [s.kind, s.agent]), [['investigate', 'codex'], ['implement', 'claude'], ['verify', 'hq'], ['review', 'codex']], 'Claude claimed and executed the implementation');
    assert.match(o.result.branch, /^hq\/impl\//); assert.match(o.result.commit, /^[0-9a-f]{40}$/);
    assert.ok(o.steps.every(s => s.status === 'DONE'));
    // Evidence: the implementation task, read through get_task.
    const impl = h.tasks(t => t.operation === 'implement-repo' && t.link?.objectiveId === id)[0];
    const t = (await c.call('get_task', { task_id: impl.id })).value;
    assert.equal(t.agent, 'claude'); assert.equal(t.stage, 'DONE');
    assert.equal(t.commit, o.result.commit);
    assert.ok(t.tests.some(x => x.result === 'passed'), JSON.stringify(t.tests));
    // Dependent follow-up, chained on the first result with no human in between.
    const follow = await c.call('submit_objective', { objective: `Review commit ${o.result.commit} on ${o.result.branch} for regressions.`, type: 'review', title: 'Review the greet() fix', scope: [], tests: [], acceptance_criteria: null, constraints: null, requested_actions: [] });
    assert.equal(follow.isError, false, JSON.stringify(follow.value));
    await h.drive(h.settled(follow.value.objective_id));
    const f = (await c.call('get_objective', { objective_id: follow.value.objective_id })).value;
    assert.equal(f.status, 'COMPLETE', f.why);
    assert.match(h.codex.calls.at(-1).task.description, new RegExp(o.result.commit));
    const state = (await c.call('get_hq_state', {})).value;
    assert.ok(state.agents.some(a => a.id === 'claude'));
  });
});

test('I4. approval gates stay Kyle\'s: an objective that asks to merge stops for Kyle, and nothing on the door can approve it', async () => {
  const h = harness({ codex: codexInvestigatesAndReviews() });
  await withIngress(h, async c => {
    const sub = await c.call('submit_objective', { objective: 'greet() is missing; fix it and merge it.', type: 'fix', title: 'Fix and merge', scope: ['sandbox/hq-implementation/'], tests: [], acceptance_criteria: null, constraints: null, requested_actions: ['merge'] });
    const id = sub.value.objective_id;
    await h.drive(h.settled(id));
    const o = (await c.call('get_objective', { objective_id: id })).value;
    assert.equal(o.status, 'AWAITING_APPROVAL', o.why);
    assert.deepEqual(o.approvals_pending_for_kyle.map(a => a.gate), ['merge']);
  });
});

test('I7. decisions: ChatGPT answers a decision HQ gave the orchestrator, cannot answer one that needs Kyle, and can cancel', async () => {
  const h = harness({ codex: codexInvestigatesAndReviews(investigation({ recommendedAction: 'needs_owner' })) });
  await withIngress(h, async c => {
    const id = (await c.call('submit_objective', { objective: 'greet() is missing; find out why and fix it.', type: 'fix', title: 'Fix greet()', scope: ['sandbox/hq-implementation/'], tests: [], acceptance_criteria: null, constraints: null, requested_actions: [] })).value.objective_id;
    await h.drive(h.settled(id));
    let o = (await c.call('get_objective', { objective_id: id })).value;
    assert.equal(o.status, 'AWAITING_DECISION', o.why);
    const mine = o.decisions_pending.find(d => d.for === 'orchestrator');
    assert.ok(mine, JSON.stringify(o.decisions_pending));
    assert.equal((await c.call('resolve_objective_decision', { objective_id: id, decision_id: mine.decision_id, choice: 'merge_it', rationale: 'x' })).isError, true, 'only listed options');
    const r = await c.call('resolve_objective_decision', { objective_id: id, decision_id: mine.decision_id, choice: 'escalate_to_kyle', rationale: 'The investigation says the owner must decide.' });
    assert.equal(r.isError, false, JSON.stringify(r.value));
    assert.equal(h.engine.state.objectives[id].decisions[mine.decision_id].status === 'PENDING', false);
    await h.drive(h.settled(id));
    o = (await c.call('get_objective', { objective_id: id })).value;
    const kyles = o.decisions_pending.find(d => d.for === 'kyle');
    assert.ok(kyles, 'escalation leaves a decision for Kyle');
    const refused = await c.call('resolve_objective_decision', { objective_id: id, decision_id: kyles.decision_id, choice: kyles.options[0].id, rationale: 'x' });
    assert.equal(refused.isError, true); assert.match(refused.value.refused, /needs Kyle/);
    const cancel = await c.call('cancel_objective', { objective_id: id, reason: 'Smoke test over.' });
    assert.equal(cancel.isError, false, JSON.stringify(cancel.value));
    await h.drive(h.settled(id));
    assert.equal((await c.call('get_objective', { objective_id: id })).value.status, 'CANCELLED');
  });
});

test('I8. wait_for_objective: ChatGPT chains steps in one turn; the wait returns when the objective settles, times out unsettled, and validates input', async () => {
  const h = harness({ codex: codexInvestigatesAndReviews(investigation({ recommendedAction: 'no_change' })) });
  await withIngress(h, async c => {
    const id = (await c.call('submit_objective', { objective: 'How does greet() work?', type: 'investigate', title: 'Q', scope: [], tests: [], acceptance_criteria: null, constraints: null, requested_actions: [] })).value.objective_id;
    // Not driven yet: a short wait times out unsettled and changes nothing.
    const early = await c.call('wait_for_objective', { objective_id: id, timeout_seconds: 1 });
    assert.equal(early.isError, false); assert.equal(early.value.settled, false); assert.equal(early.value.objective.id, id);
    // HQ works while ChatGPT waits; the wait returns as soon as the objective is final.
    const [waited] = await Promise.all([c.call('wait_for_objective', { objective_id: id, timeout_seconds: 30 }), h.drive(h.settled(id))]);
    assert.equal(waited.value.settled, true); assert.equal(waited.value.objective.status, 'COMPLETE');
    assert.ok(waited.value.waited_seconds < 30);
    // Then the next step, chained on the result.
    const next = await c.call('submit_objective', { objective: `Follow-up on ${id}: list the tests that cover greet().`, type: 'investigate', title: 'Q2', scope: [], tests: [], acceptance_criteria: null, constraints: null, requested_actions: [] });
    assert.equal(next.isError, false, JSON.stringify(next.value));
    for (const bad of [{ objective_id: 'nope' }, { objective_id: id, timeout_seconds: 0 }, { objective_id: id, timeout_seconds: 56 }, { objective_id: id, extra: 1 }, {}]) assert.equal((await c.call('wait_for_objective', bad)).isError, true, JSON.stringify(bad));
  });
});

test('I5. bad input is refused by HQ\'s own validation, and submissions are rate limited', async () => {
  const h = harness();
  await withIngress(h, async c => {
    assert.equal((await c.call('submit_objective', { objective: 'x', type: 'deploy-it', title: 't', scope: [], tests: [], acceptance_criteria: null, constraints: null, requested_actions: [] })).isError, true);
    assert.equal((await c.call('submit_objective', { objective: 'x', type: 'investigate', title: 't', scope: [], tests: [], acceptance_criteria: null, constraints: null, requested_actions: [], extra: 1 })).isError, true);
    assert.equal((await c.call('get_objective', { objective_id: 'nope' })).isError, true);
    const ok = [];
    for (let i = 0; i < 7; i++) ok.push((await c.call('submit_objective', { objective: `Question ${i}: why is the sky blue?`, type: 'investigate', title: `Q${i}`, scope: [], tests: [], acceptance_criteria: null, constraints: null, requested_actions: [] })).isError);
    assert.ok(ok.filter(e => e).length >= 2, 'the 6th and later submissions in a minute are refused (or HQ\'s open-objective limit refuses them first)');
  });
});

test('I6. HQ server: off by default; when enabled it reports status without the token and keeps the token in a 0600 file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-ingress-'));
  const off = await createHQ({ port: 0, directory: path.join(dir, 'a'), env: {} });
  try { assert.equal(off.ingress().status, 'DISABLED'); } finally { await off.close(); }
  const on = await createHQ({ port: 0, directory: path.join(dir, 'b'), env: { HQ_INGRESS_PORT: '0' }, ingress: true });
  try {
    const ing = on.ingress();
    assert.match(ing.status, /^ENABLED on http:\/\/127\.0\.0\.1:\d+\/mcp\/<token>$/);
    const token = fs.readFileSync(ing.tokenFile, 'utf8').trim();
    if (process.platform !== 'win32') assert.equal(fs.statSync(ing.tokenFile).mode & 0o777, 0o600);
    const headers = { 'X-HQ-Client': 'command-center' };
    const { token: session } = await fetch(`${on.origin}/api/session`, { headers }).then(r => r.json());
    const stateText = await fetch(`${on.origin}/api/state`, { headers: { ...headers, Authorization: `Bearer ${session}` } }).then(r => r.text());
    assert.equal(stateText.includes(token), false, 'the token is not in HQ state');
    assert.match(JSON.parse(stateText).health.ingress, /^ENABLED/);
    const tools = await client(ing.base, token).rpc('tools/list', {});
    assert.equal(tools.result.tools.length, INGRESS_TOOLS.length);
    assert.notEqual(token, session, 'the ingress secret is not the browser session token');
  } finally { await on.close(); }
  // The same token survives a restart (ChatGPT's connector URL keeps working).
  const again = await createHQ({ port: 0, directory: path.join(dir, 'b'), env: { HQ_INGRESS_PORT: '0' }, ingress: true });
  try { assert.match(again.ingress().status, /^ENABLED/); } finally { await again.close(); }
  const bad = await createHQ({ port: 0, directory: path.join(dir, 'c'), env: { HQ_INGRESS_TOKEN: 'too-short', HQ_INGRESS_PORT: '0' }, ingress: true });
  try { assert.match(bad.ingress().status, /^UNAVAILABLE/); } finally { await bad.close(); }
});
