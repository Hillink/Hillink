// Owner approval through ChatGPT: approve_objective_gate transmits Kyle's explicit decision on a pending
// Kyle-only gate; HQ checks Kyle's own message, journals it with audit evidence and the Conductor resumes.
// Real engine, conductor, toolbox and adapter; OpenAI is a scripted fake (no network, no credits).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, emptyState, reduce } from '../engine.mjs';
import { MemoryStore } from '../store.mjs';
import { Conductor } from '../orchestration/conductor.mjs';
import { gatesFor, validateObjectiveInput } from '../orchestration/policy.mjs';
import { createToolbox, validateArgs, kyleGateStatement } from '../orchestrator-tools.mjs';
import { connectOrchestrator } from '../orchestrator-adapter.mjs';

function setup() {
  let clock = 1_000_000;
  const store = new MemoryStore();
  const engine = new Engine({ store, now: () => clock, config: { heartbeatMs: 60_000, progressMs: 600_000 } });
  engine.initialize();
  const conductor = new Conductor(engine, { orchestratorCallbacks: false });
  const kyleSays = text => { clock += 1000; return engine.createTask({ title: `Kyle asks ChatGPT: ${text}`.slice(0, 200), description: text, operation: 'orchestrate', safety: 'local-read-only', priority: 50 }); };
  const tool = (turn, name, args) => { const r = createToolbox(engine, { taskId: turn, conductor }).call(name, JSON.stringify(args)); return { ...r, out: JSON.parse(r.output) }; };
  // An objective stopped at a Kyle-only pre-work gate.
  const gated = async (gate = 'production-change') => {
    const id = conductor.submit({ objective: 'Investigate the checkout flow', type: 'investigate', requestedActions: [gate] });
    await conductor.tick();
    assert.equal(engine.state.objectives[id].status, 'AWAITING_APPROVAL');
    assert.equal(engine.state.objectives[id].approvals[gate].status, 'PENDING');
    return id;
  };
  const decided = () => store.read().filter(e => e.type === 'APPROVAL_DECIDED');
  return { engine, store, conductor, kyleSays, tool, gated, decided, advance: ms => { clock += ms; } };
}

test('Kyle explicitly approves in ChatGPT: HQ validates his message, journals the approval as his, and the objective resumes', async () => {
  const s = setup();
  const id = await s.gated();
  const turn = s.kyleSays(`Yes. Approve production-change on objective ${id.slice(0, 8)}.`);
  const r = s.tool(turn, 'approve_objective_gate', { objective_id: id, gate: 'production-change', decision: 'approve' });
  assert.equal(r.ok, true, r.output);
  assert.equal(r.out.decided_by, 'kyle'); assert.equal(r.out.transmitted_by, 'chatgpt');
  const [event] = s.decided();
  assert.equal(event.data.by, 'kyle');
  assert.equal(event.data.evidence.channel, 'chatgpt-orchestrator');
  assert.equal(event.data.evidence.orchestrationTaskId, turn);
  assert.match(event.data.evidence.kyleMessage, /Approve production-change/);
  assert.equal(s.engine.state.objectives[id].approvals['production-change'].status, 'APPROVED');
  await s.conductor.tick();
  assert.notEqual(s.engine.state.objectives[id].status, 'AWAITING_APPROVAL', 'the Conductor resumed the objective');
  assert.match(s.engine.state.objectives[id].history.find(h => h.from === 'AWAITING_APPROVAL').reason, /Approved by Kyle: production-change/);
  // Audit survives restart: replaying the journal rebuilds the same approval and evidence.
  const replay = s.store.read().reduce(reduce, emptyState());
  assert.deepEqual(replay.objectives[id].approvals['production-change'].evidence, event.data.evidence);
});

test('a deny from Kyle is transmitted the same way and stops the objective', async () => {
  const s = setup();
  const id = await s.gated('destructive');
  const turn = s.kyleSays(`deny destructive for ${id}`);
  assert.equal(s.tool(turn, 'approve_objective_gate', { objective_id: id, gate: 'destructive', decision: 'deny' }).ok, true);
  await s.conductor.tick();
  assert.equal(s.engine.state.objectives[id].status, 'CANCELLED');
});

