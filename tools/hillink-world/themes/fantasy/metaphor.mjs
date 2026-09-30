// Pass 5G: the Fantasy metaphor layer. One declarative table that says what each canonical thing MEANS in the
// kingdom: which district stands for which capability, where an agent's work belongs, which archetype a role looks
// like by default, how provisioning and construction read, and what the kingdom's non-agent entities are.
//
// Everything here is data plus small pure lookups. Nothing reads or writes canonical state beyond the read-only
// values it is handed, nothing is keyed by an agent id, and nothing a definition supplies is compiled or executed:
// matching is literal words only (the same rule as attribution, core/agents.mjs). The kingdom layout
// (world/kingdom-layout.mjs), the derived entities (themes/fantasy/entities.mjs), the interpreter table
// (themes/interpreter.mjs) and the kingdom skin (render/kingdom-skin.mjs) all read from here; none of them hard-codes a
// district, a role or a look of its own.
//
// Labels used in PASS5G.md: CANONICAL (HQ truth), DERIVED (a pure function of canonical truth), THEME (how the kingdom
// represents it), COSMETIC (idle life, never a fact).

// ---- Districts (THEME). Each stands for a kind of capability. `kinds` and `traits` are matched against canonical
// capability specs (procgen/capabilities.mjs) to decide whether HQ actually has what the district represents
// (`established`); an unbacked district is drawn as an unclaimed plot and says so, never as a capability claim.
// `row`: back (roofed halls, cutaway) or front (open-air grounds, fenced). `width` in plan units (about 28.6 per metre).
export const DISTRICTS = {
  gate: { name: 'Kingdom Gate', represents: 'Security and arrivals', row: 'front', width: 260, kinds: ['reception', 'security'], traits: ['welcome', 'security'], always: true, structure: 'gatehouse' },
  summoning: { name: 'Summoning Circle', represents: 'Agent provisioning (HQ lifecycle)', row: 'front', width: 520, kinds: [], traits: [], always: true, structure: 'circle' },
  forge: { name: 'The Forge', represents: 'Engineering: implementation and construction work', row: 'front', width: 420, kinds: ['engineering'], traits: ['making'], structure: 'forge' },
  hearth: { name: 'Hearth Commons', represents: 'Rest between tasks (break space)', row: 'front', width: 340, kinds: ['break-space'], traits: ['rest'], structure: 'commons' },
  academy: { name: 'The Academy', represents: 'Training and local models', row: 'front', width: 320, kinds: ['training'], traits: ['learning'], structure: 'academy' },
  yard: { name: 'Builders\' Yard', represents: 'Construction grounds for capabilities HQ is building', row: 'front', width: 520, kinds: ['storage'], traits: ['goods'], always: true, structure: 'yard' },
  library: { name: 'Great Library', represents: 'Memory and archive', row: 'back', width: 360, kinds: ['archive'], traits: ['records'], structure: 'library' },
  oracle: { name: 'Oracle Chamber', represents: 'QA: review, testing and inspection', row: 'back', width: 300, kinds: ['review'], traits: ['inspection'], structure: 'tower' },
  throne: { name: 'King\'s Command', represents: 'Orchestration, command and council', row: 'back', width: 480, kinds: ['command', 'meeting-space'], traits: ['coordination', 'gathering'], structure: 'keep' },
  vault: { name: 'The Vault', represents: 'Finance', row: 'back', width: 260, kinds: ['finance'], traits: ['money'], structure: 'vault' },
  observatory: { name: 'Observatory', represents: 'Analytics', row: 'back', width: 260, kinds: ['analytics'], traits: ['observation', 'data'], structure: 'dome' },
  arcane: { name: 'Arcane Engine', represents: 'Compute infrastructure', row: 'back', width: 300, kinds: ['compute-infrastructure'], traits: ['power', 'machines'], structure: 'engine' },
};
export const DISTRICT_ORDER = { front: ['gate', 'summoning', 'forge', 'hearth', 'academy', 'yard'], back: ['library', 'oracle', 'throne', 'vault', 'observatory', 'arcane'] };

