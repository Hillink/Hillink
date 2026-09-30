// Pass 5B correction: regressions for the seven blockers in Codex's audit of deb5cca (issue #12). Each test states the
// invariant it guards; the reproductions are Codex's sequences, plus generalized cases, so they fail on deb5cca.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWorld, worldFingerprint, replayWorld } from '../procgen/world.mjs';
import { applyHqEvent, fromHqActivity } from '../procgen/contract.mjs';
import { openWorldFile, serializeWorld, deserializeWorld } from '../procgen/persist.mjs';
import { createGeneratedLayout } from '../world/generated-layout.mjs';
import { furnishSpace, placeKind } from '../procgen/furnish.mjs';
import { viewOf } from '../procgen/view.mjs';
import { startPath } from '../engine/motion.mjs';
import { DEMO_CAPABILITY, DEMO_STEPS, createConstructionDemo } from '../sim/construction-demo.mjs';
import { WorldStore, emptyWorld } from '../core/state.mjs';
import { siteFeed } from '../serve.mjs';
import { loadSite, createSiteSync, sourceLabel, signatureOf } from '../ui/site-sync.mjs';
import { routeProblems } from './route-check.mjs';

let n = 0;
const hq = (type, fields = {}) => { n += 1; return { v: 1, source: 'hq', id: `c5b-${n}`, type, at: 1000 + n, seq: n, ...fields }; };
const CAP = DEMO_CAPABILITY, T = 'task-c', O = 'obj-c';
const apply = (w, type, fields) => applyHqEvent(w, hq(type, fields));
const ok = (w, type, fields) => { const r = apply(w, type, fields); assert.equal(r.applied, true, `${type} should apply: ${r.reason}`); return r; };
const no = (w, type, fields, why) => { const r = apply(w, type, fields); assert.equal(r.applied, false, `${type} must be refused${why ? ` (${why})` : ''}`); return r; };
const snapshot = w => JSON.stringify(w);
// A project brought through HQ facts to a stage: 'site' (requested), 'furnishing' or 'inspection'.
function project(to = 'furnishing', { seed = 'hillink', cap = CAP } = {}) {
  const w = createWorld({ seed });
  ok(w, 'OBJECTIVE_CREATED', { objectiveId: O, title: 'We need a meeting room' });
  ok(w, 'CAPABILITY_REQUESTED', { capability: cap, objectiveId: O, taskId: T });
  ok(w, 'CONSTRUCTION_REQUESTED', { capabilityId: cap.id });
  ok(w, 'TASK_ASSIGNED', { taskId: T, agentId: 'claude', objectiveId: O });
  if (to === 'site') return w;
  ok(w, 'IMPLEMENTATION_DONE', { taskId: T, agentId: 'claude' });
  if (to === 'furnishing') return w;
  ok(w, 'INSPECTION_STARTED', { objectiveId: O });
  return w;
}
const P = w => w.projects[CAP.id], C = w => w.capabilities[CAP.id];

// ---------------------------------------------------------------------------------------------------------------
// Finding 1: approval, block and wait fail closed.
test('1. Codex sequence: IMPLEMENTATION_DONE, WAITING_FOR_KYLE, INSPECTION_STARTED, approve, OBJECTIVE_FINISHED stays non-operational', () => {
  const w = project('furnishing');
  ok(w, 'WAITING_FOR_KYLE', { objectiveId: O, reason: 'plan needs approval' });
  no(w, 'INSPECTION_STARTED', { objectiveId: O }, 'inspection never clears a wait');
  assert.equal(P(w).waiting, 'plan needs approval', 'the wait is still there');
  no(w, 'REVIEW_VERDICT', { taskId: T, verdict: 'approved' });
  no(w, 'OBJECTIVE_FINISHED', { objectiveId: O, outcome: 'COMPLETE' });
  assert.equal(P(w).completed, false); assert.notEqual(C(w).status, 'operational'); assert.notEqual(C(w).status, 'built');
  assert.equal(P(w).waiting, 'plan needs approval');
  // The same sequence through HQ's own feed items.
  const w2 = project('furnishing');
  const items = [
    { seq: 500, type: 'APPROVAL_REQUIRED', objectiveId: O, summary: 'Objective awaiting approval.' },
    { seq: 501, type: 'REVIEWING', objectiveId: O },
    { seq: 502, type: 'HANDOFF_RECEIVED', objectiveId: O, taskId: T, stepKind: 'review', verdict: 'approve' },
    { seq: 503, type: 'COMPLETE', objectiveId: O },
  ].map(i => ({ v: 1, at: 5000 + i.seq, activity: 'x', ...i }));
  const r = items.map(i => applyHqEvent(w2, fromHqActivity(i)));
  assert.deepEqual(r.map(x => x.applied), [true, false, false, false]);
  assert.notEqual(C(w2).status, 'operational');
});

