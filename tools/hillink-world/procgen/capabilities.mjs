// Pass 5A: capabilities are what the organisation can do; spaces are where it does them. The planner never
// reasons about a capability's name. It reasons about the requirements below, so a capability nobody has
// thought of yet is placed by the same rules as engineering: give it an area, an access class and a few traits.
//
// Spec (all optional except id and kind):
//   area        m² of floor it needs (a room at least DIMS.room.minSide on each side)
//   access      public (visitors reach it from the entrance) | staff | secure (deepest, never shared)
//   shareable   may share a room with other shareable capabilities
//   adjacent    kinds it wants to be near (same building, preferably across the corridor)
//   level       ground (must be at ground level) | any | below (prefers underground)
//   outdoor     needs open land (a yard, pad or field), not a room
//   vehicles    needs a road that reaches it
//   traits      free words the theme adapter uses to dress unknown kinds (e.g. 'machines', 'vehicles', 'quiet')

export const ACCESS = ['public', 'staff', 'secure'];
const ACCESS_RANK = { public: 0, staff: 1, secure: 2 };
export const accessRank = a => ACCESS_RANK[a] ?? 1;

// Known kinds and their defaults. This is a convenience catalogue, not a limit: normalizeCapability accepts any kind.
export const KNOWN = {
  command: { area: 10, access: 'staff', adjacent: ['meeting-space'], traits: ['coordination'] },
  engineering: { area: 24, access: 'staff', adjacent: ['review'], traits: ['making', 'machines'] },
  review: { area: 12, access: 'staff', adjacent: ['engineering'], traits: ['inspection'] },
  'meeting-space': { area: 12, access: 'staff', shareable: false, adjacent: ['command'], traits: ['gathering'] },
  'compute-infrastructure': { area: 6, access: 'secure', level: 'any', traits: ['machines', 'power'] },
  reception: { area: 10, access: 'public', level: 'ground', traits: ['welcome'] },
  // Pass 5B: where idle agents rest between tasks (the old World's Break Room).
  'break-space': { area: 16, access: 'staff', level: 'ground', traits: ['rest'] },
  archive: { area: 8, access: 'staff', shareable: true, traits: ['records'] },
  storage: { area: 6, access: 'staff', shareable: true, traits: ['goods'] },
};

export function normalizeCapability(input) {
  if (!input || typeof input.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,60}$/.test(input.id)) throw Error('a capability needs an id (lowercase words and dashes)');
  const kind = typeof input.kind === 'string' && /^[a-z0-9][a-z0-9-]{0,60}$/.test(input.kind) ? input.kind : input.id;
  const d = KNOWN[kind] ?? {};
  const pick = (k, fallback) => (input[k] !== undefined ? input[k] : d[k] !== undefined ? d[k] : fallback);
  const spec = {
    id: input.id, kind,
    area: Math.max(0, Number(pick('area', 10))),
    access: pick('access', 'staff'),
    shareable: Boolean(pick('shareable', false)),
    adjacent: [...pick('adjacent', [])].map(String).sort(),
    level: pick('level', 'any'),
    outdoor: Boolean(pick('outdoor', false)),
    vehicles: Boolean(pick('vehicles', false)),
    traits: [...new Set([...pick('traits', [])].map(String))].sort(),
    known: Boolean(KNOWN[kind]),
  };
  if (!ACCESS.includes(spec.access)) throw Error(`${spec.id}: access must be ${ACCESS.join(', ')}`);
  if (!['ground', 'any', 'below'].includes(spec.level)) throw Error(`${spec.id}: level must be ground, any or below`);
  if (!Number.isFinite(spec.area) || spec.area > 20_000) throw Error(`${spec.id}: area must be a number of m²`);
  return spec;
}

// The organisation HQ runs today (tools/hillink-hq): an orchestrator (command), Claude building (engineering),
// Codex and the local verifier checking work (review), meetings, the local models (compute) and a break room
// where idle agents wait for work. This is the seed program; nothing else is pre-built.
// Pass 5H (P2, Kyle 2026-10-01): T0 is one compact building, so meetings and breaks share one common room. Both
// capabilities still exist and stay separately addressable; only their room is shared (createWorld groups shareable
// founding capabilities of the same access into one room).
export const SEED_CAPABILITIES = [
  { id: 'command', kind: 'command' },
  { id: 'engineering', kind: 'engineering' },
  { id: 'review', kind: 'review' },
  { id: 'meeting-space', kind: 'meeting-space', shareable: true },
  { id: 'compute-infrastructure', kind: 'compute-infrastructure' },
  { id: 'break-space', kind: 'break-space', shareable: true },
];

// Pass 5H (P4): the one canonical display name of each known capability kind. The product UI shows these in both
// themes (C30); themed nouns live only in the World's drawing. A room shared by several capabilities is named by
// joining them. Unknown kinds fall back to their id in title case.
export const CAPABILITY_NAMES = {
  command: 'Command Office', engineering: 'Build Workshop', review: 'Engineering & Testing', 'meeting-space': 'Meeting',
  'compute-infrastructure': 'Server Bay', reception: 'Reception', 'break-space': 'Break', archive: 'Archive', storage: 'Storage',
};
export const capabilityName = spec => CAPABILITY_NAMES[spec?.kind] ?? String(spec?.id ?? '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

// Groups shareable capabilities of the same access class into one room spec (area summed, adjacency merged,
// ground-level if any member must be). Non-shareable ones stay one room each. Deterministic: input order kept.
export function shareRooms(specs) {
  const out = [], groups = new Map();
  for (const s of specs) {
    if (!s.shareable) { out.push(s); continue; }
    const g = groups.get(s.access);
    if (!g) { const room = { ...s, members: [s.id] }; groups.set(s.access, room); out.push(room); continue; }
    g.members.push(s.id); g.id = g.members.join('+'); g.area += s.area;
    g.adjacent = [...new Set([...g.adjacent, ...s.adjacent])].sort();
    g.traits = [...new Set([...g.traits, ...s.traits])].sort();
    if (s.level === 'ground') g.level = 'ground';
  }
  for (const g of groups.values()) { const kinds = new Set(specs.filter(s => g.members.includes(s.id)).map(s => s.kind)); g.adjacent = g.adjacent.filter(k => !kinds.has(k)); }
  return out;
}
