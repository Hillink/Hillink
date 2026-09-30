// Pass 5E: the agent registry. What an agent IS (its definition) and where it is in its life (its lifecycle), kept apart
// from what it is doing (core/truth.mjs, core/state.mjs activity) and from how any theme draws it (render/appearance.mjs,
// themes/interpreter.mjs). No agent id is special here: the agents Hillink has today are DEFAULT definitions written in
// the same schema a new agent uses, and an agent the World has never heard of works the same way.
//
// Canonical inputs only. A definition or a lifecycle state changes only through a validated World event (from HQ, or
// from the development simulator, never mixed: see ORIGINS). Nothing a renderer or theme does can reach these.

const text = (v, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const list = (v, max = 40, each = 80) => (Array.isArray(v) ? [...new Set(v.map(x => text(x, each)).filter(Boolean))].slice(0, max) : undefined);
const plain = v => v != null && typeof v === 'object' && !Array.isArray(v);
const JSON_LIMIT = 8000;
// Free-form data (appearance, metadata) is kept as plain JSON of bounded size; anything else is dropped, never trusted.
const data = v => { if (!plain(v)) return undefined; try { const s = JSON.stringify(v); return s.length <= JSON_LIMIT ? JSON.parse(s) : undefined; } catch { return undefined; } };

// The definition schema. Every field is optional except id: HQ does not know most of these today, and a later backend
// can fill them without a schema change. Unknown top-level fields are kept under `extra` (bounded), so a newer HQ never
// crashes an older World and nothing it sends is silently lost.
export const DEFINITION_FIELDS = {
  id: 'stable agent id (the key everything else refers to)',
  name: 'display name',
  kind: '"agent" (an AI agent), "process" (a non-AI worker) or "person"',
  provider: 'backend or vendor (for example anthropic, openai, local)',
  model: 'model name, when applicable',
  role: 'short role line, as HQ states it ("Engineering: builder")',
  roleTitle: 'the role in one or two words ("Implementation")',
  roleDescription: 'what the role is for',
  responsibilities: 'list of responsibilities',
  capabilities: 'list of capabilities (what it can do)',
  tools: 'list of tools it may use',
  permissions: 'list of permissions (descriptive here; HQ enforces them)',
  team: 'team or department',
  reportsTo: 'id of the agent or person it reports to',
  coordinatesWith: 'ids it coordinates with',
  workstation: '{ kind?, location?, uses?[] }: what kind of place it works at',
  home: 'optional home area (a semantic location id)',
  appearance: 'appearance definition: render/appearance.mjs (base plus per-theme overrides)',
  meta: 'free metadata for future use',
};
const LISTS = ['responsibilities', 'capabilities', 'tools', 'permissions', 'coordinatesWith'];
const TEXTS = { name: 80, kind: 20, provider: 60, model: 80, role: 120, roleTitle: 60, roleDescription: 400, team: 60, reportsTo: 80, home: 60 };

// A definition as the World keeps it: validated, bounded, unknown fields set aside. Pure.
export function normalizeDefinition(raw) {
  if (!plain(raw)) return null;
  const id = text(raw.id ?? raw.agentId, 80); if (!id) return null;
  const out = { id };
  for (const [k, max] of Object.entries(TEXTS)) { const v = text(raw[k], max); if (v !== undefined) out[k] = v; }
  for (const k of LISTS) { const v = list(raw[k]); if (v !== undefined) out[k] = v; }
  if (plain(raw.workstation)) { const w = { kind: text(raw.workstation.kind, 40), location: text(raw.workstation.location, 60), uses: list(raw.workstation.uses, 12, 30) }; out.workstation = Object.fromEntries(Object.entries(w).filter(([, v]) => v !== undefined)); }
  for (const k of ['appearance', 'meta']) { const v = data(raw[k]); if (v !== undefined) out[k] = v; }
  const extra = Object.fromEntries(Object.entries(raw).filter(([k]) => !Object.hasOwn(DEFINITION_FIELDS, k) && k !== 'agentId' && k !== 'extra'));
  const ex = data({ ...(plain(raw.extra) ? raw.extra : {}), ...extra }); if (ex && Object.keys(ex).length) out.extra = ex;
  return out;
}

// Later fields win; appearance merges per theme, so an update to one theme's look keeps the others.
export function mergeDefinitions(...defs) {
  const out = {};
  for (const d of defs.filter(Boolean)) {
    for (const [k, v] of Object.entries(d)) {
      if (k === 'appearance' && plain(out.appearance)) out.appearance = { ...out.appearance, ...v, themes: { ...(out.appearance.themes ?? {}), ...Object.fromEntries(Object.entries(v.themes ?? {}).map(([t, o]) => [t, { ...(out.appearance.themes?.[t] ?? {}), ...o }])) } };
      else if ((k === 'meta' || k === 'extra' || k === 'workstation') && plain(out[k])) out[k] = { ...out[k], ...v };
      else out[k] = v;
    }
  }
  return out;
}

// ---- Default definitions: the agents Hillink has today, migrated from the old per-id tables (core/roles.mjs,
// render/looks.mjs, the simulator's roster) into the shared schema. `figure` holds the exact parameters the current
// figure renderers already used for each theme, so these agents look the same as before this pass.
export const DEFAULT_DEFINITIONS = Object.fromEntries([
  { id: 'claude', name: 'Claude', kind: 'agent', provider: 'anthropic', role: 'Engineering: builder', roleTitle: 'Implementation', roleDescription: 'Builds features and fixes. Through HQ today it runs read-only repository reviews only.', team: 'Engineering', responsibilities: ['implementation', 'construction'], workstation: { kind: 'desk', uses: ['work'] }, meta: { attribution: { tokens: ['claude'] } },
    appearance: { archetype: 'human', rig: 'humanoid', palette: { primary: '#e2711d' }, themes: {
      real: { archetype: 'human', figure: { shirt: '#d9773f', sleeve: '#d9773f', pants: '#3a3f4a', hair: '#5a3a22', skin: '#f1c7a0', belt: '#4a3a2a', hoodie: true, glasses: true, screen: '#ffb27a', package: 'box' } },
      fantasy: { archetype: 'dwarf', equipment: ['hammer'], figure: { shirt: '#b5552b', sleeve: '#b5552b', pants: '#5a3b24', hair: '#c4521f', beard: '#c4521f', beardLong: true, skin: '#eab28a', hat: 'helmet', hatColor: '#9aa6b4', horns: true, belt: '#3c2a1a', scale: 0.86, wide: 1.2, headScale: 1.08, package: 'scroll' } } } } },
  { id: 'codex', name: 'Codex', kind: 'agent', provider: 'openai', role: 'Engineering: QA and security', roleTitle: 'Investigation and review', roleDescription: 'Audits, traces behavior, verifies and reviews work, and specifies what to build next. Not an implementation agent.', team: 'Engineering', responsibilities: ['review', 'testing', 'inspection'], workstation: { kind: 'desk', uses: ['work', 'inspect'] }, meta: { attribution: { tokens: ['codex'] } },
    appearance: { archetype: 'human', rig: 'humanoid', palette: { primary: '#3a86ff' }, themes: {
      real: { archetype: 'human', figure: { shirt: '#2d4f8e', pants: '#1f2530', hair: '#1a1a1d', skin: '#d8a883', headset: true, badge: '#e8f1ff', vest: null, jacket: '#243f73', screen: '#5ee1ff', package: 'box' } },
      // Pass 5G: the Cyborg Inspector: blue armour, half human and half machine, one red bionic eye (drawn by the kingdom skin).
      fantasy: { archetype: 'cyborg', effects: ['armor', 'bionic-eye'], figure: { shirt: '#2a5aa8', sleeve: '#4a7cc8', pants: '#1d3561', skin: '#e0b894', skinTone2: 'rgba(120,140,170,0.55)', hair: '#2b2f38', metalArm: true, core: true, glove: '#9fb3cc', belt: '#0f2344', package: 'scroll' } } } } },
  { id: 'chatgpt', name: 'ChatGPT', kind: 'agent', provider: 'openai', roleTitle: 'Orchestration', roleDescription: 'Coordinates the agents through HQ: reads state, delegates reviews, asks Kyle to decide. Does not code. Workspace: Lobby reception.', team: 'Operations', responsibilities: ['orchestration'], workstation: { kind: 'reception', location: 'queue' },
    appearance: { archetype: 'human', rig: 'humanoid', palette: { primary: '#10a37f' }, themes: {
      real: { archetype: 'human', figure: { shirt: '#f2f4f7', jacket: '#2a2f3a', sleeve: '#2a2f3a', pants: '#2a2f3a', hair: '#2b2118', skin: '#eab893', tie: '#10a37f', package: 'box' } },
      // Pass 5G: the King (orchestrator): green and gold, crowned.
      fantasy: { archetype: 'king', effects: ['regal-glow'], figure: { shirt: '#1f6b3a', sleeve: '#1f6b3a', pants: '#173d24', hair: '#e9e4d8', beard: '#e9e4d8', skin: '#efc6a2', hat: 'crown', hatColor: '#d9b44a', cape: '#c8a24a', belt: '#d9b44a', package: 'scroll' } } } } },
  { id: 'qwen', name: 'Qwen', kind: 'agent', provider: 'local', roleTitle: 'Local analysis', roleDescription: 'Delegated local research and verification on this machine.', team: 'Engineering',
    appearance: { archetype: 'human', rig: 'humanoid', themes: {
      real: { figure: { shirt: '#6f4fc9', pants: '#2b2440', hair: '#d8d4e6', skin: '#f3d0b0', glasses: true, screen: '#c3a6ff', package: 'box' } },
      // Pass 5G: a local AI apprentice in white and blue.
      fantasy: { archetype: 'apprentice', effects: ['book'], figure: { shirt: '#e8eef8', sleeve: '#e8eef8', pants: '#3a6fd0', robe: true, hair: '#d8d4e6', skin: '#f0cfae', hat: 'hood', hatColor: '#3a6fd0', scale: 0.9, package: 'scroll' } } } } },
  { id: 'gemma', name: 'Gemma', kind: 'agent', provider: 'local', roleTitle: 'Local utility', roleDescription: 'Small delegated local jobs: summaries, classification, extraction.', team: 'Engineering',
    appearance: { archetype: 'human', rig: 'humanoid', themes: {
      real: { figure: { shirt: '#e7e3d6', overalls: '#2f8f6b', pants: '#2f8f6b', hair: '#6b3f22', skin: '#c98f68', hat: 'cap', hatColor: '#2f8f6b', screen: '#7cf0c4', package: 'box' } },
      // Pass 5G: a local AI apprentice in green.
      fantasy: { archetype: 'apprentice', effects: ['book'], figure: { shirt: '#4fae5f', sleeve: '#4fae5f', pants: '#2f6e3d', robe: true, hair: '#7a4a2a', skin: '#e8b890', hat: 'hood', hatColor: '#2f6e3d', scale: 0.86, package: 'scroll' } } } } },
  { id: 'hq-verifier', name: 'Local Verifier', kind: 'process', roleTitle: 'Verification process', roleDescription: 'Runs allowlisted local checks. A process, not an AI model.', team: 'Engineering',
    appearance: { archetype: 'human', rig: 'humanoid', themes: {
      real: { figure: { shirt: '#56606e', pants: '#2a313a', hair: '#333', skin: '#e2b48d', vest: '#f2b01e', hat: 'hardhat', hatColor: '#f2f2f2', scale: 0.92, package: 'box' } },
      fantasy: { figure: { shirt: '#7d8794', pants: '#4a4f58', hair: '#444', skin: '#e2b48d', hat: 'helmet', vest: '#2f5aa8', scale: 0.92, package: 'scroll' } } } } },
  { id: 'kyle', name: 'Kyle', kind: 'person', roleTitle: 'Owner', roleDescription: 'Decides, approves and sets direction.',
    appearance: { archetype: 'human', rig: 'humanoid', themes: {
      real: { figure: { shirt: '#ffffff', jacket: '#1f2f5a', sleeve: '#1f2f5a', pants: '#1f2f5a', hair: '#1b1512', skin: '#b67c56', tie: '#7c4dff', package: 'box' } },
      // Pass 5G: the owner as a casual adventurer in brown and red.
      fantasy: { archetype: 'adventurer', effects: ['satchel'], figure: { shirt: '#8a4b2a', sleeve: '#8a4b2a', pants: '#4a3222', hair: '#1b1512', skin: '#b67c56', cape: '#a8322a', belt: '#3a2618', package: 'scroll' } } } } },
].map(d => [d.id, normalizeDefinition(d)]));

// The registry view of one agent: its default definition (if Hillink ships one) under what the canonical events said.
// World agents carry their event-supplied definition in `a.definition`; name, role and appearance from registration
// are part of it. Pure; works for any id.
export function definitionOf(a) {
  if (!a) return null;
  const fromEvents = mergeDefinitions(a.definition, { id: a.id, ...(a.name && a.name !== a.id ? { name: a.name } : {}), ...(a.role && a.role !== 'Unregistered agent' ? { role: a.role } : {}), ...(a.kind ? { kind: a.kind } : {}), ...(plain(a.appearance) ? { appearance: normalizeDefinition({ id: a.id, appearance: a.appearance }).appearance } : {}) });
  return mergeDefinitions(DEFAULT_DEFINITIONS[a.id], fromEvents);
}
// Every agent the World knows, as definitions (defaults that are present plus dynamic ones).
export const registryOf = world => Object.fromEntries(Object.values(world?.agents ?? {}).map(a => [a.id, definitionOf(a)]));

// ---- Attribution (5E correction B6): which agent a commit or review belongs to, from the registry, for ANY agent.
// Declarative only: meta.attribution = { tokens: ['name', ...] }, literal words matched case-insensitively against the
// words of an author or Co-Authored-By trailer. Nothing supplied by a definition is ever compiled or executed (no regex),
// and anything malformed simply attributes nothing.
const TOKEN = /^[a-z0-9][a-z0-9_.-]{1,39}$/;
export function attributionTokens(def) {
  const t = def?.meta?.attribution?.tokens;
  return Array.isArray(t) ? [...new Set(t.filter(x => typeof x === 'string').map(x => x.trim().toLowerCase()).filter(x => TOKEN.test(x)))].slice(0, 8) : [];
}
// registry: { id: definition } or [definition]. Returns the matching agent id, or null. Ties go to the lowest id.
export function attribute(registry, ...texts) {
  const words = new Set(texts.filter(x => typeof x === 'string').join(' ').toLowerCase().split(/[^a-z0-9_.-]+/).flatMap(w => [w, ...w.split(/[._-]+/)]).filter(Boolean));
  const defs = (Array.isArray(registry) ? registry : Object.values(registry ?? {})).filter(d => d && typeof d.id === 'string').sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const d of defs) if (attributionTokens(d).some(t => words.has(t))) return d.id;
  return null;
}