test('1. inspection and advancement are refused while BLOCKED or WAITING; only the defined resume facts lift a gate', () => {
  // Blocked at furnishing: no inspection (by the objective or by a tester), no verdict, no completion.
  const b = project('furnishing');
  ok(b, 'BLOCKED', { taskId: T, reason: 'sandbox tests failing' });
  no(b, 'INSPECTION_STARTED', { objectiveId: O }); no(b, 'TESTING', { agentId: 'codex', taskId: T });
  assert.equal(P(b).stage, 'furnishing'); assert.equal(P(b).blocked, 'sandbox tests failing');
  ok(b, 'WORK_COMMITTED', { taskId: T, ref: 'fix' }); assert.equal(P(b).blocked, null, 'newer evidence lifts a block');
  // Waiting: evidence of work is not authority to continue.
  const w = project('site');
  ok(w, 'WAITING_FOR_KYLE', { objectiveId: O, reason: 'spend approval' });
  no(w, 'WORK_COMMITTED', { taskId: T, ref: 'c1' }, 'evidence while waiting');
  no(w, 'IMPLEMENTATION_DONE', { taskId: T });
  assert.equal(P(w).stage, 'site-preparation', 'nothing advanced');
  assert.equal(createGeneratedLayout(w).placeFor({ id: 'claude', activity: 'coding', taskId: T }), null, 'nobody builds while waiting');
  // A stale approval (older than the wait) does not lift it; a newer one does. So does HQ dispatching the work again.
  const wait = P(w).waitingOrder;
  assert.equal(applyHqEvent(w, { v: 1, source: 'hq', id: 'stale-approval', type: 'APPROVAL_GRANTED', objectiveId: O, seq: wait.seq - 1, at: wait.at - 1 }).applied, false);
  assert.ok(P(w).waiting);
  ok(w, 'APPROVAL_GRANTED', { objectiveId: O }); assert.equal(P(w).waiting, null);
  ok(w, 'WAITING_FOR_KYLE', { objectiveId: O, reason: 'decision' });
  ok(w, 'TASK_ASSIGNED', { taskId: 'task-c2', agentId: 'claude', objectiveId: O }); assert.equal(P(w).waiting, null, 'redispatch lifts it');
});

test('1. verification and completion refuse any unresolved gate: BLOCKED, WAITING, REWORK', () => {
  const finish = w => { ok(w, 'REVIEW_VERDICT', { taskId: T, verdict: 'approved' }); ok(w, 'CONSTRUCTION_COMPLETED', { capabilityId: CAP.id }); };
  // Codex: CONSTRUCTION_COMPLETED, WAITING_FOR_KYLE, CAPABILITY_VERIFIED.
  const w = project('inspection'); finish(w);
  ok(w, 'WAITING_FOR_KYLE', { objectiveId: O });
  no(w, 'CAPABILITY_VERIFIED', { capabilityId: CAP.id }); assert.equal(C(w).status, 'built'); assert.notEqual(P(w).stage, 'operational');
  const b = project('inspection'); finish(b);
  ok(b, 'BLOCKED', { objectiveId: O, reason: 'regression found' });
  no(b, 'CAPABILITY_VERIFIED', { capabilityId: CAP.id }); assert.equal(C(b).status, 'built');
  // Rework: neither completion path nor verification.
  const r = project('inspection');
  ok(r, 'REVIEW_VERDICT', { taskId: T, verdict: 'changes' });
  no(r, 'CONSTRUCTION_COMPLETED', { capabilityId: CAP.id }); no(r, 'OBJECTIVE_FINISHED', { objectiveId: O, outcome: 'COMPLETE' }); no(r, 'CAPABILITY_VERIFIED', { capabilityId: CAP.id });
  assert.equal(P(r).rework, true); assert.notEqual(C(r).status, 'operational');
  // Waiting at inspection blocks both completion paths too.
  const k = project('inspection'); ok(k, 'REVIEW_VERDICT', { taskId: T, verdict: 'approved' });
  ok(k, 'WAITING_FOR_KYLE', { objectiveId: O });
  no(k, 'CONSTRUCTION_COMPLETED', { capabilityId: CAP.id }); no(k, 'OBJECTIVE_FINISHED', { objectiveId: O, outcome: 'COMPLETE' });
  assert.equal(P(k).completed, false);
});