const lower = v => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const words = list => (Array.isArray(list) ? list.map(lower).filter(Boolean) : []);

// Which district a canonical capability spec belongs to (by its kind, then its traits), or null. DERIVED.
export function districtOfCapability(spec) {
  if (!spec) return null;
  const kind = lower(spec.kind), traits = words(spec.traits);
  for (const [id, d] of Object.entries(DISTRICTS)) if (d.kinds.includes(kind)) return id;
  for (const [id, d] of Object.entries(DISTRICTS)) if (d.traits.some(t => traits.includes(t))) return id;
  return null;
}
const usable = c => Boolean(c) && (c.status === 'built' || c.status === 'operational');
// Districts HQ really backs: a usable canonical capability maps to it, or it is kingdom infrastructure (`always`). DERIVED.
export function establishedDistricts(world) {
  const out = new Set(Object.entries(DISTRICTS).filter(([, d]) => d.always).map(([id]) => id));
  for (const c of Object.values(world?.capabilities ?? {})) if (usable(c)) { const d = districtOfCapability(c.spec); if (d) out.add(d); }
  return out;
}

// ---- Domain rules (THEME): an agent's home district, from what its canonical definition says it does. First match
// wins. Literal lowercase words only; a definition can never inject a pattern.
//   field: responsibilities | capabilities | team | provider | kind | role (words of role and roleTitle)
export const DOMAIN_RULES = [
  { field: 'kind', any: ['person'], district: 'throne', domain: 'owner' },
  { field: 'responsibilities', any: ['orchestration', 'coordination'], district: 'throne', domain: 'orchestration', idleUses: ['throne', 'relax'] },
  { field: 'capabilities', any: ['coordinate', 'orchestrate'], district: 'throne', domain: 'orchestration', idleUses: ['throne', 'relax'] },
  { field: 'responsibilities', any: ['implementation', 'construction'], district: 'forge', domain: 'implementation' },
  { field: 'capabilities', any: ['implement', 'implement-repo', 'build'], district: 'forge', domain: 'implementation' },
  { field: 'responsibilities', any: ['review', 'testing', 'inspection', 'qa'], district: 'oracle', domain: 'qa' },
  { field: 'capabilities', any: ['inspect-repo', 'review-repo', 'verify-hq', 'verify-unit', 'review', 'test'], district: 'oracle', domain: 'qa' },
  { field: 'team', any: ['finance', 'treasury'], district: 'vault', domain: 'finance' },
  { field: 'role', any: ['finance', 'treasurer', 'budget', 'accounting'], district: 'vault', domain: 'finance' },
  { field: 'team', any: ['analytics', 'data'], district: 'observatory', domain: 'analytics' },
  { field: 'role', any: ['analytics', 'analyst', 'metrics', 'observer'], district: 'observatory', domain: 'analytics' },
  { field: 'team', any: ['outreach', 'marketing', 'sales', 'growth'], district: 'gate', domain: 'outreach' },
  { field: 'role', any: ['outreach', 'scout', 'marketing', 'sales'], district: 'gate', domain: 'outreach' },
  { field: 'team', any: ['security'], district: 'gate', domain: 'security' },
  { field: 'responsibilities', any: ['research', 'memory', 'archive'], district: 'library', domain: 'memory' },
  { field: 'capabilities', any: ['summarize', 'research'], district: 'academy', domain: 'apprentice' },
  { field: 'provider', any: ['local', 'ollama'], district: 'academy', domain: 'apprentice' },
  { field: 'kind', any: ['process'], district: 'arcane', domain: 'process' },
];
const DEFAULT_DOMAIN = { district: 'hearth', domain: 'general', idleUses: null };
function fieldWords(def, field) {
  if (field === 'role') return [def.role, def.roleTitle].filter(x => typeof x === 'string').flatMap(s => s.toLowerCase().split(/[^a-z0-9-]+/)).filter(Boolean);
  const v = def[field];
  return Array.isArray(v) ? words(v) : typeof v === 'string' ? [lower(v)] : [];
}
// { district, domain, rule } for a definition (any id, including one the source has never seen). DERIVED.
export function domainOf(def) {
  if (!def) return { ...DEFAULT_DOMAIN, rule: null };
  for (const [i, r] of DOMAIN_RULES.entries()) { const w = fieldWords(def, r.field); if (r.any.some(x => w.includes(x))) return { district: r.district, domain: r.domain, idleUses: r.idleUses ?? null, rule: i }; }
  return { ...DEFAULT_DOMAIN, rule: null };
}

