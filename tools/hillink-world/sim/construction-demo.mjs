// Pass 5B demonstration: "We need a meeting room." A clearly labelled simulation of the HQ facts a real build would
// produce, applied step by step to a simulated copy of the canonical world (world.simulated: never saved, refuses
// live HQ events) and, in step, to the World store's simulated agents. Nothing here advances on a timer: each step is
// one batch of facts, and the construction stage is whatever those facts make it (procgen/construction.mjs).
import { makeEvent } from '../core/events.mjs';
import { applyHqEvent } from '../procgen/contract.mjs';

export const DEMO_CAPABILITY = { id: 'meeting-room', kind: 'meeting-space', area: 30, traits: ['gathering'] };
const TASK = 'sim-build-meeting-room', OBJECTIVE = 'sim-objective-meeting-room', CAP = DEMO_CAPABILITY.id;
const hq = (type, fields = {}) => ({ type, ...fields });

// Each step: what happened (label), the HQ facts, and what the simulated agents do.
export const DEMO_STEPS = [
  { label: 'Kyle asks for a meeting room; the planner chooses a site (planning and survey)',
    hq: [hq('OBJECTIVE_CREATED', { objectiveId: OBJECTIVE, title: 'We need a meeting room' }), hq('CAPABILITY_REQUESTED', { capability: DEMO_CAPABILITY, objectiveId: OBJECTIVE, taskId: TASK })],
    sim: e => e('TASK_CREATED', { taskId: TASK, title: 'Build the meeting room' }) },
  { label: 'HQ assigns the build to Claude; site preparation',
    hq: [hq('CONSTRUCTION_REQUESTED', { capabilityId: CAP }), hq('TASK_ASSIGNED', { taskId: TASK, agentId: 'claude', objectiveId: OBJECTIVE }), hq('IMPLEMENTATION_STARTED', { agentId: 'claude', taskId: TASK })],
    sim: e => e('TASK_STARTED', { taskId: TASK, agentId: 'claude', activity: 'coding', progress: { kind: 'stage', stage: 'Implementing' } }) },
  { label: 'First implementation evidence: foundation', hq: [hq('WORK_COMMITTED', { taskId: TASK, agentId: 'claude', ref: 'c1 schema' })] },
  { label: 'Second evidence: structure and framing', hq: [hq('WORK_COMMITTED', { taskId: TASK, agentId: 'claude', ref: 'c2 routes' })] },
  { label: 'HQ reports the task BLOCKED: work stops on site',
    hq: [hq('BLOCKED', { taskId: TASK, agentId: 'claude', reason: 'sandbox tests failing' })],
    sim: e => e('TASK_BLOCKED', { taskId: TASK, reason: 'sandbox tests failing' }) },
  { label: 'Claude resumes with new evidence: exterior',
    hq: [hq('IMPLEMENTATION_STARTED', { agentId: 'claude', taskId: TASK }), hq('WORK_COMMITTED', { taskId: TASK, agentId: 'claude', ref: 'c3 fix' })],
    sim: e => e('TASK_STARTED', { taskId: TASK, agentId: 'claude', activity: 'coding', progress: { kind: 'stage', stage: 'Implementing' } }) },
  { label: 'Evidence: systems and interior', hq: [hq('WORK_COMMITTED', { taskId: TASK, agentId: 'claude', ref: 'c4 ui' })] },
  { label: 'Evidence: furnishing', hq: [hq('WORK_COMMITTED', { taskId: TASK, agentId: 'claude', ref: 'c5 polish' })] },
  { label: 'Codex tests the work: inspection',
    hq: [hq('TESTING', { agentId: 'codex', taskId: TASK })],
    sim: e => e('AGENT_TESTING', { agentId: 'codex', taskId: TASK }) },
  { label: 'Review requests changes: rework, not operational', hq: [hq('REVIEW_VERDICT', { taskId: TASK, verdict: 'changes' })] },
  { label: 'Claude reworks: back to systems', hq: [hq('WORK_COMMITTED', { taskId: TASK, agentId: 'claude', ref: 'c6 review fixes' })], sim: e => e('AGENT_IDLE', { agentId: 'codex' }) },
  { label: 'Evidence: furnishing again', hq: [hq('WORK_COMMITTED', { taskId: TASK, agentId: 'claude', ref: 'c7 fit-out' })] },
  { label: 'Codex inspects again', hq: [hq('TESTING', { agentId: 'codex', taskId: TASK })], sim: e => e('AGENT_TESTING', { agentId: 'codex', taskId: TASK }) },
  { label: 'Review approved', hq: [hq('REVIEW_VERDICT', { taskId: TASK, verdict: 'approved' })] },
  { label: 'HQ reports the construction complete: the room is built, furnished and walkable',
    hq: [hq('CONSTRUCTION_COMPLETED', { capabilityId: CAP }), hq('TASK_FINISHED', { taskId: TASK, outcome: 'COMPLETE' })],
    sim: e => { e('TASK_COMPLETED', { taskId: TASK }); e('AGENT_IDLE', { agentId: 'codex' }); } },
  { label: 'HQ verifies the capability: operational; the team meets in it',
    hq: [hq('CAPABILITY_VERIFIED', { capabilityId: CAP })],
    sim: e => e('MEETING_STARTED', { meetingId: 'sim-first-meeting', agentIds: ['claude', 'codex'], topic: 'First meeting in the new room' }) },
];

export function createConstructionDemo({ siteWorld, store, now = () => Date.now() }) {
  let index = 0, n = 0;
  const e = (type, fields) => store.dispatch(makeEvent(type, fields, { source: 'sim', at: now() }));
  return {
    get index() { return index; },
    get done() { return index >= DEMO_STEPS.length; },
    get next() { return DEMO_STEPS[index]?.label ?? null; },
    // Applies the next step's HQ facts to the simulated canonical world. Returns what each fact did.
    applyCanonical() {
      const step = DEMO_STEPS[index]; if (!step) return null;
      return step.hq.map(f => ({ type: f.type, ...applyHqEvent(siteWorld, { v: 1, source: 'hq-simulated', id: `sim-hq-${index}-${++n}`, at: now(), ...f }) }));
    },
    // Then moves the simulated agents to match.
    applyAgents() { const step = DEMO_STEPS[index]; step?.sim?.(e); index += 1; return step?.label ?? null; },
    get project() { return siteWorld.projects?.[CAP] ?? null; },
  };
}
