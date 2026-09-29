// Pass 2, P1: pass-based construction. Stages move only on evidence; blocked keeps work; accepted persists.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeEvent } from '../core/events.mjs';
import { WorldStore, applyEvent, emptyWorld } from '../core/state.mjs';
import { derive, PIECES, acceptedStructures } from '../core/construction.mjs';
import { createConstructionSource, ciState, agentFor } from '../adapters/git.mjs';
import { createJournal } from '../serve.mjs';
import { Simulator, SIM_PASS_STEPS } from '../sim/simulator.mjs';
import { loadTheme } from '../themes/index.mjs';
import { Scene } from '../engine/scene.mjs';
import { Effects, stepPath } from '../engine/motion.mjs';
import { IsoWorldView, actionText } from '../engine/iso-view.mjs';
import { inspectHTML } from '../ui/inspect.mjs';

const SHA = n => String(n).repeat(40).slice(0, 40).replace(/./g, (c, i) => (n > 9 && i < 8 ? n.toString(16).padStart(8, '0')[i] : c));
const E = (type, fields, at) => makeEvent(type, fields, { source: 'github', at });
const commit = (n, at, by = 'claude') => E('PASS_EVIDENCE', { passId: 'p', evidence: { kind: 'commit', ref: SHA(n), key: `commit:${SHA(n)}`, by, summary: `c${n}` } }, at);
const ci = (n, state, at) => E('PASS_EVIDENCE', { passId: 'p', evidence: { kind: 'ci', ref: SHA(n), sha: SHA(n), key: `ci:${SHA(n)}:${state}`, state } }, at);
const review = (id, state, at) => E('PASS_EVIDENCE', { passId: 'p', evidence: { kind: 'review', ref: id, key: `review:${id}`, state, by: 'codex' } }, at);
const plan = at => E('PASS_PLANNED', { passId: 'p', title: 'Pass X', structures: [{ id: 's', name: 'Annex', floor: 0, x0: 690, x1: 796, z0: 40, z1: 98, h: 84, sitePoints: ['site1', 'site2'] }] }, at);
const apply = events => { const w = emptyWorld(); for (const e of events) applyEvent(w, e); return w; };

test('construction: each milestone moves the stage once, and only on evidence', () => {
  const w = emptyWorld(), stages = [];
  const steps = [plan(1), E('PASS_EVIDENCE', { passId: 'p', evidence: { kind: 'branch', ref: 'b', key: 'branch' } }, 2), commit(1, 3), ci(1, 'running', 4), ci(1, 'passed', 5),
    E('PASS_EVIDENCE', { passId: 'p', evidence: { kind: 'pr', ref: '#1', key: 'pr:ready', state: 'ready' } }, 6), review('r1', 'approved', 7), E('PASS_EVIDENCE', { passId: 'p', evidence: { kind: 'merge', ref: '#1', key: 'merge' } }, 8)];
  for (const e of steps) { applyEvent(w, e); stages.push(w.passes.p.stage); }
  assert.deepEqual(stages, ['planned', 'claimed', 'implementing', 'testing', 'implementing', 'review', 'approved', 'accepted']);
  assert.equal(w.passes.p.pieces, PIECES.length, 'the merge installs the last piece');
  // Time alone moves nothing: deriving again later changes nothing.
  const before = JSON.stringify(derive(w.passes.p));
  assert.equal(JSON.stringify(derive(structuredClone(w.passes.p))), before);
});

test('construction: pieces follow commits; the active piece needs the merge', () => {
  const w = apply([plan(1), ...Array.from({ length: 12 }, (_, i) => commit(i + 1, 10 + i))]);
  assert.equal(w.passes.p.commits, 12);
  assert.equal(w.passes.p.pieces, PIECES.length - 1, 'never "active" before the merge');
  assert.equal(w.passes.p.stage, 'implementing');
});

