// Pass 5B: construction projects. A capability that needs new space becomes a project that moves through physical
// stages, and every move is caused by an HQ fact, never by time:
//
//   planning            the planner chose the site (CAPABILITY_REQUESTED)                surveyed, taped out
//   site-preparation    HQ asked for it to be built (CONSTRUCTION_REQUESTED)              cleared, cones, materials
//   foundation          \
//   structure            \  one stage per piece of implementation evidence HQ reports      slab, frame, walls,
//   exterior             /  for the project's task (WORK_COMMITTED), or straight to        services, fit-out
//   systems             /   furnishing when HQ reports the implementation finished
//   furnishing         /
//   inspection          HQ is testing or reviewing the project's work (TESTING, REVIEW)   inspector on site
//   operational         an approved review of the current work, completion, verification
//
// Gates, also only from HQ, fail closed. Each is cleared only by its own resume fact, and only by one newer than it:
//   blocked   (task or objective BLOCKED, failed implementation)  cleared by newer implementation evidence; during
//             planning, when no implementation evidence can exist yet, by HQ dispatching the project's work again
//   waiting   (Kyle's approval or decision is required)          cleared by newer authority to continue: Kyle's
//             approval (APPROVAL_GRANTED) or HQ dispatching the project's work again (TASK_ASSIGNED). Evidence that
//             work was done is not authority to continue: it is refused while the project waits.
//   rework    (the review asked for changes or rejected)         cleared by newer implementation evidence
// While any gate is open nothing advances: no stage change, no inspection, no completion, no verification.
//
// Chronology. Every fact carries its HQ provenance (the journal sequence number when HQ gave one, else its time).
// The project keeps a revision (one per piece of evidence) and the provenance of its latest evidence, verdict and
// gates. A review verdict counts only for the revision it inspected and only if it is newer than the inspection,
// the latest evidence and the latest verdict; an older verdict delivered late is refused as stale, so it can never
// undo a newer one. Facts whose order cannot be proven are treated as not newer (fail closed).
//
// Transitions validate everything first and change nothing when they refuse (contract.mjs also applies each event
// as a transaction). The canonical structures stay 'planned' during planning, 'under-construction' while being
// built and become 'built' (walkable, furnished, usable) only on completion.
export const STAGES = ['planning', 'site-preparation', 'foundation', 'structure', 'exterior', 'systems', 'furnishing', 'inspection', 'operational'];
export const BUILD_STAGES = STAGES.slice(STAGES.indexOf('site-preparation'), STAGES.indexOf('inspection'));
export const STAGE_LABEL = { planning: 'Planning and survey', 'site-preparation': 'Site preparation', foundation: 'Foundation', structure: 'Structure and framing', exterior: 'Exterior', systems: 'Systems and interior', furnishing: 'Furnishing', inspection: 'Inspection and testing', operational: 'Operational' };
export const stageIndex = s => STAGES.indexOf(s);

export function openProject(world, capabilityId, { taskId = null, objectiveId = null, at = null, by = null, order = null } = {}) {
  world.projects ??= {};
  const p = world.projects[capabilityId] = {
    id: capabilityId, capabilityId, stage: 'planning', taskIds: taskId ? [taskId] : [], objectiveId,
    blocked: null, blockedOrder: null, waiting: null, waitingOrder: null, rework: false, approved: false, completed: false,
    evidence: 0, revision: 0, lastEvidence: null, inspection: null, verdict: null, builders: [], history: [],
  };
  record(p, 'planning', at, by, 'site chosen by the planner', order);
  return p;
}
const record = (p, stage, at, by, why, order = null) => { p.history = [...p.history, { stage, at, by, why, ...(order ? { order } : {}) }].slice(-40); };

// HQ provenance of a fact: { seq, at }. newer(a, b): a is strictly later than b (b null: nothing to be later than).
export const orderOf = ev => ({ seq: Number.isFinite(ev?.seq) ? ev.seq : null, at: Number.isFinite(ev?.at) ? ev.at : null });
export function newer(a, b) {
  if (!b) return true;
  if (!a) return false;
  if (a.seq != null && b.seq != null) return a.seq > b.seq;
  if (a.at != null && b.at != null) return a.at > b.at;
  return false;
}
const later = (a, b) => (newer(a, b) ? a : b);