// ---- Lifecycle. Independent of theme. HQ today supports only part of it: an agent HQ registers is simply there
// (ACTIVE). The provisioning states exist so that a backend which does provision can report them, and so that the
// development harness can exercise them; nothing in the World advances them on its own.
export const LIFECYCLE = ['DRAFT', 'REQUESTED', 'CONFIGURING', 'CONNECTING_PROVIDER', 'CONNECTING_TOOLS', 'GENERATING_APPEARANCE', 'TESTING', 'WAITING', 'ERROR', 'READY', 'ACTIVE', 'DISABLED', 'RETIRED'];
export const PROVISIONING_STAGES = ['CONFIGURING', 'CONNECTING_PROVIDER', 'CONNECTING_TOOLS', 'GENERATING_APPEARANCE', 'TESTING'];
// WAITING here is a lifecycle state (provisioning paused on outside input, such as a missing credential), not the
// runtime activity "waiting" of an active agent.
const P = PROVISIONING_STAGES;
export const TRANSITIONS = {
  DRAFT: ['REQUESTED', 'RETIRED'],
  REQUESTED: [...P, 'WAITING', 'ERROR', 'DISABLED', 'RETIRED'],
  ...Object.fromEntries(P.map(s => [s, [...P.filter(x => x !== s), 'WAITING', 'ERROR', 'READY', 'DISABLED', 'RETIRED']])),
  WAITING: [...P, 'ERROR', 'DISABLED', 'RETIRED'],
  ERROR: ['REQUESTED', ...P, 'DISABLED', 'RETIRED'],
  READY: ['ACTIVE', 'ERROR', 'DISABLED', 'RETIRED'],
  ACTIVE: ['DISABLED', 'RETIRED'],
  DISABLED: ['ACTIVE', 'REQUESTED', 'RETIRED'],
  RETIRED: [],
};
// Which semantic event moves an agent to which state. The event names say what happened, never how it looks.
export const LIFECYCLE_EVENTS = {
  AGENT_REQUESTED: 'REQUESTED', AGENT_PROVISIONING: null /* the stage field */, AGENT_PROVISIONING_WAITING: 'WAITING',
  AGENT_PROVISIONING_FAILED: 'ERROR', AGENT_READY: 'READY', AGENT_ACTIVATED: 'ACTIVE', AGENT_DISABLED: 'DISABLED', AGENT_RETIRED: 'RETIRED',
};
export const isLifecycleEvent = type => Object.hasOwn(LIFECYCLE_EVENTS, type);
export const targetState = e => (e.type === 'AGENT_PROVISIONING' ? e.stage : LIFECYCLE_EVENTS[e.type]);

