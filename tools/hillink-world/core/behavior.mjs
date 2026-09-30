// Visual policy: interprets semantic World state into "where should this be and what clip plays".
// Agent logic says status = testing; this layer says go to a lab bench and play `test`.
// Pure functions; the renderer only draws the result.
export const ACTIVITY_PLACE = {
  coding: { location: 'development', stations: ['desk1', 'desk2', 'desk3', 'desk4', 'desk5', 'desk6'], clip: 'work' },
  thinking: { location: 'development', stations: ['desk1', 'desk2', 'desk3', 'desk4', 'desk5', 'desk6'], clip: 'think' },
  reviewing: { location: 'development', stations: ['review', 'desk1', 'desk2', 'desk3'], clip: 'review' },
  researching: { location: 'archive', stations: ['reading1', 'reading2', 'shelf'], clip: 'read' },
  testing: { location: 'testing', stations: ['bench1', 'bench2', 'bench3', 'rig'], clip: 'test' },
  communicating: { location: 'comms', stations: ['table1', 'table2', 'table3', 'table4'], clip: 'talk' },
  waiting: { location: 'queue', stations: ['wait1', 'wait2', 'wait3', 'wait4'], clip: 'wait' },
  idle: { location: 'command', stations: ['lounge1', 'lounge2', 'lounge3', 'lounge4', 'lounge5', 'lounge6'], clip: 'idle' },
  offline: { location: 'command', stations: ['lounge6', 'lounge5', 'lounge4', 'lounge3', 'lounge2', 'lounge1'], clip: 'offline' },
  // Completed and error stay where the work happened; only the clip changes.
  completed: { stay: true, clip: 'success' },
  // The orchestrator's turns take seconds: it works where it stands rather than walking to a desk.
  coordinating: { stay: true, clip: 'inspect' },
  error: { stay: true, clip: 'error' },
};

// A layout may re-home an activity (for example idle agents to a break room) via `layout.places`.
const ruleFor = (activity, layout) => ({ ...(ACTIVITY_PLACE[activity] ?? ACTIVITY_PLACE.idle), ...(layout.places?.[activity] ?? {}) });
// Only a meeting sends agents to the meeting room; a one-off message (a handoff) keeps the sender where it is.
// Pass 5B: a generated layout may send an agent to a construction site (its task is a project HQ is building).
// Pass 5E: `rules` (agent id -> rule) is the theme's staging for agents that are not working members (candidates).
const ruleForAgent = (a, layout, rules) => rules?.[a.id] ?? layout.placeFor?.(a) ?? (a.activity === 'communicating' && !a.meetingId ? { stay: true, clip: 'talk' } : ruleFor(a.activity, layout));

// Assign stations deterministically so agents don't pile onto one spot.
// `current` is agentId -> {location, station}; agents keep their station while their activity keeps the same room.
export function placeAgents(agents, current, layout, rules = null) {
  current ??= {};
  const taken = new Set(), result = {};
  const ordered = [...agents].sort((a, b) => a.id.localeCompare(b.id));
  // Pass 1: agents that stay (completed/error) or keep an existing valid station.
  for (const a of ordered) {
    const rule = ruleForAgent(a, layout, rules);
    // A place from another theme's layout may not exist here (e.g. the Realistic break room).
    const prev = layout.locationById[current[a.id]?.location]?.stations[current[a.id]?.station] ? current[a.id] : null;
    if (rule.stay && prev) { result[a.id] = { ...prev, clip: rule.clip }; taken.add(`${prev.location}:${prev.station}`); continue; }
    if (prev && prev.location === rule.location && rule.stations?.includes(prev.station) && !taken.has(`${prev.location}:${prev.station}`)) {
      result[a.id] = { location: prev.location, station: prev.station, clip: rule.clip }; taken.add(`${prev.location}:${prev.station}`);
    }
  }
  // Pass 2: everyone else takes the first free station (ordered, so conversation partners sit at adjacent tables).
  for (const a of ordered) {
    if (result[a.id]) continue;
    const own = ruleForAgent(a, layout, rules), rule = own.stay ? ruleFor('idle', layout) : own;
    const loc = layout.locationById[rule.location];
    let station = rule.stations.find(s => !taken.has(`${loc.id}:${s}`));
    let overflow = 0;
    if (!station) { station = rule.stations[0]; overflow = [...taken].filter(k => k.startsWith(`${loc.id}:${station}`)).length; }
    const key = overflow ? `${loc.id}:${station}#${overflow}` : `${loc.id}:${station}`;
    taken.add(key);
    result[a.id] = { location: loc.id, station, overflow, clip: a.activity === 'completed' ? 'success' : a.activity === 'error' ? 'error' : rule.clip };
  }
  return result;
}

export function stationPoint(place, layout) {
  const loc = layout.locationById[place.location];
  const [x, y] = loc.stations[place.station];
  // Overflow agents fan out in a row instead of stacking.
  const step = layout.overflowStep ?? 44, n = place.overflow || 0;
  return [x + n * step, y + (n ? step * 0.7 : 0)];
}

// Tasks are dots: queued tasks wait in the queue room, active ones follow their agent, finished ones rest in the archive.
export function taskPlacement(tasks, layout) {
  const queued = [], archived = [], out = {};
  for (const t of Object.values(tasks)) {
    if (t.status === 'active' && t.agentId) out[t.id] = { follow: t.agentId };
    else if (t.status === 'queued' || t.status === 'blocked') queued.push(t);
    else archived.push(t);
  }
  const grid = (list, { x, y, cols, step }) => list.sort((a, b) => a.createdAt - b.createdAt).forEach((t, i) => { out[t.id] = { point: [x + (i % cols) * step, y + Math.floor(i / cols) * step] }; });
  grid(queued, layout.taskSlots.queue);
  grid(archived.slice(-60), layout.taskSlots.archive);
  return out;
}