// ---------------------------------------------------------------------------------------------------------------
// Finding 2: a stale approval never overrides a newer rejection.
test('2. Codex reproduction: inspection, rejection, then an older not-yet-applied approval, then completion stays rework', () => {
  const w = project('furnishing');
  const item = (seq, type, extra = {}) => ({ v: 1, seq, at: 9000 + seq, activity: 'x', objectiveId: O, ...extra, type });
  const feed = i => applyHqEvent(w, fromHqActivity(i));
  assert.equal(feed(item(100, 'REVIEWING')).applied, true);
  assert.equal(feed(item(120, 'HANDOFF_RECEIVED', { taskId: T, stepKind: 'review', verdict: 'request_changes' })).applied, true);
  assert.equal(P(w).rework, true);
  const stale = feed(item(110, 'HANDOFF_RECEIVED', { taskId: T, stepKind: 'review', verdict: 'approve' }));
  assert.equal(stale.applied, false); assert.match(stale.reason, /stale|rework/);
  assert.equal(feed(item(130, 'COMPLETE')).applied, false);
  assert.equal(P(w).rework, true); assert.equal(P(w).completed, false); assert.notEqual(C(w).status, 'operational');
});

test('2. review chronology is general: duplicate, stale and out-of-order verdicts are refused in either direction', () => {
  const w = project('inspection');
  const verdict = (id, v, seq) => applyHqEvent(w, { v: 1, source: 'hq', id, type: 'REVIEW_VERDICT', taskId: T, verdict: v, seq, at: 1000 + seq });
  const s = P(w).inspection.opened.seq;
  assert.equal(verdict('v-a', 'approved', s + 10).applied, true);
  assert.equal(verdict('v-a', 'approved', s + 10).reason, 'already applied', 'redelivery');
  assert.equal(verdict('v-a2', 'approved', s + 10).applied, false, 'a duplicate at the same sequence is not newer');
  const older = verdict('v-b', 'changes', s + 5);
  assert.equal(older.applied, false, 'an older rejection never overrides a newer approval either'); assert.match(older.reason, /stale/);
  assert.equal(P(w).verdict.verdict, 'approved');
  assert.equal(verdict('v-c', 'changes', s + 20).applied, true, 'a newer rejection applies'); assert.equal(P(w).rework, true);
  assert.equal(verdict('v-d', 'approved', s + 30).applied, false, 'even a newer approval cannot clear rework: only new work does');
  // Verdicts older than the inspection, or than the latest evidence, or without provenance, are refused.
  const x = project('inspection'), xs = P(x).inspection.opened.seq;
  assert.equal(applyHqEvent(x, { v: 1, source: 'hq', id: 'pre', type: 'REVIEW_VERDICT', taskId: T, verdict: 'approved', seq: xs - 1, at: 1 }).applied, false);
  assert.equal(applyHqEvent(x, { v: 1, source: 'hq', id: 'noprov', type: 'REVIEW_VERDICT', taskId: T, verdict: 'approved' }).applied, false);
  // Evidence older than the latest verdict is refused (already reviewed); a review of older work does not count.
  const y = project('inspection'); ok(y, 'REVIEW_VERDICT', { taskId: T, verdict: 'changes' });
  assert.equal(applyHqEvent(y, { v: 1, source: 'hq', id: 'old-commit', type: 'WORK_COMMITTED', taskId: T, seq: 1, at: 1 }).applied, false);
  ok(y, 'WORK_COMMITTED', { taskId: T, ref: 'review fixes' }); ok(y, 'IMPLEMENTATION_DONE', { taskId: T });
  ok(y, 'INSPECTION_STARTED', { objectiveId: O }); ok(y, 'REVIEW_VERDICT', { taskId: T, verdict: 'approved' });
  ok(y, 'OBJECTIVE_FINISHED', { objectiveId: O, outcome: 'COMPLETE' });
  assert.equal(C(y).status, 'operational', 'a newer approval of the reworked build completes it');
});