// Where an agent stands in the World, from its lifecycle alone: a member of the team (present and usable), a candidate
// (being provisioned, or READY but not yet activated: not allowed to work), or absent (disabled, retired, a draft, or a
// placeholder the World only saw mentioned).
// 5E correction (B1, B3): only ACTIVE is a working member, plus an agent registered the pre-5E way (AGENT_REGISTERED by
// HQ or the simulator, no lifecycle). A placeholder (an id an event merely mentioned) is never a member.
export function presenceOf(a) {
  if (!a) return 'absent';
  const s = a.lifecycle?.state;
  if (!s) return a.placeholder ? 'absent' : 'member'; // no lifecycle: registered the pre-5E way
  if (s === 'ACTIVE') return 'member';
  if (s === 'DISABLED' || s === 'RETIRED' || s === 'DRAFT') return 'absent';
  return 'candidate';
}
export const canWork = a => presenceOf(a) === 'member';
// Whether an agent has legitimately reached READY (or was a working member) at some point: the one condition under
// which DISABLED may return straight to ACTIVE. A pre-5E registered agent was a working member.
export const readied = a => Boolean(a && (a.lifecycle ? a.lifecycle.readied : !a.placeholder));

// Event sources that may define or move an agent, by the source that first defined it. The development simulator can
// never touch an HQ agent, and HQ facts never land on a simulated one. 5E correction (B4): "replay" is not a family and
// has no wildcard; a replay restates events with their original sources, so a "replay" event can touch no agent.
const FAMILY = { hq: 'live', github: 'live', platform: 'live', sim: 'sim' };
export const familyOf = source => FAMILY[source] ?? null;
export const sameFamily = (origin, source) => familyOf(source) != null && (!origin || familyOf(origin) === familyOf(source));

