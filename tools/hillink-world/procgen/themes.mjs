// Pass 5A: Real and Fantasy are two representations of one canonical world. represent(world, theme) reads the
// canonical structures and returns what each should look like in that theme (a name, an archetype for the art
// to draw, a material and a palette key). It never writes to the world: a theme has creative freedom over how
// things look and none over what exists, where it is, or what state it is in.
//
// Lookups go from specific to general: a known capability kind, then its traits, then its space role, then the
// primitive. So a capability no theme has heard of still gets a fitting look (a 'drone-lab' with the trait
// 'machines' becomes a workshop in Real and an artificer's hall in Fantasy).

export const THEMES = ['real', 'fantasy'];

const LOOK = {
  real: {
    name: 'Real World',
    primitive: {
      terrain: ['open land', 'grass'], district: ['district', 'survey line'], parcel: ['lot', 'survey stake'],
      road: ['road', 'asphalt'], path: ['footpath', 'gravel'], hallway: ['hallway', 'polished concrete'], door: ['door', 'glass door'],
      staircase: ['stair core', 'steel stair'], building: ['startup office', 'brick and glass'], wing: ['extension', 'brick and glass'],
      room: ['room', 'plasterboard'], 'outdoor-facility': ['yard', 'concrete pad'], courtyard: ['courtyard', 'paving'],
      'transport-node': ['loading bay', 'asphalt'], 'vertical-expansion': ['roof access', 'steel'], 'underground-expansion': ['basement', 'concrete'],
      'wing-anchor': ['extension site', 'survey line'], 'environment-anchor': ['tree', 'foliage'],
    },
    gate: 'gate', entrance: 'front door', opening: 'opening',
    kind: {
      command: 'operations room', engineering: 'engineering workshop', review: 'review and test bench', 'meeting-space': 'meeting room',
      'compute-infrastructure': 'server room', reception: 'reception', archive: 'records room', storage: 'storeroom', 'break-space': 'break room',
    },
    halls: { lobby: 'lobby', landing: 'landing', corridor: 'corridor', elevator: 'elevator' },
    trait: { machines: 'workshop', making: 'workshop', vehicles: 'garage', flight: 'hangar', records: 'records room', quiet: 'studio', recording: 'studio', gathering: 'hall', coordination: 'operations room', inspection: 'lab', power: 'plant room', goods: 'storeroom', welcome: 'lobby', rest: 'break room' },
    role: { 'public-area': 'lobby', 'workstation-area': 'office', 'secure-area': 'secure room', 'service-area': 'utility room' },
    environment: { tree: 'oak tree', 'tree-wet': 'willow', shrub: 'shrub', rock: 'boulder' },
    buildingByPurpose: { founding: 'startup office and workshop' },
  },
  fantasy: {
    name: 'Fantasy World',
    primitive: {
      terrain: ['wilderness', 'wild grass'], district: ['holding', 'boundary stones'], parcel: ['plot', 'marker stone'],
      road: ['dirt road', 'packed earth'], path: ['dirt path', 'trodden earth'], hallway: ['passage', 'flagstone'], door: ['door', 'oak door'],
      staircase: ['tower stair', 'stone stair'], building: ['outpost keep', 'timber and stone'], wing: ['annex', 'timber and stone'],
      room: ['chamber', 'stone'], 'outdoor-facility': ['field', 'turf'], courtyard: ['bailey', 'cobbles'],
      'transport-node': ['wagon stop', 'packed earth'], 'vertical-expansion': ['tower top', 'timber'], 'underground-expansion': ['undercroft', 'stone'],
      'wing-anchor': ['annex site', 'marker stones'], 'environment-anchor': ['tree', 'wildwood'],
    },
    gate: 'palisade gate', entrance: 'keep door', opening: 'archway',
    kind: {
      command: 'war room', engineering: 'forge workshop', review: 'assay chamber', 'meeting-space': 'council chamber',
      'compute-infrastructure': 'arcane engine chamber', reception: 'gatehouse hall', archive: 'scriptorium', storage: 'storehouse', 'break-space': 'mead hall',
    },
    halls: { lobby: 'great hall', landing: 'gallery', corridor: 'passage', elevator: 'lift cage' },
    trait: { machines: "artificer's hall", making: 'forge', vehicles: 'stables', flight: 'aerie', records: 'scriptorium', quiet: "bard's chamber", recording: "bard's chamber", gathering: 'great hall', coordination: 'war room', inspection: 'assay chamber', power: 'engine chamber', goods: 'storehouse', welcome: 'gatehouse', rest: 'mead hall' },
    role: { 'public-area': 'hall', 'workstation-area': 'workroom', 'secure-area': 'vault', 'service-area': 'undercroft store' },
    environment: { tree: 'ancient oak', 'tree-wet': 'bog willow', shrub: 'bramble', rock: 'standing stone' },
    buildingByPurpose: { founding: 'outpost keep' },
  },
};