// The project a task belongs to (HQ events name tasks, not projects).
export const projectOfTask = (world, taskId) => (taskId ? Object.values(world.projects ?? {}).find(p => p.taskIds.includes(taskId)) ?? null : null);

// The first open gate, as a refusal reason, or null.
export function openGate(p) {
  if (p.blocked) return `${p.id} is blocked: ${p.blocked}`;
  if (p.waiting) return `${p.id} is waiting for Kyle: ${p.waiting}`;
  if (p.rework) return `${p.id} has rework outstanding from its review`;
  return null;
}
// An approving verdict that covers the current work: same revision, newer than the latest evidence.
export const approvedCurrent = p => Boolean(p.verdict && p.verdict.verdict === 'approved' && p.verdict.revision === p.revision && newer(p.verdict.order, p.lastEvidence));

// Stage transitions. Each returns null when applied, or the reason it was refused; a refusal changes nothing.
export const transition = {
  requested(world, p, { at, by, order }) {
    if (p.stage !== 'planning') return `${p.id} is already at ${p.stage}`;
    const gate = openGate(p); if (gate) return `${p.id} cannot be requested for construction: ${gate}`;
    p.stage = 'site-preparation'; record(p, p.stage, at, by, 'HQ asked for it to be built', order);
    return null;
  },
  // Implementation evidence (one piece), or `finished`: HQ reports the implementation complete (the fit-out is done).
  evidence(world, p, { at, by, ref, order, finished = false }) {
    if (stageIndex(p.stage) < stageIndex('site-preparation')) return `${p.id} has not been requested for construction`;
    if (p.completed) return `${p.id} is already complete`;
    if (p.waiting) return `${p.id} is waiting for Kyle (${p.waiting}); evidence of work is not authority to continue`;
    if (p.blocked && !newer(order, p.blockedOrder)) return `${p.id} is blocked (${p.blocked}); this evidence is not newer than the block`;
    if (p.verdict && !newer(order, p.verdict.order)) return `${p.id}: this evidence is older than its latest review verdict (already reviewed)`;
    const wasRework = p.rework, wasInspection = p.stage === 'inspection';
    p.blocked = null; p.blockedOrder = null; p.rework = false; p.approved = false; p.inspection = null;
    p.evidence += 1; p.revision += 1; p.lastEvidence = later(order, p.lastEvidence);
    const why = finished ? 'HQ reports the implementation finished' : ref ?? 'implementation evidence';
    let next;
    if (finished) next = 'furnishing';
    else if (wasRework) next = 'systems';
    else if (wasInspection) next = 'furnishing';
    else next = STAGES[Math.min(stageIndex(p.stage) + 1, stageIndex('furnishing'))];
    if (next !== p.stage || wasRework) { p.stage = next; record(p, p.stage, at, by, wasRework ? `rework: ${why}` : wasInspection ? `changed after inspection started: ${why}` : why, order); }
    return null;
  },
  // `midBuild`: an agent's tests while the build is still going are site work, not an inspection (nothing changes).
  inspect(world, p, { at, by, order, midBuild = true }) {
    if (p.completed) return `${p.id} is already complete`;
    if (midBuild && BUILD_STAGES.includes(p.stage) && p.stage !== 'furnishing') return null;
    const gate = openGate(p); if (gate) return gate;
    if (p.stage === 'inspection') return null;
    if (p.stage !== 'furnishing') return `${p.id} is at ${p.stage}; inspection needs the fit-out finished`;
    p.stage = 'inspection'; p.inspection = { revision: p.revision, opened: order ?? null };
    record(p, p.stage, at, by, 'HQ is testing or reviewing the work', order);
    return null;
  },
  verdict(world, p, { at, by, verdict, order }) {
    if (!['approved', 'changes'].includes(verdict)) return `verdict must be approved or changes, not ${verdict}`;
    if (p.stage !== 'inspection' || !p.inspection) return `${p.id} is not under inspection`;
    if (p.inspection.revision !== p.revision) return `${p.id}: the inspection is not of the current work`;
    if (!order || (order.seq == null && order.at == null)) return 'a review verdict needs its HQ provenance (sequence or time)';
    if (!newer(order, p.lastEvidence)) return `${p.id}: stale verdict, not newer than the latest evidence`;
    if (p.inspection.opened && !newer(order, p.inspection.opened)) return `${p.id}: stale verdict, not newer than the inspection it would decide`;
    if (p.verdict && !newer(order, p.verdict.order)) return `${p.id}: stale verdict, not newer than the latest verdict (${p.verdict.verdict})`;
    if (p.rework && verdict === 'approved') return `${p.id} has rework outstanding; only new implementation evidence clears it`;
    p.verdict = { verdict, revision: p.revision, order };
    p.approved = verdict === 'approved';
    if (verdict === 'changes') p.rework = true;
    record(p, p.stage, at, by, verdict === 'approved' ? 'review approved' : 'review requested changes', order);
    return null;
  },
  complete(world, p, { at, by, order }) {
    if (p.completed) return `${p.id} is already complete`;
    if (p.stage !== 'inspection') return `${p.id} cannot be completed: it is at ${p.stage}`;
    const gate = openGate(p); if (gate) return `${p.id} cannot be completed: ${gate}`;
    if (!approvedCurrent(p)) return `${p.id} cannot be completed: its review is not approved`;
    p.completed = true; record(p, p.stage, at, by, 'HQ reported it complete', order);
    return null;
  },
  operational(world, p, { at, by, order }) {
    if (!p.completed) return `${p.id} is not complete`;
    const gate = openGate(p); if (gate) return `${p.id} cannot become operational: ${gate}`;
    if (!approvedCurrent(p)) return `${p.id} cannot become operational: its review is not approved`;
    p.stage = 'operational'; record(p, p.stage, at, by, 'HQ verified the capability', order);
    return null;
  },
  block(world, p, { at, by, reason, order }) {
    p.blocked = String(reason ?? 'blocked in HQ').slice(0, 200); p.blockedOrder = later(order, p.blockedOrder); p.approved = false;
    record(p, p.stage, at, by, `blocked: ${p.blocked}`, order); return null;
  },
  wait(world, p, { at, by, reason, order }) {
    p.waiting = String(reason ?? 'waiting for Kyle').slice(0, 200); p.waitingOrder = later(order, p.waitingOrder);
    record(p, p.stage, at, by, `waiting: ${p.waiting}`, order); return null;
  },
  // A block set during planning, before any implementation evidence can exist: HQ dispatching the project's work
  // again (newer than the block) is its resume fact. Once building has started only new evidence lifts a block.
  unblockPlanning(world, p, { at, by, order } = {}) {
    if (!p.blocked || p.stage !== 'planning') return null;
    if (!newer(order, p.blockedOrder)) return `${p.id}: this dispatch is not newer than the block it would lift`;
    p.blocked = null; p.blockedOrder = null; record(p, p.stage, at, by, 'resumed: HQ dispatched the work again', order); return null;
  },
  // Authority to continue (Kyle's approval, or HQ dispatching the work again): clears only an older wait.
  resume(world, p, { at, by, order, why = 'authority to continue' } = {}) {
    if (!p.waiting) return null;
    if (!newer(order, p.waitingOrder)) return `${p.id}: this ${why} is not newer than the wait it would lift`;
    p.waiting = null; p.waitingOrder = null; record(p, p.stage, at, by, `resumed: ${why}`, order); return null;
  },
};

// What the structures of a project should be, from its stage (canonical status used by navigation and furnishing).
export const statusForStage = p => (p.completed ? 'built' : stageIndex(p.stage) >= stageIndex('site-preparation') ? 'under-construction' : 'planned');
// Whether builders work on site right now: only while HQ reports implementation and no gate is open.
export const buildersWork = p => !p.blocked && !p.waiting && !p.completed && BUILD_STAGES.includes(p.stage);