// ---------------------------------------------------------------------------------------------------------------
// Finding 3: a refused event changes nothing.
test('3. Codex reproduction: refused OBJECTIVE_FINISHED at site preparation leaves state, fingerprint, history and ids untouched', () => {
  const w = project('site'), before = snapshot(w), fp = worldFingerprint(w);
  const r = no(w, 'OBJECTIVE_FINISHED', { objectiveId: O, outcome: 'COMPLETE' });
  assert.match(r.reason, /site-preparation/);
  assert.equal(w.ops.objectives[O].status, 'open', 'the objective status was not touched');
  assert.equal(snapshot(w), before); assert.equal(worldFingerprint(w), fp);
  assert.equal(worldFingerprint(replayWorld(w.history, { applyOps: applyHqEvent })), fp, 'replay matches');
});

test('3. every refused event, in every state, leaves the complete world identical; save, reload and replay stay identical', () => {
  const states = [project('site'), project('furnishing'), project('inspection')];
  const blocked = project('furnishing'); ok(blocked, 'BLOCKED', { taskId: T }); states.push(blocked);
  const waiting = project('inspection'); ok(waiting, 'WAITING_FOR_KYLE', { objectiveId: O }); states.push(waiting);
  const rework = project('inspection'); ok(rework, 'REVIEW_VERDICT', { taskId: T, verdict: 'changes' }); states.push(rework);
  const attempts = [['OBJECTIVE_FINISHED', { objectiveId: O, outcome: 'COMPLETE' }], ['CONSTRUCTION_COMPLETED', { capabilityId: CAP.id }], ['CAPABILITY_VERIFIED', { capabilityId: CAP.id }], ['REVIEW_VERDICT', { taskId: T, verdict: 'approved' }], ['INSPECTION_STARTED', { objectiveId: O }], ['CONSTRUCTION_REQUESTED', { capabilityId: CAP.id }], ['CAPABILITY_REQUESTED', { capability: CAP }], ['WORK_COMMITTED', { taskId: 'not-a-project-task' }], ['REVIEW_VERDICT', { taskId: T, verdict: 'maybe' }]];
  let refused = 0;
  for (const w of states) for (const [type, f] of attempts) {
    const before = snapshot(w), r = apply(w, type, f);
    if (r.applied) continue;
    refused++;
    assert.equal(snapshot(w), before, `${type} refused (${r.reason}) but changed the world`);
  }
  assert.ok(refused >= 30, `exercised ${refused} refusals`);
  for (const w of states) {
    const again = deserializeWorld(serializeWorld(w));
    assert.equal(worldFingerprint(again), worldFingerprint(w));
    assert.equal(worldFingerprint(replayWorld(w.history, { applyOps: applyHqEvent })), worldFingerprint(w));
  }
});