test('construction: duplicate and out-of-order evidence give the same state', () => {
  const list = [plan(1), commit(1, 3), commit(2, 5), ci(2, 'failed', 6), commit(3, 7), ci(3, 'passed', 8)];
  const inOrder = apply(list).passes.p, shuffled = apply([list[5], list[0], list[3], list[1], list[4], list[2], list[3], list[1]]).passes.p;
  for (const k of ['stage', 'pieces', 'commits', 'ci', 'rework']) assert.equal(shuffled[k], inOrder[k], k);
});

test('construction: blocked keeps everything built and says why; a fix unblocks', () => {
  const w = apply([plan(1), commit(1, 2), commit(2, 3), ci(2, 'failed', 4)]);
  const p = w.passes.p;
  assert.equal(p.stage, 'blocked');
  assert.equal(p.pieces, 3, 'nothing is demolished');
  assert.ok(p.blocker);
  const html = inspectHTML({ type: 'pass', id: 'p' }, w, 10);
  assert.match(html, /Blocked/); assert.match(html, /Next:/);
  applyEvent(w, commit(3, 5)); assert.equal(w.passes.p.stage, 'implementing', 'a new commit has no failed CI yet');
  applyEvent(w, ci(3, 'passed', 6)); assert.equal(w.passes.p.stage, 'implementing');
  assert.equal(w.passes.p.pieces, 4);
});

test('construction: changes requested, then rework, then approval', () => {
  const w = apply([plan(1), commit(1, 2), ci(1, 'passed', 3), review('r1', 'changes_requested', 4)]);
  assert.equal(w.passes.p.stage, 'changes-requested');
  assert.match(inspectHTML({ type: 'pass', id: 'p' }, w, 10), /Changes requested/);
  applyEvent(w, commit(2, 5)); assert.equal(w.passes.p.stage, 'rework'); assert.equal(w.passes.p.rework, 1);
  applyEvent(w, ci(2, 'running', 6)); assert.equal(w.passes.p.stage, 'testing');
  applyEvent(w, ci(2, 'passed', 7)); assert.equal(w.passes.p.stage, 'rework');
  applyEvent(w, review('r2', 'approved', 8)); assert.equal(w.passes.p.stage, 'approved');
  // An approval of an older commit does not approve newer work.
  applyEvent(w, commit(3, 9)); assert.notEqual(w.passes.p.stage, 'approved');
});

test('construction: accepted passes become the baseline in pass order', () => {
  const w = apply([plan(1), E('PASS_EVIDENCE', { passId: 'p', evidence: { kind: 'merge', ref: '#1', key: 'merge' } }, 2)]);
  assert.deepEqual(acceptedStructures(w).map(s => s.id), ['s']);
});

test('construction: sticky evidence survives an HQ reset and a replace', () => {
  const store = new WorldStore(emptyWorld());
  store.keep([plan(1), commit(1, 2), commit(2, 3)]); store.flush();
  assert.equal(store.world.passes.p.pieces, 3);
  store.reset([makeEvent('AGENT_REGISTERED', { agentId: 'claude', name: 'Claude', role: 'r', snapshot: true }, { source: 'hq', at: 50 })]);
  assert.equal(store.world.passes.p.pieces, 3, 'reconnecting to HQ does not demolish the building');
  store.replace(emptyWorld());
  assert.equal(store.world.passes.p.commits, 2);
  store.keep([commit(2, 3)]); store.flush();
  assert.equal(store.world.passes.p.commits, 2, 'redelivery is idempotent');
});

test('construction: the journal persists evidence across a restart', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hlw-')), file = path.join(dir, 'construction.jsonl');
  const j1 = createJournal(file), first = [plan(1), commit(1, 2)];
  assert.equal(j1.add(first), 2);
  assert.equal(j1.add([first[1], commit(2, 3)]), 1, 'already-journaled events are not rewritten');
  const j2 = createJournal(file); // a restart
  assert.deepEqual(j2.all().map(e => e.id), j1.all().map(e => e.id));
  assert.equal(apply(j2.all()).passes.p.commits, 2);
  fs.rmSync(dir, { recursive: true });
});