// ---- Archetypes (THEME): the kingdom's default look for a role. Used when an agent's definition gives no Fantasy look
// of its own; an explicit Fantasy appearance always wins (render/appearance.mjs). `figure` is data for the procedural
// figure (render/figure.mjs); `overlays` are named accents the kingdom skin draws around it (wings, one red bionic eye,
// goblin ears, a cyclops eye); `body` names the drawer the rig should eventually get (see RIG_TARGETS).
export const ARCHETYPES = {
  king: { figure: { shirt: '#1f6b3a', sleeve: '#1f6b3a', pants: '#173d24', hair: '#e9e4d8', beard: '#e9e4d8', skin: '#efc6a2', hat: 'crown', hatColor: '#d9b44a', cape: '#c8a24a', belt: '#d9b44a' }, overlays: ['regal-glow'], body: 'humanoid' },
  dwarf: { figure: { shirt: '#b5552b', sleeve: '#b5552b', pants: '#5a3b24', hair: '#c4521f', beard: '#c4521f', beardLong: true, skin: '#eab28a', hat: 'helmet', hatColor: '#9aa6b4', horns: true, belt: '#3c2a1a', scale: 0.86, wide: 1.2, headScale: 1.08 }, overlays: ['hammer'], body: 'dwarf' },
  cyborg: { figure: { shirt: '#2a5aa8', sleeve: '#4a7cc8', pants: '#1d3561', skin: '#e0b894', hair: '#2b2f38', metalArm: true, core: true, glove: '#9fb3cc', belt: '#0f2344' }, overlays: ['armor', 'bionic-eye'], body: 'humanoid' },
  cupid: { figure: { shirt: '#f7c6d9', sleeve: '#f7c6d9', pants: '#fbf3f6', hair: '#f2d27a', skin: '#f6d2b8', belt: '#e88aae', scale: 0.84 }, overlays: ['wings', 'bow'], body: 'fairy' },
  goblin: { figure: { shirt: '#a8322a', sleeve: '#a8322a', pants: '#3a2a1a', hair: '#2c3a1a', skin: '#6fae3f', belt: '#d4a23a', scale: 0.78, headScale: 1.15 }, overlays: ['goblin-ears', 'coin-pouch'], body: 'goblin' },
  oracle: { figure: { shirt: '#5b2a86', sleeve: '#5b2a86', pants: '#3d1a5e', hair: '#d8cfe8', skin: '#e2c4a8', robe: true, hat: 'hood', hatColor: '#3d1a5e' }, overlays: ['hood-glow'], body: 'humanoid' },
  cyclops: { figure: { shirt: '#8a5a2b', sleeve: '#b8743a', pants: '#5b3a1c', hair: '#b8743a', beard: '#b8743a', beardLong: true, skin: '#c9955e', wide: 1.3, scale: 1.12, headScale: 1.2 }, overlays: ['cyclops-eye', 'shaggy'], body: 'cyclops' },
  apprentice: { figure: { shirt: '#e8eef8', sleeve: '#e8eef8', pants: '#3a6fd0', hair: '#5a4632', skin: '#f0cfae', robe: true, hat: 'hood', hatColor: '#3a6fd0', scale: 0.9 }, overlays: ['book'], body: 'humanoid' },
  adventurer: { figure: { shirt: '#8a4b2a', sleeve: '#8a4b2a', pants: '#4a3222', hair: '#1b1512', skin: '#b67c56', cape: '#a8322a', belt: '#3a2618' }, overlays: ['satchel'], body: 'humanoid' },
  ranger: { figure: { shirt: '#3e6b3a', sleeve: '#3e6b3a', pants: '#3a2f22', hair: '#5a3a22', skin: '#e0b894', hat: 'hood', hatColor: '#2f5530', belt: '#3a2618' }, overlays: ['bow'], body: 'humanoid' },
  golem: { figure: { shirt: '#8d8a84', sleeve: '#8d8a84', pants: '#77746f', hair: '#6b6862', skin: '#a4a19a', bald: true, wide: 1.5, scale: 1.3, headScale: 0.9 }, overlays: ['rune-core'], body: 'golem' },
  giant: { figure: { shirt: '#7a6a4a', sleeve: '#c9955e', pants: '#4a3a24', hair: '#5a3a22', beard: '#5a3a22', beardLong: true, skin: '#c9955e', wide: 1.35 }, overlays: [], body: 'giant' },
  fairy: { figure: { shirt: '#9fe8ff', sleeve: '#9fe8ff', pants: '#e8fbff', hair: '#fff2a8', skin: '#fde2cc', scale: 0.5 }, overlays: ['wings'], body: 'fairy' },
  human: { figure: { shirt: '#7a6a52', sleeve: '#7a6a52', pants: '#3a2f24', hair: '#3b2a20', skin: '#e8b98f', belt: '#3a2618' }, overlays: [], body: 'humanoid' },
};
// Domain -> default archetype (THEME), for agents whose definition has no Fantasy look.
export const DOMAIN_ARCHETYPE = { owner: 'adventurer', orchestration: 'king', implementation: 'dwarf', qa: 'oracle', finance: 'goblin', analytics: 'cyclops', outreach: 'cupid', security: 'ranger', memory: 'oracle', apprentice: 'apprentice', process: 'golem', general: 'human' };
// Archetype words an explicit appearance may use that mean one of ours (a dynamic agent's own choice).
const ARCHETYPE_ALIAS = { wizard: 'apprentice', gnome: 'apprentice', elf: 'ranger', inspector: 'cyborg', seer: 'oracle', treasurer: 'goblin', scout: 'cupid', observer: 'cyclops', owner: 'adventurer' };
export const archetypeId = name => { const n = lower(name); return ARCHETYPES[n] ? n : ARCHETYPE_ALIAS[n] ?? null; };