const title = s => s.replace(/-/g, ' ');

// What a capability looks like in a theme (kind, then first matching trait, then a generic room of its role).
export function capabilityLook(theme, spec) {
  const L = LOOK[theme];
  if (L.kind[spec.kind]) return { label: L.kind[spec.kind], by: 'kind' };
  const trait = spec.traits.find(t => L.trait[t]);
  if (trait) return { label: `${L.trait[trait]} (${title(spec.kind)})`, by: `trait:${trait}` };
  return { label: `${L.role[{ public: 'public-area', staff: 'workstation-area', secure: 'secure-area' }[spec.access]]} (${title(spec.kind)})`, by: 'role' };
}

// The representation of the whole world in one theme. Pure: reads `world`, returns new objects only.
export function represent(world, theme) {
  if (!LOOK[theme]) throw Error(`unknown theme ${theme}`);
  const L = LOOK[theme], items = [];
  const look = (primitive, extra = {}) => { const [label, material] = L.primitive[primitive] ?? [title(primitive), 'default']; return { label, material, ...extra }; };
  const push = (canonicalId, primitive, extra = {}) => items.push({ canonicalId, primitive, ...look(primitive), ...extra });
  push('terrain', 'terrain');
  for (const d of Object.values(world.districts)) push(d.id, 'district');
  for (const p of Object.values(world.parcels)) push(p.id, 'parcel', { status: p.status });
  for (const r of Object.values(world.roads)) push(r.id, 'road', { status: r.status });
  for (const p of Object.values(world.paths)) push(p.id, 'path', { status: p.status });
  for (const b of Object.values(world.buildings)) {
    const founding = Object.values(world.capabilities).some(c => c.option === 'founding' && c.placement?.buildingId === b.id);
    const hosted = Object.values(world.capabilities).filter(c => c.placement?.buildingId === b.id);
    const label = founding ? L.buildingByPurpose.founding : hosted.length ? `${look('building').label}: ${capabilityLook(theme, hosted[0].spec).label}` : look('building').label;
    push(b.id, 'building', { label, status: b.status, levels: b.levels.length });
    for (const w of b.wings) push(w.id, 'wing', { status: w.status });
  }
  for (const s of Object.values(world.spaces)) {
    const caps = s.capabilities.map(id => world.capabilities[id]).filter(Boolean);
    const hall = s.primitive === 'hallway' ? (s.id.endsWith('-hall') ? (s.level === 0 ? L.halls.lobby : L.halls.landing) : L.halls.corridor) : s.primitive === 'elevator' ? L.halls.elevator : null;
    const label = caps.length ? caps.map(c => capabilityLook(theme, c.spec).label).join(' + ') : hall ?? (s.primitive === 'room' ? L.role[s.roles[0]] ?? look('room').label : look(s.primitive).label);
    push(s.id, s.primitive, { label, status: s.status, capabilities: [...s.capabilities] });
  }
  for (const d of Object.values(world.doors)) push(d.id, 'door', { label: d.kind === 'entrance' ? L.entrance : d.kind === 'gate' ? L.gate : d.kind === 'opening' ? L.opening : look('door').label, status: d.status });
  for (const p of Object.values(world.points ?? {})) push(p.id, p.primitive, { status: p.status });
  for (const a of Object.values(world.anchors)) push(a.id, a.primitive);
  for (const e of world.environment) push(e.id, 'environment-anchor', { label: L.environment[e.kind] ?? look('environment-anchor').label, kind: e.kind });
  return { theme, name: L.name, items };
}

// The one invariant a renderer relies on: both themes describe the same set of canonical things.
export function sameCanonicalSet(world) {
  const ids = THEMES.map(t => represent(world, t).items.map(i => `${i.primitive}:${i.canonicalId}`).sort().join('|'));
  return ids.every(x => x === ids[0]);
}
