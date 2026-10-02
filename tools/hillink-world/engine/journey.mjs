// Living HQ: journeys. A change of real task state no longer teleports intent straight to a new desk; it becomes a
// short purposeful trip through the places that change stands for in the building:
//
//   start   (idle or waiting -> productive, a task was just started)   lobby task board: pick the task up -> walk to
//            the workstation carrying it -> set it down there -> work
//   finish  (completed -> idle: the finished job's agent is released) the archive shelf: file the finished task ->
//            then on to the break room
//   block   (productive -> waiting, the task was just blocked)         a frustrated beat at the workstation first,
//            then on to the waiting area
//
// Truth rule: a journey is planned only from a transition the reducer actually recorded (the previous and current
// activity of the agent, and the task outcome it recorded), never from a timer, and it ends where the canonical
// placement says the agent belongs. A new real change cancels the journey in progress (engine/iso-view.mjs goTo).
const PRODUCTIVE = new Set(['coding', 'thinking', 'researching', 'reviewing', 'testing']);

// prev: { activity, taskId } as last seen; a: the agent now. Returns 'start' | 'finish' | 'block' | null.
export function transitionOf(prev, a) {
  if (!prev || !a || prev.activity === a.activity) return null;
  if (PRODUCTIVE.has(a.activity) && a.taskId && (prev.activity === 'idle' || prev.activity === 'waiting' || prev.activity === 'completed' || prev.activity === 'offline')) return 'start';
  if (prev.activity === 'completed' && (a.activity === 'idle' || a.activity === 'offline')) return a.lastTask?.outcome === 'done' ? 'finish' : null;
  if (PRODUCTIVE.has(prev.activity) && a.activity === 'waiting' && a.lastTask?.outcome === 'blocked') return 'block';
  return null;
}

// The legs of a journey before the final destination. fixtures: layout.fixtures (task board, archive).
// Each leg: { to: [x, y] | null (stay), location, clip, ms, carry, why }.
export function planJourney(kind, fixtures = {}) {
  switch (kind) {
    case 'start': return fixtures.taskBoard ? [{ to: fixtures.taskBoard.point, location: fixtures.taskBoard.location, face: fixtures.taskBoard.facing, clip: 'pickup', ms: 1300, carryAfter: true, why: 'Picking up the task' }] : [];
    case 'finish': return fixtures.archive ? [{ to: fixtures.archive.point, location: fixtures.archive.location, face: fixtures.archive.facing, clip: 'file', ms: 1400, carry: true, carryAfter: false, why: 'Filing the finished task' }] : [];
    case 'block': return [{ to: null, clip: 'frustrated', ms: 1800, why: 'Blocked' }];
    default: return [];
  }
}
export const JOURNEY_WORDS = { start: 'Heading to the desk with the task', finish: 'Filing the finished task', block: 'Blocked: leaving the desk' };