// Rig targets (THEME, data only): which body each archetype needs from a future sprite or 3D rig. Today every body is
// the humanoid figure plus overlays; the kingdom skin also has simple drawers for the theme entities (giant, golem,
// fairy) that are not agents. An agent whose appearance names one of these rigs keeps working through the humanoid
// fallback (render/appearance.mjs rigProfileOf, `fallbackFrom`) until that rig exists.
export const RIG_TARGETS = { humanoid: 'figure', dwarf: 'figure (short, wide)', goblin: 'figure (small, big head)', fairy: 'flyer', golem: 'golem', giant: 'giant', cyclops: 'figure (large, one eye)', creature: 'creature', vehicle: 'vehicle' };

// ---- Provisioning (THEME): each lifecycle stage of a candidate as a step of summoning a hero. The place is a zone of
// the Summoning Circle district (world/kingdom-layout.mjs). READY is a hero who exists but has NOT joined: it waits at
// the edge of the circle until HQ activates it.
export const SUMMONING = {
  REQUESTED: { zone: 'summon-arrive', phase: 'candidate', caption: 'Summoned: a candidate hero appears (requested)', sequence: 'summon-begins', portal: 'kindling' },
  CONFIGURING: { zone: 'summon-runes', phase: 'preparation', caption: 'Summoning: the runes are inscribed (configuring)', sequence: 'runes', portal: 'kindling' },
  CONNECTING_PROVIDER: { zone: 'summon-portal', phase: 'portal', caption: 'Summoning: the portal binds to its realm (connecting provider)', sequence: 'portal-link', portal: 'binding' },
  CONNECTING_TOOLS: { zone: 'summon-armoury', phase: 'equipping', caption: 'Equipping: tools and arms are fitted (connecting tools)', sequence: 'equipping', portal: 'open' },
  GENERATING_APPEARANCE: { zone: 'summon-armoury', phase: 'equipping', caption: 'Taking form (appearance)', sequence: 'equipping', portal: 'open' },
  TESTING: { zone: 'summon-trial', phase: 'trial', caption: 'Trial at the proving stone (testing)', sequence: 'trial', portal: 'open' },
  WAITING: { zone: 'summon-portal', phase: 'paused', caption: 'Summoning paused: the portal waits on the realm (waiting)', sequence: 'portal-dim', portal: 'dim' },
  ERROR: { zone: 'summon-portal', phase: 'failed', caption: 'Summoning failed: the portal is unstable (error)', sequence: 'portal-unstable', portal: 'unstable', clip: 'blocked' },
  READY: { zone: 'summon-ready', phase: 'ready', caption: 'Hero ready: awaits the King\'s word to enter (ready, not active)', sequence: 'hero-awaits', portal: 'stable' },
};

