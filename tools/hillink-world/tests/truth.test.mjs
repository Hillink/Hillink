// Pass 2, P0: truthful labels, task continuity, actionable failures, scenario ownership and history.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEvent } from '../core/events.mjs';
import { WorldStore, applyEvent, emptyWorld } from '../core/state.mjs';
import { jobOf, lastJobOf, issuesFor } from '../core/job.mjs';
import { loadTheme } from '../themes/index.mjs';
import { stepPath, Effects } from '../engine/motion.mjs';
import { Scene } from '../engine/scene.mjs';
import { IsoWorldView, PRODUCTIVE_STATES, actionText } from '../engine/iso-view.mjs';
import { statusLine } from '../render/iso-skin.mjs';
import { Simulator } from '../sim/simulator.mjs';
import { HqTranslator } from '../adapters/hq.mjs';
import { feedHTML, describe } from '../ui/hud.mjs';
import { inspectHTML } from '../ui/inspect.mjs';

const ev = (type, fields, at = 1000) => makeEvent(type, fields, { source: 'sim', at });
const theme = loadTheme('real'), L = theme.layout;

// A world with a view, a simulator and one shared fake clock.
function rig() {
  const store = new WorldStore(emptyWorld()), scene = new Scene();
  const view = new IsoWorldView(scene, new Effects(), L, theme.scenery);
  let clock = 0; const timers = [];
  const now = () => clock * 1000;
  store.subscribe((changed, world) => view.sync(world, changed, now()));
  const sim = new Simulator(store, { now, schedule: (fn, ms) => { const t = { at: now() + ms, fn }; timers.push(t); return t; }, cancel: t => { t.cancelled = true; } });
  const run = (seconds, each, dt = 0.05) => {
    for (let s = 0; s < seconds; s += dt) {
      clock += dt;
      for (const t of timers.filter(t => !t.done && !t.cancelled && t.at <= now())) { t.done = true; t.fn(); }
      store.flush(); view.step(dt, now(), { instant: false }, stepPath); each?.();
    }
  };
  return { store, scene, view, sim, run, now };
}

test('labels: travelling to a task is never labelled as doing it; the stage stays visible', () => {
  const { store, scene, sim, run } = rig();
  sim.seed(); store.flush(); run(5);
  sim.run('reviewJourney'); store.flush();
  const claude = scene.get('agent:claude'), seen = new Set();
  let walkingLine = null;
  run(40, () => {
    if (claude.moving && store.world.agents.claude.activity === 'coding') {
      assert.ok(!PRODUCTIVE_STATES.has(claude.anim.state), `not productive while moving (${claude.anim.state})`);
      const line = statusLine(claude, store.world, L); seen.add(line);
      assert.doesNotMatch(line, /Typing|coding/i, line);
      if (/^Walking to Engineering/.test(line)) walkingLine = line;
    }
  });
  assert.ok(walkingLine, `saw a walking line in ${[...seen].join(' | ')}`);
  assert.match(walkingLine, /· Implementing$/);
  assert.equal(actionText(claude, L), 'Typing', 'typing once seated at the desk');
});

test('continuity: the reviewer sees the PR and task under review; completion keeps task, PR, evidence and outcome', () => {
  const { store, sim, run } = rig();
  sim.seed(); store.flush(); run(2);
  sim.run('reviewJourney'); store.flush();
  run(44); // past the handoff
  const w = store.world, codex = w.agents.codex, claude = w.agents.claude;
  const job = jobOf(w, codex);
  assert.equal(job.kind, 'review');
  assert.equal(job.task.title, 'Athlete payout edge case (simulated)', 'the review names the task');
  assert.equal(job.task.agentId, 'claude', 'and whose it is');
  assert.equal(claude.taskId, null);
  const last = lastJobOf(w, claude);
  assert.equal(last.outcome, 'done'); assert.equal(last.pr.id, job.pr.id);
  assert.deepEqual(last.task.evidence.map(e => e.kind), ['commit', 'commit', 'pr']);
  const html = inspectHTML({ type: 'agent', id: 'codex' }, w, Date.now(), null, {}, { status: 'Inspecting', job, issues: [] });
  assert.match(html, /Reviewing/); assert.match(html, /Athlete payout edge case/); assert.doesNotMatch(html, /Task<\/span><b>None/);
  run(40); // review passes
  const after = lastJobOf(store.world, store.world.agents.codex);
  assert.equal(after.outcome, 'approved'); assert.equal(after.task.evidence.at(-1).kind, 'review');
});