test('3. a transition that throws half-way (completion before a prerequisite) rolls back completely', () => {
  // Two projects in the same building: the second depends on the first, so completing it throws in setConstruction
  // after the project was marked complete. The refusal must undo that.
  const w = project('furnishing'), cap2 = { id: 'focus-room', kind: 'meeting-space', area: 30, traits: ['gathering'] };
  ok(w, 'OBJECTIVE_CREATED', { objectiveId: 'o2' });
  ok(w, 'CAPABILITY_REQUESTED', { capability: cap2, objectiveId: 'o2', taskId: 't2' });
  assert.ok(w.capabilities[cap2.id].dependsOn.includes(CAP.id), 'the second project hangs off the first');
  ok(w, 'CONSTRUCTION_REQUESTED', { capabilityId: cap2.id }); ok(w, 'TASK_ASSIGNED', { taskId: 't2', agentId: 'codex', objectiveId: 'o2' });
  ok(w, 'IMPLEMENTATION_DONE', { taskId: 't2' }); ok(w, 'INSPECTION_STARTED', { objectiveId: 'o2' }); ok(w, 'REVIEW_VERDICT', { taskId: 't2', verdict: 'approved' });
  const before = snapshot(w), r = no(w, 'OBJECTIVE_FINISHED', { objectiveId: 'o2', outcome: 'COMPLETE' });
  assert.match(r.reason, /cannot be completed before/);
  assert.equal(snapshot(w), before); assert.equal(w.projects[cap2.id].completed, false);
});

// ---------------------------------------------------------------------------------------------------------------
// Finding 4: a planned capability in an existing room is not usable.
test('4. Codex reproduction: requesting small-meeting in existing room-2 changes nothing usable until it is built', () => {
  const small = { id: 'small-meeting', kind: 'meeting-space', area: 12, traits: ['gathering'] };
  const w = createWorld({ seed: 'hillink' }), before = createGeneratedLayout(w);
  ok(w, 'OBJECTIVE_CREATED', { objectiveId: 'o-s' });
  ok(w, 'CAPABILITY_REQUESTED', { capability: small, objectiveId: 'o-s', taskId: 't-s' });
  const room = w.capabilities[small.id].placement.spaceId;
  assert.equal(w.spaces[room].status, 'built', 'the planner reused an existing built room');
  const L = createGeneratedLayout(w), was = before.locations.find(l => l.spaceId === room), now = L.locations.find(l => l.spaceId === room);
  assert.equal(now.id, was.id, 'no new semantic place (not comms)');
  assert.deepEqual(Object.keys(now.stations), Object.keys(was.stations), 'no meeting anchors appear');
  assert.deepEqual(L.furnishing[room].items.map(i => i.type), before.furnishing[room].items.map(i => i.type), 'furnishings unchanged');
  assert.equal(L.places.communicating.location, before.places.communicating.location, 'meetings still go to the existing meeting room');
  assert.match(now.represents, /Planned: small-meeting \(planned, not usable yet\)/);
  // Under construction: still not usable.
  ok(w, 'CONSTRUCTION_REQUESTED', { capabilityId: small.id }); ok(w, 'TASK_ASSIGNED', { taskId: 't-s', agentId: 'claude', objectiveId: 'o-s' });
  assert.equal(placeKind(w, w.spaces[room]), placeKind(createWorld({ seed: 'hillink' }), createWorld({ seed: 'hillink' }).spaces[room]));
  // Built and verified: now it is the meeting room it was asked for.
  ok(w, 'IMPLEMENTATION_DONE', { taskId: 't-s' }); ok(w, 'INSPECTION_STARTED', { objectiveId: 'o-s' }); ok(w, 'REVIEW_VERDICT', { taskId: 't-s', verdict: 'approved' }); ok(w, 'OBJECTIVE_FINISHED', { objectiveId: 'o-s', outcome: 'COMPLETE' });
  assert.equal(w.capabilities[small.id].status, 'operational');
  assert.equal(placeKind(w, w.spaces[room]), 'comms');
  assert.ok(Object.values(createGeneratedLayout(w).stationInfo).some(s => s.id.startsWith(`${room}:`) && s.use === 'meeting'), 'meeting seats once usable');
});