// ---- Construction (THEME): the canonical stages (procgen/construction.mjs) as the kingdom builds. `phase` groups them
// into the steps of a kingdom build; the stage itself decides the picture. Only canonical progress changes a stage.
export const CONSTRUCTION_PHASES = {
  planning: { phase: 'site', label: 'Surveying the plot' },
  'site-preparation': { phase: 'materials', label: 'Clearing ground, hauling stone' },
  foundation: { phase: 'foundation', label: 'Laying the foundation stones' },
  structure: { phase: 'structure', label: 'Raising the timber frame' },
  exterior: { phase: 'structure', label: 'Walling in stone' },
  systems: { phase: 'equipment', label: 'Rune-work and fittings' },
  furnishing: { phase: 'equipment', label: 'Bringing in the furnishings' },
  inspection: { phase: 'inspection', label: 'Inspection by the Oracle' },
  operational: { phase: 'operational', label: 'Operational' },
};
// Heavy work the Giant does at a site (DERIVED from the stage; only while HQ reports builders working).
export const GIANT_WORK = { 'site-preparation': 'excavating', foundation: 'placing stones', structure: 'raising beams' };

// ---- Entity vocabulary (THEME). What moves or stands in the kingdom, and where its truth comes from. Only `hero` is a
// canonical agent. `source` is documentation and the key the derivation uses.
export const ENTITY_VOCABULARY = {
  hero: { canonical: true, source: 'world.agents (registry), ACTIVE members' },
  candidate: { canonical: true, source: 'world.agents in a provisioning state or READY' },
  subagent: { canonical: false, source: 'planned: temporary helpers HQ may report; none today' },
  worker: { canonical: false, derived: true, source: 'a construction site where HQ reports builders working' },
  giant: { canonical: false, derived: true, source: 'a construction site at site-preparation, foundation or structure with builders working' },
  messenger: { canonical: false, derived: true, source: 'a canonical agent-to-agent message (drawn as a fairy on the message effect)' },
  ranger: { canonical: false, cosmetic: true, source: 'kingdom infrastructure: patrols the gate; reacts to canonical open issues' },
  golem: { canonical: false, cosmetic: true, source: 'kingdom infrastructure: stands at the gate; reacts to canonical open issues' },
  creature: { canonical: false, cosmetic: true, source: 'ambient life (the hearth cat)' },
  cart: { canonical: false, derived: true, source: 'a construction site between foundation and furnishing' },
  equipment: { canonical: false, source: 'district furniture (anvils, lecterns, the proving stone)' },
  building: { canonical: false, derived: true, source: 'a district; established only by a usable canonical capability' },
  room: { canonical: true, source: 'layout location (selectable)' },
  site: { canonical: true, source: 'world.projects (construction)' },
  portal: { canonical: false, derived: true, source: 'a candidate agent\'s lifecycle state' },
  infrastructure: { canonical: false, source: 'road, walls, gate towers' },
  ambient: { canonical: false, cosmetic: true, source: 'villagers (engine/npcs.mjs), never agents' },
};