test('failures: a red run names the agent, task, failing checks and the next action', () => {
  const { store, sim, run } = rig();
  sim.seed(); store.flush();
  sim.run('codexTests'); store.flush(); sim.run('testFails'); run(1);
  const w = store.world, [issue] = issuesFor(w, w.agents.codex);
  assert.ok(issue, 'an issue is tied to Codex');
  assert.ok(w.tasks[issue.taskId], 'and to the task');
  assert.equal(w.testRuns[issue.runId].failing.length, 2);
  assert.match(issue.nextAction, /re-run/);
  const html = inspectHTML({ type: 'agent', id: 'codex' }, w, Date.now(), null, {}, { job: jobOf(w, w.agents.codex), issues: [issue] });
  assert.match(html, /partial refund keeps fee/); assert.match(html, /Next:/); assert.match(html, /Run the unit suite/);
  assert.equal(w.tasks[issue.taskId].evidence.at(-1).kind, 'tests');
});

test('scenarios: a newer scenario on the same agents cancels the older one; idle does not end a meeting', () => {
  const { store, sim, run } = rig();
  sim.seed(); store.flush(); run(1);
  sim.run('reviewJourney'); run(5);
  const cancelled = sim.run('teamMeeting'); store.flush();
  assert.deepEqual(cancelled, ['Claude builds, Codex reviews']);
  run(120); // well past every journey event
  const w = store.world;
  assert.ok(w.agents.claude.meetingId && w.agents.codex.meetingId, 'both still in the meeting');
  assert.equal(Object.keys(w.prs).length, 0, 'the cancelled journey emitted nothing more');
  // Reducer rule, independent of the simulator.
  const w2 = emptyWorld();
  applyEvent(w2, ev('MEETING_STARTED', { meetingId: 'm', agentIds: ['a'] }));
  applyEvent(w2, ev('AGENT_IDLE', { agentId: 'a' }, 1001)); assert.equal(w2.agents.a.meetingId, 'm');
  applyEvent(w2, ev('AGENT_REVIEWING', { agentId: 'a' }, 1002)); assert.equal(w2.agents.a.meetingId, null, 'real work does');
  // Meetings are inspectable, including after they end.
  sim.run('endMeeting'); store.flush();
  const m = store.world.meetingLog.at(-1);
  assert.ok(m.decision && m.outcome && m.agentIds.length >= 2);
  assert.match(inspectHTML({ type: 'meeting', id: m.id }, store.world, Date.now()), /Decision needed/);
});

test('history: a snapshot load is one "Loaded" line, not N "joined" events, and keeps source times', () => {
  const tr = new HqTranslator(), now = 5_000_000;
  const snap = { seq: 3, now, health: { controller: 'ONLINE' }, agents: [{ id: 'claude', name: 'Claude', role: 'Builder', status: 'IDLE' }, { id: 'codex', name: 'Codex', role: 'QA', status: 'UNKNOWN' }],
    tasks: [{ id: 't1', title: 'Old task', stage: 'DONE', createdAt: now - 3_600_000, endedAt: now - 1_800_000, evidence: [{ kind: 'COMMIT', summary: 'abc', at: now - 2_000_000 }] }], runs: {}, alerts: {}, events: [] };
  const { reset, events } = tr.ingest(snap);
  assert.ok(reset && events.every(e => e.snapshot));
  const store = new WorldStore(); store.reset(events);
  const feed = feedHTML(store.world, now + 1000);
  assert.doesNotMatch(feed, /joined/); assert.match(feed, /Loaded HQ state: 2 agents, 1 tasks/);
  assert.equal(store.world.tasks.t1.createdAt, now - 3_600_000, 'HQ timestamps kept');
  assert.equal(store.world.tasks.t1.evidence[0].kind, 'commit', 'evidence survives a reload');
  assert.equal(describe({ type: 'AGENT_REGISTERED', agentId: 'x' }, emptyWorld()), 'x joined', 'never "undefined joined"');
});