test('4. generalized: any capability placed into an existing built room keeps the room\'s prior purpose until it is usable', () => {
  const specs = [{ id: 'x-review', kind: 'review', area: 10, traits: ['inspection'] }, { id: 'x-rest', kind: 'break-space', area: 10, traits: ['rest'] }, { id: 'x-meet', kind: 'meeting-space', area: 12, traits: ['gathering'] }, { id: 'x-lab', kind: 'drone-lab', area: 12, traits: ['machines', 'flight'] }];
  let reused = 0;
  for (const seed of ['hillink', 'alpha', 'bravo', 'charlie', 'delta', 'echo']) for (const spec of specs) {
    const w = createWorld({ seed }), view = viewOf(w);
    const r = apply(w, 'CAPABILITY_REQUESTED', { capability: spec, objectiveId: `o-${spec.id}` }); if (!r.applied) continue;
    const room = w.spaces[w.capabilities[spec.id].placement.spaceId]; if (room.status !== 'built') continue;
    reused++;
    const fresh = createWorld({ seed }), priorKind = placeKind(fresh, fresh.spaces[room.id]);
    assert.equal(placeKind(w, room), priorKind, `${seed} ${spec.id}: ${room.id} keeps its purpose`);
    assert.deepEqual(furnishSpace(w, room, view).items.map(i => i.type), furnishSpace(fresh, fresh.spaces[room.id], viewOf(fresh)).items.map(i => i.type));
    const L = createGeneratedLayout(w), F = createGeneratedLayout(fresh);
    assert.deepEqual(Object.fromEntries(Object.entries(L.places).map(([k, v]) => [k, v.location])), Object.fromEntries(Object.entries(F.places).map(([k, v]) => [k, v.location])), 'no activity is redirected to it');
  }
  assert.ok(reused >= 4, `exercised ${reused} reused rooms`);
});

// ---------------------------------------------------------------------------------------------------------------
// Finding 5: construction-site pathing through real openings; disconnected navigation fails closed.
test('5. the meeting-room demo builder route enters through the door, never through room-4\'s rear wall', () => {
  const sim = createWorld({ seed: 'hillink' }); sim.simulated = true;
  const demo = createConstructionDemo({ siteWorld: sim, store: new WorldStore(emptyWorld()), now: () => 1 });
  let checked = 0;
  while (!demo.done) {
    demo.applyCanonical(); demo.applyAgents();
    const L = createGeneratedLayout(sim), site = L.locationById[`site:${CAP.id}`];
    if (!site || !Object.keys(site.stations).length) continue;
    assert.ok(!L.navEdges.some(([a, b]) => [a, b].includes('room-4~in~door-5') && [a, b].some(x => x.startsWith('site:'))), 'the old wall-crossing edge is gone');
    for (const l of L.locations.filter(x => !x.site)) for (const pt of Object.values(l.stations)) for (const [sid, spt] of Object.entries(site.stations)) {
      const r = L.route(pt, site.id, spt);
      assert.ok(r, `${l.id} -> ${sid} is reachable`);
      assert.deepEqual(routeProblems(L, r), [], `${l.id} -> ${sid} at ${demo.project.stage}`);
      assert.ok(r.some(p => p.at?.node?.startsWith('sitegate:')), 'it passes the site\'s door');
      checked++;
    }
  }
  assert.ok(checked > 100, `checked ${checked} builder routes`);
});