// ---- Security vocabulary (THEME). Roles, not incidents: nothing here creates an alert. HQ has no SECURITY_* events
// today; an open canonical issue (ISSUE_FOUND) is the one signal represented (the gate's beacon is lit and the ranger
// stands watch). A later pass maps real security events onto these roles.
export const SECURITY_VOCABULARY = {
  detect: { entity: 'ranger', action: 'detects and patrols' },
  alert: { entity: 'messenger', action: 'carries the alert' },
  enforce: { entity: 'golem', action: 'enforces at the gate' },
  investigate: { domain: 'qa', archetype: 'cyborg', action: 'investigates' },
  repair: { domain: 'implementation', archetype: 'dwarf', action: 'repairs' },
};

// ---- Activity -> station uses (THEME). An agent works in its home district when that district has stations for the
// activity; otherwise at the district the activity itself stands for.
export const ACTIVITY_USES = { coding: ['work'], thinking: ['work', 'read'], reviewing: ['inspect'], testing: ['inspect'], researching: ['read'], communicating: ['meeting'], waiting: ['wait'], idle: ['relax'], offline: ['relax'] };
export const ACTIVITY_DISTRICT = { coding: 'forge', thinking: 'forge', reviewing: 'oracle', testing: 'oracle', researching: 'library', communicating: 'throne', waiting: 'plaza', idle: 'hearth', offline: 'hearth' };

// ---- Event cues (THEME): the interpreter's Fantasy beats (themes/interpreter.mjs reads these).
export const EVENT_CUES = {
  AGENT_REQUESTED: { sequence: 'summon-begins', text: n => `A hero is summoned: ${n}` },
  AGENT_PROVISIONING: { sequence: 'runes', text: (n, e) => `${n}: ${(SUMMONING[e.stage]?.caption ?? String(e.stage)).replace(/^[^:]*: /, '')}` },
  AGENT_PROVISIONING_WAITING: { sequence: 'portal-dim', text: n => `${n}: the portal waits` },
  AGENT_PROVISIONING_FAILED: { sequence: 'portal-unstable', text: n => `${n}: the summoning failed` },
  AGENT_READY: { sequence: 'hero-awaits', text: n => `${n} stands ready at the circle, awaiting the King's word` },
  AGENT_ACTIVATED: { sequence: 'sworn-in', text: n => `${n} swore the oath and entered the kingdom` },
  AGENT_DISABLED: { sequence: 'departs-kingdom', text: n => `${n} left the kingdom (disabled)` },
  AGENT_RETIRED: { sequence: 'hangs-up-arms', text: n => `${n} hung up their arms (retired)` },
  TASK_STARTED: { sequence: 'quest-taken', text: n => `${n} took a quest from the board` },
  TASK_COMPLETED: { sequence: 'quest-complete', text: n => `${n} completed a quest` },
  TASK_BLOCKED: { sequence: 'quest-stalled', text: n => `${n}'s quest is stalled` },
  TASK_FAILED: { sequence: 'quest-failed', text: n => `${n}'s quest failed` },
  TASK_QUEUED: { sequence: 'quest-returned', text: () => 'A quest went back to the board' },
  MEETING_STARTED: { sequence: 'council-convenes' }, MEETING_ENDED: { sequence: 'council-rises' },
  TESTS_STARTED: { sequence: 'oracle-scrying' }, TESTS_FINISHED: { sequence: 'oracle-verdict' },
  DEPLOY_STARTED: { sequence: 'caravan-departs' }, DEPLOY_SUCCESS: { sequence: 'caravan-arrives' }, DEPLOY_FAILED: { sequence: 'caravan-lost' },
  ISSUE_FOUND: { sequence: 'beacon-lit' },
  BUILD_STARTED: { sequence: 'giant-arrives' }, BUILD_STAGE_CHANGED: { sequence: 'site-rises' }, BUILD_BLOCKED: { sequence: 'site-halted' }, BUILD_RESUMED: { sequence: 'site-resumed' }, BUILD_COMPLETED: { sequence: 'ribbon-cut' },
};
