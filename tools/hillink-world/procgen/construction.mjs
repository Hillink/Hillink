// Pass 5B: construction projects. A capability that needs new space becomes a project that moves through physical
// stages, and every move is caused by an HQ fact, never by time:
//
//   planning            the planner chose the site (CAPABILITY_REQUESTED)                surveyed, taped out
//   site-preparation    HQ asked for it to be built (CONSTRUCTION_REQUESTED)              cleared, cones, materials
//   foundation          \
//   structure            \  one stage per piece of implementation evidence HQ reports      slab, frame, walls,
//   exterior             /  for the project's task (WORK_COMMITTED)                         services, fit-out
//   systems             /
//   furnishing         /
//   inspection          HQ is testing or reviewing the project's work (TESTING, REVIEW)   inspector on site
//   operational         HQ reports it complete after an approved review (CONSTRUCTION_COMPLETED), then verified
//
// Flags, also only from HQ: blocked (the task is BLOCKED; builders stop, nothing advances until new evidence),
// waiting (Kyle's approval is required: builders stop and it cannot complete until HQ reports new work or the
// approval), rework (the review asked for changes: back to systems, and it cannot be
// completed until it is inspected and approved again). The canonical structures stay 'planned' during planning,
// 'under-construction' while being built and become 'built' (walkable, furnished, usable) only on completion.
export const STAGES = ['planning', 'site-preparation', 'foundation', 'structure', 'exterior', 'systems', 'furnishing', 'inspection', 'operational'];
export const BUILD_STAGES = STAGES.slice(STAGES.indexOf('site-preparation'), STAGES.indexOf('inspection'));
export const STAGE_LABEL = { planning: 'Planning and survey', 'site-preparation': 'Site preparation', foundation: 'Foundation', structure: 'Structure and framing', exterior: 'Exterior', systems: 'Systems and interior', furnishing: 'Furnishing', inspection: 'Inspection and testing', operational: 'Operational' };
export const stageIndex = s => STAGES.indexOf(s);

export function openProject(world, capabilityId, { taskId = null, objectiveId = null, at = null, by = null } = {}) {
  world.projects ??= {};
  const p = world.projects[capabilityId] = { id: capabilityId, capabilityId, stage: 'planning', taskIds: taskId ? [taskId] : [], objectiveId, blocked: null, waiting: null, rework: false, approved: false, completed: false, evidence: 0, builders: [], history: [] };
  record(p, 'planning', at, by, 'site chosen by the planner');
  return p;
}
const record = (p, stage, at, by, why) => { p.history = [...p.history, { stage, at, by, why }].slice(-40); };

// The project a task belongs to (HQ events name tasks, not projects).
export const projectOfTask = (world, taskId) => (taskId ? Object.values(world.projects ?? {}).find(p => p.taskIds.includes(taskId)) ?? null : null);

// Stage transitions. Each returns null when applied, or the reason it was refused (the event is then not applied).
export const transition = {
  requested(world, p, { at, by }) {
    if (p.stage !== 'planning') return `${p.id} is already at ${p.stage}`;
    p.stage = 'site-preparation'; record(p, p.stage, at, by, 'HQ asked for it to be built');
    return null;
  },
  evidence(world, p, { at, by, ref }) {
    if (stageIndex(p.stage) < stageIndex('site-preparation')) return `${p.id} has not been requested for construction`;
    if (p.completed) return `${p.id} is already complete`;
    // New work after a block or a rejected review resumes the build.
    p.blocked = null; p.waiting = null; p.evidence += 1; p.approved = false;
    if (p.rework) { p.rework = false; p.stage = 'systems'; record(p, p.stage, at, by, `rework: ${ref ?? 'new evidence'}`); return null; }
    if (p.stage === 'inspection') { p.stage = 'furnishing'; record(p, p.stage, at, by, `changed after inspection started: ${ref ?? 'new evidence'}`); return null; }
    const next = STAGES[Math.min(stageIndex(p.stage) + 1, stageIndex('furnishing'))];
    if (next !== p.stage) { p.stage = next; record(p, p.stage, at, by, ref ?? 'implementation evidence'); }
    return null;
  },
  // HQ reports the implementation finished successfully: all the build evidence is in, so the fit-out is done.
  finished(world, p, { at, by }) {
    if (stageIndex(p.stage) < stageIndex('site-preparation')) return `${p.id} has not been requested for construction`;
    if (p.completed || p.stage === 'inspection') return null;
    p.blocked = null; p.waiting = null;
    if (p.rework) p.rework = false;
    if (p.stage !== 'furnishing') { p.stage = 'furnishing'; record(p, p.stage, at, by, 'HQ reports the implementation finished'); }
    return null;
  },
  inspect(world, p, { at, by }) {
    // Tests the builders run mid-build are work on site, not an inspection: the stage does not move.
    if (BUILD_STAGES.includes(p.stage) && p.stage !== 'furnishing') return null;
    p.waiting = null;
    if (p.stage !== 'furnishing') return p.stage === 'inspection' ? null : `${p.id} is at ${p.stage}; inspection needs the fit-out finished`;
    p.stage = 'inspection'; record(p, p.stage, at, by, 'HQ is testing or reviewing the work');
    return null;
  },
  verdict(world, p, { at, by, verdict }) {
    if (p.stage !== 'inspection') return `${p.id} is not under inspection`;
    if (verdict === 'approved') { p.approved = true; record(p, p.stage, at, by, 'review approved'); return null; }
    p.approved = false; p.rework = true; record(p, p.stage, at, by, 'review requested changes');
    return null;
  },
  complete(world, p, { at, by }) {
    if (p.stage !== 'inspection' || !p.approved) return `${p.id} cannot be completed: ${p.stage !== 'inspection' ? `it is at ${p.stage}` : 'its review is not approved'}`;
    if (p.blocked) return `${p.id} is blocked: ${p.blocked}`;
    if (p.waiting) return `${p.id} is waiting for Kyle: ${p.waiting}`;
    p.completed = true; record(p, p.stage, at, by, 'HQ reported it complete');
    return null;
  },
  operational(world, p, { at, by }) {
    if (!p.completed) return `${p.id} is not complete`;
    p.stage = 'operational'; record(p, p.stage, at, by, 'HQ verified the capability');
    return null;
  },
  block(world, p, { at, by, reason }) { p.blocked = String(reason ?? 'blocked in HQ').slice(0, 200); record(p, p.stage, at, by, `blocked: ${p.blocked}`); return null; },
  wait(world, p, { at, by, reason }) { p.waiting = String(reason ?? 'waiting for Kyle').slice(0, 200); record(p, p.stage, at, by, `waiting: ${p.waiting}`); return null; },
  resume(world, p) { p.waiting = null; return null; },
};

// What the structures of a project should be, from its stage (canonical status used by navigation and furnishing).
export const statusForStage = p => (p.completed ? 'built' : stageIndex(p.stage) >= stageIndex('site-preparation') ? 'under-construction' : 'planned');
// Whether builders work on site right now: only while HQ reports implementation for the project and it is not blocked.
// Waiting for Kyle stops the site as surely as a block does.
export const buildersWork = p => !p.blocked && !p.waiting && !p.completed && BUILD_STAGES.includes(p.stage);