// Fail-closed check of a lifecycle or definition event against the current agent. Returns null (allowed) or a reason.
// Called before the reducer touches anything, so a refused event leaves the World exactly as it was.
export function checkAgentEvent(a, e) {
  if (a?.origin && !sameFamily(a.origin, e.source)) return `${e.type}: ${e.source} events cannot change agent ${e.agentId} (defined by ${a.origin})`;
  if (e.type === 'AGENT_DEFINED') {
    if (a?.definedAt != null && e.at < a.definedAt) return `AGENT_DEFINED: stale definition for ${e.agentId} (older than the one applied)`;
    return normalizeDefinition({ ...e.definition, id: e.agentId }) ? null : 'AGENT_DEFINED: invalid definition';
  }
  if (!isLifecycleEvent(e.type)) return null;
  const to = targetState(e);
  if (!LIFECYCLE.includes(to) || (e.type === 'AGENT_PROVISIONING' && !PROVISIONING_STAGES.includes(to))) return `${e.type}: unknown stage ${e.stage}`;
  // No lifecycle: a registered pre-5E agent is ACTIVE; a placeholder (only ever mentioned) has not started one.
  const from = a?.lifecycle?.state ?? (a && !a.placeholder ? 'ACTIVE' : 'DRAFT');
  if (e.type === 'AGENT_REQUESTED' && (!a || (a.placeholder && !a.lifecycle))) return null; // a new agent enters as a request
  if (a?.lifecycle && e.at < a.lifecycle.since) return `${e.type}: out of order for ${e.agentId} (older than its ${from} state)`;
  if (!TRANSITIONS[from]?.includes(to)) return `${e.type}: ${e.agentId} cannot go from ${from} to ${to}`;
  // 5E correction (B3): re-enabling is only for an agent that was ready before. One disabled during provisioning (or
  // after a failure) has never been READY and must go back through the provisioning lifecycle.
  if (from === 'DISABLED' && to === 'ACTIVE' && !readied(a)) return `${e.type}: ${e.agentId} was never READY; it must be provisioned again`;
  return null;
}