// A fake git + gh so the adapter is tested without a repository or network.
function fakeRun({ gh = true, prState = 'OPEN', merged = false, ciFail = false } = {}) {
  const planJson = JSON.stringify({ id: 'pass-9', order: 9, title: 'Pass 9: test', branch: 'claude/x', pr: 99, since: 'abc123', scope: ['tools/hillink-world'], structures: [{ id: 's', name: 'Annex', floor: 0, x0: 1, x1: 2, z0: 1, z1: 2, h: 3 }] });
  const log = [[SHA(1), 100, 'Kyle', 'First piece', 'Claude <noreply@anthropic.com>'], [SHA(2), 200, 'Codex', 'Second piece', '']].map(r => r.join('\x1f')).join('\x1e\n') + '\x1e';
  const calls = [];
  const run = async (cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    if (cmd === 'gh' && !gh) throw Error('gh: not found');
    if (cmd === 'git' && args[0] === 'fetch') return '';
    if (cmd === 'git' && args[0] === 'for-each-ref') return 'origin/main\norigin/claude/x\n';
    if (cmd === 'git' && args[0] === 'ls-tree') return args[2] === 'origin/claude/x' ? 'tools/hillink-world/world/passes/pass-9.json\n' : '';
    if (cmd === 'git' && args[0] === 'show') return planJson;
    if (cmd === 'git' && args[0] === 'log' && args[1] === '-1') return '50\n';
    if (cmd === 'git' && args[0] === 'rev-parse') return SHA(2);
    if (cmd === 'git' && args[0] === 'log') return log;
    if (cmd === 'gh' && args[1] === 'list') return JSON.stringify([{ number: 99, headRefName: 'claude/x', baseRefName: 'main', state: prState, isDraft: false, createdAt: '2026-09-29T00:00:00Z', title: 't', url: 'https://github.com/Hillink/Hillink/pull/99' }]);
    if (cmd === 'gh' && args[1] === 'view') return JSON.stringify({ state: merged ? 'MERGED' : 'OPEN', isDraft: false, mergedAt: merged ? '2026-09-29T02:00:00Z' : null, baseRefName: 'main', headRefOid: SHA(2), url: 'https://github.com/Hillink/Hillink/pull/99',
      reviews: [{ id: 'R1', author: { login: 'chatgpt-codex-connector' }, state: 'CHANGES_REQUESTED', submittedAt: '2026-09-29T01:00:00Z', body: 'Fix the label' }],
      statusCheckRollup: [{ name: 'unit', status: 'COMPLETED', conclusion: ciFail ? 'FAILURE' : 'SUCCESS', completedAt: '2026-09-29T01:30:00Z' }] });
    throw Error(`unexpected ${cmd} ${args.join(' ')}`);
  };
  return { run, calls };
}

test('git adapter: plans, commits, reviews, CI and the merge become pass evidence', async () => {
  const { run, calls } = fakeRun({ ciFail: true });
  const src = createConstructionSource({ run, now: () => 5e12 });
  const events = await src.poll();
  const w = apply(events);
  const p = w.passes['pass-9'];
  assert.equal(p.commits, 2);
  assert.deepEqual(Object.values(p.evidence).filter(x => x.kind === 'commit').map(x => x.by), ['claude', 'codex'], 'co-author trailer and author map to agents');
  assert.equal(p.stage, 'blocked');
  assert.match(p.blocker.summary, /unit/);
  const READ_ONLY = ['git for-each-ref', 'git fetch', 'git ls-tree', 'git show', 'git log', 'git rev-parse', 'gh pr list', 'gh pr view'];
  assert.ok(calls.every(c => READ_ONLY.includes(c.split(' ').slice(0, c.startsWith('gh') ? 3 : 2).join(' '))), 'read-only commands only');
  assert.deepEqual((await src.poll()).map(e => e.id).sort(), events.map(e => e.id).sort(), 'polling again yields the same ids');
  const merged = apply(await createConstructionSource({ run: fakeRun({ merged: true }).run }).poll()).passes['pass-9'];
  assert.equal(merged.stage, 'accepted');
});