test('5. an unreachable construction site fails closed: no stations, nobody sent, no route, no made-up line', () => {
  const w = project('site'), L0 = createGeneratedLayout(w);
  assert.ok(L0.locationById[`site:${CAP.id}`].reachable);
  // Cut the only built approach to the site: the corridor its door opens from is not walkable.
  const cut = structuredClone(w), door = Object.values(cut.doors).find(d => d.project === CAP.id);
  const corridor = cut.spaces[cut.spaces[door.a].project ? door.b : door.a]; corridor.status = 'under-construction';
  const L = createGeneratedLayout(cut), site = L.locationById[`site:${CAP.id}`];
  assert.equal(site.reachable, false); assert.deepEqual(Object.keys(site.stations), []);
  assert.equal(L.placeFor({ id: 'claude', activity: 'coding', taskId: T }), null, 'no builder is sent to an unreachable site');
  const roomCentre = (() => { const r = site.room; return L.P.at((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, site.floor); })();
  assert.equal(L.route(L.locationById[L.spawn].door, site.id, roomCentre), null, 'no route into it');
  // The engine keeps a character in place on an unreachable route, marked as such.
  const e = { x: 10, y: 20, moving: true, path: [[1, 1]] };
  startPath(e, null, 0);
  assert.deepEqual([e.x, e.y, e.moving, e.unreachable, e.path.length], [10, 20, false, true, 0]);
});

test('5. complete emitted routes are checked across seeds: every segment clear of walls and solid furniture', () => {
  for (const seed of ['hillink', 'alpha', 'bravo', 'charlie', 'delta', 'echo']) {
    const L = createGeneratedLayout(createWorld({ seed }));
    const pts = L.locations.flatMap(l => Object.values(l.stations).map(p => [l.id, p])).concat([['spawn', L.locationById[L.spawn].door]]);
    let k = 0;
    for (let i = 0; i < pts.length; i += 3) for (let j = 1; j < pts.length; j += 5) {
      const r = L.route(pts[i][1], pts[j][0], pts[j][1]);
      assert.ok(r, `${seed}: ${pts[i][0]} -> ${pts[j][0]} reachable`);
      assert.deepEqual(routeProblems(L, r), [], `${seed}: ${pts[i][0]} -> ${pts[j][0]}`);
      k++;
    }
    assert.ok(k > 20);
    // Overflow spots (beside a taken station) are appended only through a checked connector.
    const loc = L.locationById.lounge ?? L.locations[0], st = Object.values(loc.stations)[0];
    const r = L.route(L.locationById[L.spawn].door, loc.id, [st[0] + L.overflowStep * 3, st[1]]);
    if (r) assert.deepEqual(routeProblems(L, r), [], `${seed}: overflow connector`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Finding 6: the durable cursor never runs ahead of the durable world.
function feedFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hlw-5bc-')), file = path.join(dir, 'site.json'), cursorFile = path.join(dir, 'cursor.json');
  openWorldFile(file, { seed: 'hillink' });
  const items = [{ v: 1, seq: 1, at: 11, type: 'TASK_CREATED', activity: 'planning', objectiveId: 'o-d', summary: 'Objective received: durable' }];
  const hqFake = { activity: async since => ({ activity: items.filter(i => i.seq > since) }) };
  return { dir, file, cursorFile, items, hqFake };
}
const durable = f => deserializeWorld(fs.readFileSync(f.file, 'utf8'));
const cursorOf = f => { try { return JSON.parse(fs.readFileSync(f.cursorFile, 'utf8')).seq; } catch { return 0; } };
const copies = (w, id) => w.history.filter(h => h.event?.id === id).length;

test('6. applied event + failed save + next poll: the cursor is not persisted past the unsaved world; the save is retried', async () => {
  const f = feedFixture(), site = openWorldFile(f.file, { seed: 'hillink' }), realSave = site.save;
  let fail = true; site.save = () => { if (fail) throw Error('disk full'); realSave(); };
  const feed = siteFeed({ hq: f.hqFake, site, cursorFile: f.cursorFile, autostart: false });
  await feed.tick();
  assert.equal(cursorOf(f), 0, 'no durable cursor for unsaved facts');
  await feed.tick(); // nothing new from HQ, save still failing
  assert.equal(cursorOf(f), 0, 'still not persisted (the deb5cca bug wrote {seq:1} here)');
  assert.match(feed.status.error, /disk full/); assert.equal(feed.status.dirty, true);
  fail = false; await feed.tick(); // nothing new from HQ: the dirty world is saved anyway, then the cursor
  assert.equal(feed.status.error, null); assert.equal(cursorOf(f), 1);
  assert.equal(copies(durable(f), 'hq-1-TASK_CREATED'), 1, 'the event is durable exactly once');
});

test('6. failed save then restart: the event is fetched again and ends up durable exactly once; a crash between writes is idempotent', async () => {
  const f = feedFixture();
  const s1 = openWorldFile(f.file, { seed: 'hillink' }); s1.save = () => { throw Error('EIO'); };
  const a = siteFeed({ hq: f.hqFake, site: s1, cursorFile: f.cursorFile, autostart: false }); await a.tick();
  assert.equal(cursorOf(f), 0);
  // Restart: the old world, the old cursor, HQ redelivers.
  const s2 = openWorldFile(f.file, { seed: 'hillink' });
  assert.equal(copies(s2.world, 'hq-1-TASK_CREATED'), 0, 'the unsaved fact was lost with the process');
  const b = siteFeed({ hq: f.hqFake, site: s2, cursorFile: f.cursorFile, autostart: false }); await b.tick();
  assert.equal(copies(durable(f), 'hq-1-TASK_CREATED'), 1); assert.equal(cursorOf(f), 1);
  // World saved but the cursor write fails (a crash between the two): restart redelivers, applied ids dedupe.
  f.items.push({ v: 1, seq: 2, at: 12, type: 'TASK_CREATED', activity: 'planning', objectiveId: 'o-e', summary: 'Objective received: second' });
  const s3 = openWorldFile(f.file, { seed: 'hillink' });
  const c = siteFeed({ hq: f.hqFake, site: s3, cursorFile: f.cursorFile, autostart: false, writeCursor: () => { throw Error('crash'); } }); await c.tick();
  assert.equal(cursorOf(f), 1, 'cursor behind the world');
  const s4 = openWorldFile(f.file, { seed: 'hillink' });
  const d = siteFeed({ hq: f.hqFake, site: s4, cursorFile: f.cursorFile, autostart: false }); await d.tick();
  assert.equal(copies(durable(f), 'hq-2-TASK_CREATED'), 1, 'exactly once after redelivery'); assert.equal(cursorOf(f), 2);
});

// ---------------------------------------------------------------------------------------------------------------
// Finding 7: startup never silently shows a stale or legacy World.
test('7. first-poll race: boot shows snapshot A, the first poll returns newer B, and B is applied and rendered', async () => {
  const A = createWorld({ seed: 'hillink' }), B = project('site');
  const applied = [];
  const sync = createSiteSync({ fetchSite: async () => B, apply: w => applied.push(w), source: 'generated', world: A });
  assert.equal(await sync.poll(), true);
  assert.equal(applied.length, 1); assert.equal(signatureOf(applied[0]), signatureOf(B), 'B is shown (deb5cca skipped it forever)');
  assert.equal(await sync.poll(), false); assert.equal(applied.length, 1, 'an unchanged world is not rebuilt');
  // The page uses this sync (deb5cca's pollSite recorded B's signature on the first poll without rendering it).
  const main = fs.readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
  assert.ok(main.includes('createSiteSync({ fetchSite, source: siteSource, world: siteWorld'), 'the page polls through the sync'); assert.ok(!main.includes('const first = !pollSite.sig'), 'the first-poll skip is gone');
});

test('7. generated world unavailable: boot retries, shows an identified fallback, keeps retrying and recovers; legacy only when chosen', async () => {
  let up = false, calls = 0;
  const fetchSite = async () => { calls++; if (!up) throw Error('/api/site answered HTTP 503'); return createWorld({ seed: 'hillink' }); };
  const boot = await loadSite(fetchSite, { attempts: 3 });
  assert.equal(boot.world, null); assert.equal(calls, 3, 'boot retried'); assert.match(boot.error, /503/);
  const reports = [], applied = [];
  const sync = createSiteSync({ fetchSite, apply: (w, info) => applied.push(info), report: r => reports.push(r.state), source: 'unavailable', world: null });
  assert.match(sourceLabel(sync.state, boot.error), /GENERATED WORLD UNAVAILABLE.*fallback/);
  await sync.poll(); assert.equal(sync.state, 'unavailable'); assert.equal(applied.length, 0);
  up = true; await sync.poll();
  assert.equal(sync.state, 'generated'); assert.deepEqual(applied, [{ recovered: true }]); assert.equal(sourceLabel(sync.state), null, 'no fallback label once recovered');
  // Explicit legacy is labelled as such and never polled into something else.
  const legacy = createSiteSync({ fetchSite, apply: () => assert.fail('legacy must not switch'), source: 'legacy' });
  assert.equal(await legacy.poll(), false); assert.match(sourceLabel('legacy'), /\?world=legacy/);
  // The page wires it: boot through loadSite, a labelled source badge, and LIVE never unqualified on a fallback.
  const main = fs.readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
  assert.match(main, /loadSite\(fetchSite/); assert.match(main, /createSiteSync\(/); assert.match(main, /fallback building, not the generated World/);
  assert.doesNotMatch(main, /const first = !pollSite\.sig/, 'the first-poll skip is gone');
});