test('ChatGPT cannot manufacture approval: no explicit statement by Kyle in this turn is refused and nothing is journaled', async () => {
  const s = setup();
  const id = await s.gated();
  for (const message of [
    'What is pending on HQ?',
    `Looks good to me, go ahead with ${id.slice(0, 8)}.`,
    'Approve production-change.', // no objective named
    `Approve production-change on ${id.slice(0, 8)}? Let me think about it. Do not approve production-change yet.`,
    `approve production-change and deny production-change on ${id.slice(0, 8)}`,
    `Approve merge on ${id.slice(0, 8)}`, // a different gate than the one transmitted
  ]) {
    const r = s.tool(s.kyleSays(message), 'approve_objective_gate', { objective_id: id, gate: 'production-change', decision: 'approve' });
    assert.equal(r.ok, false, message);
    assert.match(r.out.refused, /Kyle's message/, message);
  }
  // Kyle said deny, ChatGPT reports approve.
  assert.equal(s.tool(s.kyleSays(`deny production-change on ${id.slice(0, 8)}`), 'approve_objective_gate', { objective_id: id, gate: 'production-change', decision: 'approve' }).ok, false);
  assert.equal(s.decided().length, 0);
  assert.equal(s.engine.state.objectives[id].approvals['production-change'].status, 'PENDING');
});

test('only a turn carrying Kyle\'s own message may transmit: HQ callback turns, agent-requested turns and earlier messages are refused', async () => {
  const s = setup();
  const early = s.kyleSays('Approve production-change on objective PLACEHOLDER');
  const id = await s.gated();
  const msg = `Approve production-change on ${id.slice(0, 8)}`;
  const callback = s.engine.createTask({ title: 'HQ needs a decision', description: msg, operation: 'orchestrate', safety: 'local-read-only', priority: 70 }, { link: { objectiveId: id, stepId: null, decisionId: 'x' } });
  const delegated = s.engine.createTask({ title: 'Agent turn', description: msg, operation: 'orchestrate', safety: 'local-read-only', priority: 50 }, { requestedBy: { agentId: 'chatgpt', taskId: early } });
  const review = s.engine.createTask({ title: 'Not an orchestration turn', description: msg, operation: 'inspect-repo', safety: 'local-read-only', priority: 50 });
  for (const turn of [callback, delegated, review]) assert.match(s.tool(turn, 'approve_objective_gate', { objective_id: id, gate: 'production-change', decision: 'approve' }).out.refused, /Kyle's own message/);
  // A message written before the gate existed cannot be a decision on it, even if it names the id.
  s.engine.state.tasks[early].description = msg; // simulate a message that named it
  assert.match(s.tool(early, 'approve_objective_gate', { objective_id: id, gate: 'production-change', decision: 'approve' }).out.refused, /predates/);
  assert.equal(s.decided().length, 0);
});

test('wrong objective, wrong gate, unknown gate name, non-pending and replayed approvals are rejected', async () => {
  const s = setup();
  const id = await s.gated();
  const other = await s.gated('credential-change');
  const turn = s.kyleSays(`Approve production-change on ${id.slice(0, 8)}`);
  assert.match(s.tool(turn, 'approve_objective_gate', { objective_id: '00000000-0000-4000-8000-000000000000', gate: 'production-change', decision: 'approve' }).out.refused, /No HQ objective/);
  assert.match(s.tool(turn, 'approve_objective_gate', { objective_id: other, gate: 'production-change', decision: 'approve' }).out.refused, /no production-change gate/);
  assert.match(s.tool(turn, 'approve_objective_gate', { objective_id: id, gate: 'merge', decision: 'approve' }).out.refused, /no merge gate/);
  assert.throws(() => validateArgs('approve_objective_gate', JSON.stringify({ objective_id: id, gate: 'scope', decision: 'approve' })), /must be one of/, 'non-Kyle decision ids are not gates');
  assert.throws(() => validateArgs('approve_objective_gate', JSON.stringify({ objective_id: id, gate: 'merge', decision: 'approve', by: 'kyle' })), /Unexpected argument/, 'the model cannot pass an identity');
  assert.equal(s.tool(turn, 'approve_objective_gate', { objective_id: id, gate: 'production-change', decision: 'approve' }).ok, true);
  // Replay in the same turn, and replay of the same message in a later turn: the gate is no longer pending.
  assert.equal(s.tool(turn, 'approve_objective_gate', { objective_id: id, gate: 'production-change', decision: 'approve' }).ok, false);
  assert.match(s.tool(s.kyleSays(`Approve production-change on ${id.slice(0, 8)}`), 'approve_objective_gate', { objective_id: id, gate: 'production-change', decision: 'approve' }).out.refused, /already APPROVED \(by kyle\)/);
  assert.equal(s.decided().length, 1);
  // One gate decision per turn even when Kyle names two.
  const third = await s.gated('security-policy-change');
  const two = s.kyleSays(`approve credential-change on ${other.slice(0, 8)} and approve security-policy-change on ${third.slice(0, 8)}`);
  const tb = createToolbox(s.engine, { taskId: two, conductor: s.conductor });
  assert.equal(tb.call('approve_objective_gate', JSON.stringify({ objective_id: other, gate: 'credential-change', decision: 'approve' })).ok, true);
  assert.match(JSON.parse(tb.call('approve_objective_gate', JSON.stringify({ objective_id: third, gate: 'security-policy-change', decision: 'approve' })).output).refused, /At most 1 gate decision/);
});

test('Conductor.approve still refuses anyone but Kyle, and approval tools are absent without a Conductor', async () => {
  const s = setup();
  const id = await s.gated();
  assert.throws(() => s.conductor.approve(id, 'production-change', 'approve', { by: 'chatgpt' }), /Only Kyle/);
  const turn = s.kyleSays(`Approve production-change on ${id.slice(0, 8)}`);
  const r = JSON.parse(createToolbox(s.engine, { taskId: turn }).call('approve_objective_gate', JSON.stringify({ objective_id: id, gate: 'production-change', decision: 'approve' })).output);
  assert.match(r.error, /not enabled/);
  assert.equal(s.decided().length, 0);
});

test('resolve_objective_decision decides orchestrator-authority decisions only; Kyle-authority decisions stay Kyle\'s', async () => {
  const s = setup();
  const id = s.conductor.submit({ objective: 'Investigate the inbox', type: 'investigate' });
  await s.conductor.tick();
  const o = s.engine.state.objectives[id];
  s.conductor.requestDecision(o, 'kyle-scope', { authority: 'kyle', type: 'scope' }, 'Implement?', [{ id: 'approve_scope', label: 'Yes' }, { id: 'stop', label: 'Stop' }]);
  const turn = s.kyleSays(`approve the scope on ${id.slice(0, 8)}`);
  const refused = s.tool(turn, 'resolve_objective_decision', { objective_id: id, decision_id: 'kyle-scope', choice: 'approve_scope', rationale: 'Looks fine.' });
  assert.equal(refused.ok, false); assert.match(refused.out.refused, /needs Kyle/);
  assert.equal(s.engine.state.objectives[id].decisions['kyle-scope'].status, 'PENDING');
  // approve_objective_gate cannot reach decisions either: they are not gates.
  assert.equal(s.tool(turn, 'approve_objective_gate', { objective_id: id, gate: 'merge', decision: 'approve' }).ok, false);
  assert.equal(JSON.parse(s.tool(turn, 'get_objective', { objective_id: id }).output).pending_decisions[0].authority, 'kyle');
  // An orchestrator-authority decision is ChatGPT's to make, recorded as ChatGPT's.
  const id2 = s.conductor.submit({ objective: 'Investigate the outbox', type: 'investigate' });
  await s.conductor.tick();
  s.conductor.requestDecision(s.engine.state.objectives[id2], 'next', { authority: 'orchestrator', type: 'investigation' }, 'What next?', [{ id: 'stop', label: 'Stop' }, { id: 'escalate_to_kyle', label: 'Ask Kyle' }]);
  const ok = s.tool(s.kyleSays('handle it'), 'resolve_objective_decision', { objective_id: id2, decision_id: 'next', choice: 'stop', rationale: 'Enough evidence.' });
  assert.equal(ok.ok, true, ok.output);
  assert.equal(s.engine.state.objectives[id2].decisions.next.by, 'chatgpt');
});

test('end to end through the ChatGPT adapter: Kyle\'s turn → approve_objective_gate → HQ journal → objective resumes', async () => {
  const s = setup();
  const id = await s.gated();
  const script = [
    [{ type: 'function_call', call_id: 'c1', name: 'approve_objective_gate', arguments: JSON.stringify({ objective_id: id, gate: 'production-change', decision: 'approve' }) }],
    [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Recorded your approval.' }] }],
  ];
  const sse = out => new Response(new ReadableStream({ start(c) { for (const e of [{ type: 'response.created', response: { id: 'r' } }, { type: 'response.completed', response: { id: 'r', status: 'completed', output: out, usage: {} } }]) c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`)); c.close(); } }), { status: 200 });
  const request = async url => { const route = new URL(url).pathname; if (route.includes('/models/')) return new Response('{}'); if (route.endsWith('/conversations')) return new Response('{"id":"conv"}'); return sse(script.shift()); };
  assert.equal(connectOrchestrator(s.engine, { env: { OPENAI_API_KEY: 'sk-test-fake' }, request, conductor: s.conductor }), 'CONFIGURED');
  await s.engine.tick();
  const turn = s.kyleSays(`I approve. Approve production-change on objective ${id.slice(0, 8)}.`);
  await s.engine.tick();
  for (let i = 0; i < 50; i++) await new Promise(r => setImmediate(r));
  assert.equal(s.engine.state.tasks[turn].stage, 'DONE');
  assert.equal(s.decided()[0].data.evidence.orchestrationTaskId, turn);
  assert.ok(s.engine.state.tasks[turn].evidence.some(e => /Transmitted Kyle's explicit decision: approve production-change/.test(e.summary)));
  await s.conductor.tick();
  assert.notEqual(s.engine.state.objectives[id].status, 'AWAITING_APPROVAL');
});

test('kyleGateStatement: hyphenated gate names may be written with a space; negation and contradiction are caught', () => {
  const id = '1a2b3c4d-0000-4000-8000-000000000000';
  assert.equal(kyleGateStatement('approve architecture change on 1a2b3c4d', { objectiveId: id, gate: 'architecture-change', decision: 'approve' }), null);
  assert.match(kyleGateStatement("don't approve merge on 1a2b3c4d", { objectiveId: id, gate: 'merge', decision: 'approve' }), /negates/);
  assert.match(kyleGateStatement('approve merge on 1a2b3c4e', { objectiveId: id, gate: 'merge', decision: 'approve' }), /does not name/);
});

test('architecture-change: isolated World asset/data staging is not flagged by breadth; real breadth and text signals still are', () => {
  const gates = raw => gatesFor(validateObjectiveInput(raw));
  const world = ['tools/hillink-world/assets/sprites/', 'tools/hillink-world/assets/tiles/', 'tools/hillink-world/data/agents.json', 'tools/hillink-world/data/map.json', 'tools/hillink-world/public/manifest.json'];
  assert.ok(!gates({ objective: 'Stage new sprite and map data for the World', type: 'fix', scope: world }).includes('architecture-change'), 'five World staging paths');
  // Still flagged: World mixed with application code, broad scopes elsewhere (including docs/tests), text signals.
  assert.ok(gates({ objective: 'Stage assets', type: 'fix', scope: [...world.slice(0, 3), 'app/page.tsx'] }).includes('architecture-change'));
  assert.ok(gates({ objective: 'Stage assets', type: 'fix', scope: ['tools/hillink-world/assets/', 'lib/ui/', 'components/world/'] }).includes('architecture-change'));
  assert.ok(gates({ objective: 'Update docs', type: 'fix', scope: ['docs/a.md', 'docs/b.md', 'docs/c.md', 'docs/d.md'] }).includes('architecture-change'));
  assert.ok(gates({ objective: 'Rewrite the World renderer', type: 'fix', scope: ['tools/hillink-world/src/'] }).includes('architecture-change'));
  // Other gates are unaffected by the exemption.
  assert.ok(gates({ objective: 'Stage assets and deploy to production', type: 'fix', scope: world }).includes('deploy'));
  assert.ok(gates({ objective: 'Stage assets', type: 'fix', scope: world, requestedActions: ['merge'] }).includes('merge'));
});