test('git adapter: without gh the World still shows plans and commits from git', async () => {
  const src = createConstructionSource({ run: fakeRun({ gh: false }).run });
  const w = apply(await src.poll());
  assert.equal(src.status.gh, false);
  // Without gh: the plan is found on the remote branch, commits come from git; no CI or review claims.
  const p = w.passes['pass-9'];
  assert.equal(p.commits, 2); assert.equal(p.ci, null); assert.equal(p.stage, 'implementing');
  assert.equal(ciState([{ name: 'a', status: 'IN_PROGRESS' }]).state, 'running');
  assert.equal(agentFor('Kyle', 'Claude Opus <noreply@anthropic.com>'), 'claude');
});

test('simulated construction: one milestone per click, nothing on a timer, reload keeps it', () => {
  const store = new WorldStore(emptyWorld()), scheduled = [];
  const sim = new Simulator(store, { now: (() => { let t = 1e6; return () => (t += 1000); })(), schedule: (fn, ms) => scheduled.push(ms) });
  const stages = [];
  for (let i = 0; i < SIM_PASS_STEPS.length; i++) { sim.run('constructionStep'); store.flush(); stages.push(store.world.passes['sim-pass'].stage); }
  assert.equal(scheduled.length, 0, 'no timers');
  for (const s of ['planned', 'claimed', 'implementing', 'review', 'testing', 'blocked', 'changes-requested', 'rework', 'approved', 'accepted']) assert.ok(stages.includes(s), s);
  assert.equal(stages.at(-1), 'accepted');
  assert.equal(sim.constructionStep(), false, 'nothing after the merge');
  // Reload (the sim save is the whole world): the finished annex is still there.
  const reloaded = new WorldStore(emptyWorld()); reloaded.replace(JSON.parse(JSON.stringify(store.world)));
  assert.equal(reloaded.world.passes['sim-pass'].stage, 'accepted');
  assert.equal(reloaded.world.passes['sim-pass'].source, 'sim');
});

test('builders: new live evidence sends a free agent to the site; history and busy agents do not walk', () => {
  const theme = loadTheme('real'), store = new WorldStore(emptyWorld()), scene = new Scene();
  const view = new IsoWorldView(scene, new Effects(), theme.layout, theme.scenery);
  let clock = 0; const now = () => clock * 1000;
  store.subscribe((changed, world) => view.sync(world, changed, now()));
  const at = Date.now();
  store.dispatch(makeEvent('AGENT_REGISTERED', { agentId: 'claude', name: 'Claude', role: 'r', activity: 'idle' }, { source: 'github', at: at - 5000 }));
  store.dispatch(makeEvent('AGENT_REGISTERED', { agentId: 'codex', name: 'Codex', role: 'r', activity: 'reviewing' }, { source: 'github', at: at - 5000 }));
  store.keep([plan(at - 4000), commit(1, at - 3000)]); store.flush();
  const run = s => { for (let t = 0; t < s; t += 0.05) { clock += 0.05; view.step(0.05, now(), { instant: false }, stepPath); } };
  run(20);
  const claude = scene.get('agent:claude');
  assert.equal(claude.visit ?? null, null, 'first sight of a pass is history: nobody walks');
  store.keep([commit(2, at - 1000)]); store.flush(); run(0.2);
  assert.ok(claude.visit, 'a new commit sends its author to the site');
  let seen = null;
  for (let t = 0; t < 60 && !seen; t += 0.25) { run(0.25); if (claude.anim?.state === 'assemble') seen = actionText(claude, theme.layout); }
  assert.match(seen ?? '', /Installing commit 2222222/);
  run(20);
  assert.equal(claude.visit ?? null, null, 'and walks back afterwards');
  store.keep([review('r9', 'approved', at)]); store.flush(); run(0.2);
  assert.equal(scene.get('agent:codex').visit ?? null, null, 'an agent doing its own work never leaves it');
  assert.ok(scene.get('pass:p'), 'the site is clickable');
});
