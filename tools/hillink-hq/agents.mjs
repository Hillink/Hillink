// Pass 5F: agents created in HQ. HQ is the one authority that defines a new agent and provisions it; the World only
// shows what HQ journals. Everything an HQ-created agent can be or do is data in the tables below, keyed by backend,
// capability, tool and permission, never by an agent's id or name:
//
//   agent -> capabilities (CAPABILITIES: each one HQ operation and the tools it needs)
//         -> tools (TOOLS: each provided by some backends, each needing at most one permission)
//         -> permissions (PERMISSIONS: a closed, read-only set; anything else is an escalation and is refused)
//         -> backend (BACKENDS: what HQ can genuinely configure today, and how to check it for real)
//
// Creation validates and bounds the definition (nothing is journaled for a refused one). Provisioning then runs real
// checks, one lifecycle stage at a time, and only a passed check advances: CONFIGURING re-validates the definition
// against this catalog, CONNECTING_PROVIDER contacts the backend (sign-in, installed model, launcher), CONNECTING_TOOLS
// binds every capability to a tool, a permission and a $0 compute route, and TESTING runs a real trial where one is
// free (a local process or a local model) or a fresh sign-in check where a trial would spend subscription capacity.
// Missing sign-in, bridges or models are WAITING (HQ re-checks); a definition the backend cannot serve is ERROR.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { operations } from './registry.mjs';
import { routeFor, registerRoute, routesFor } from './compute/registry.mjs';
import { OllamaAdapter, discoverModels, isCloudModel } from './ollama-adapter.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

// ---- Lifecycle. The same states and transitions as the World's registry (tools/hillink-world/core/agents.mjs; a
// World test holds the two tables equal), so the World never has to refuse an HQ transition. HQ does not generate
// appearance (it validates a declarative one), so GENERATING_APPEARANCE is never entered here.
export const LIFECYCLE = ['DRAFT', 'REQUESTED', 'CONFIGURING', 'CONNECTING_PROVIDER', 'CONNECTING_TOOLS', 'GENERATING_APPEARANCE', 'TESTING', 'WAITING', 'ERROR', 'READY', 'ACTIVE', 'DISABLED', 'RETIRED'];
const P = ['CONFIGURING', 'CONNECTING_PROVIDER', 'CONNECTING_TOOLS', 'GENERATING_APPEARANCE', 'TESTING'];
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
// The stages HQ actually runs, in order. Each has a real check below.
export const STAGES = ['CONFIGURING', 'CONNECTING_PROVIDER', 'CONNECTING_TOOLS', 'TESTING'];
export const PROVISIONING = new Set(['REQUESTED', ...STAGES, 'WAITING']);
// An agent with no lifecycle is one of HQ's built-in agents (registry.mjs), which works as before.
export const isWorking = agent => Boolean(agent) && (!agent.lifecycle || agent.lifecycle.state === 'ACTIVE');
export function canTransition(agent, to) {
  const from = agent.lifecycle?.state;
  if (!from || !TRANSITIONS[from]?.includes(to)) return false;
  // Re-enabling is only for an agent that legitimately reached READY before; anything else is provisioned again.
  if (from === 'DISABLED' && to === 'ACTIVE' && !agent.lifecycle.readied) return false;
  return true;
}

// ---- Catalog.
export const PERMISSIONS = {
  'read-repo': 'Read files in this repository (no writes).',
  'run-local-checks': 'Run HQ\'s allowlisted local test processes (no shell, no network, no credentials).',
};
export const TOOLS = {
  'file-inventory': { label: 'List the source files in app/ and lib/', permission: 'read-repo', probe: () => ['app', 'lib'].some(d => fs.existsSync(path.join(repoRoot, d))) || 'app/ and lib/ are missing from this checkout' },
  'node-test-runner': { label: 'Node\'s test runner on HQ\'s allowlisted test files', permission: 'run-local-checks', probe: () => fs.existsSync(fileURLToPath(new URL('./worker.mjs', import.meta.url))) || 'HQ worker.mjs is missing' },
  'repo-read': { label: 'Read, Grep and Glob over this repository (read-only CLI tools)', permission: 'read-repo', probe: () => { try { fs.accessSync(repoRoot, fs.constants.R_OK); return true; } catch { return 'repository root is not readable'; } } },
  'text-generation': { label: 'Generate text from the task description only (no tools, no files)', permission: null, probe: () => true },
};
// What an HQ-created agent can hold. Each capability is exactly one allowlisted HQ operation (registry.mjs).
// Not creatable: implement-repo (implementation is Claude's alone, Pass 3), coordinate (the optional metered
// orchestrator) and owner-decision (Kyle's).
export const CAPABILITIES = {
  'inspect-repo': { operation: 'inspect-repo', tools: ['file-inventory'] },
  'verify-unit': { operation: 'verify-unit', tools: ['node-test-runner'] },
  'verify-hq': { operation: 'verify-hq', tools: ['node-test-runner'] },
  'summarize': { operation: 'summarize-local', tools: ['text-generation'] },
  'review-repo': { operation: 'review-repo', tools: ['repo-read'] },
};
const RESERVED_CAPABILITIES = { 'implement-repo': 'implementation is Claude\'s alone (Pass 3 role boundary)', implement: 'implementation is Claude\'s alone (Pass 3 role boundary)', coordinate: 'orchestration runs only through the optional metered orchestrator, which HQ-created agents cannot use', 'owner-decision': 'owner decisions are Kyle\'s' };
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
// Backends HQ can genuinely configure today. No metered backend: an HQ-created agent never spends money.
export const BACKENDS = {
  'local-checks': { provider: 'local', label: 'Local Node.js processes (HQ allowlisted checks)', model: 'none', tools: ['file-inventory', 'node-test-runner'], adapterId: () => 'local-checks', telemetry: 'local-process', usage: 'node-process', ackTimeoutMs: null },
  'ollama': { provider: 'ollama', label: 'Ollama on this machine (installed local models only)', model: 'required', tools: ['text-generation'], adapterId: def => `ollama-model-${slug(def.model).slice(0, 60)}`, telemetry: 'ollama-stream', usage: 'ollama-response', ackTimeoutMs: 180_000 },
  'claude-cli': { provider: 'anthropic', label: 'Claude Code CLI with Kyle\'s subscription sign-in (read-only tools)', model: 'none', tools: ['repo-read'], adapterId: () => 'cli-claude', bridge: 'HQ_AGENTS_ENABLED=1', telemetry: 'cli-json-stream', usage: 'cli-claude-stream', ackTimeoutMs: 90_000 },
  'codex-cli': { provider: 'openai', label: 'Codex CLI with Kyle\'s ChatGPT sign-in (read-only sandbox)', model: 'none', tools: ['repo-read'], adapterId: () => 'cli-codex', bridge: 'HQ_AGENTS_ENABLED=1', telemetry: 'cli-json-stream', usage: 'cli-codex-stream', ackTimeoutMs: 90_000 },
};
export const catalog = () => ({
  backends: Object.fromEntries(Object.entries(BACKENDS).map(([id, b]) => [id, { provider: b.provider, label: b.label, model: b.model, tools: b.tools, capabilities: Object.keys(CAPABILITIES).filter(c => CAPABILITIES[c].tools.every(t => b.tools.includes(t))) }])),
  capabilities: Object.fromEntries(Object.entries(CAPABILITIES).map(([id, c]) => [id, { operation: c.operation, label: operations[c.operation]?.label ?? c.operation, tools: c.tools }])),
  tools: Object.fromEntries(Object.entries(TOOLS).map(([id, t]) => [id, { label: t.label, permission: t.permission }])),
  permissions: PERMISSIONS,
  appearance: { items: ITEMS, archetypes: ARCHETYPES, rigs: RIGS },
});

// ---- Definition validation (creation). Every field is bounded; unknown fields, unknown catalog entries and anything
// executable-looking are refused outright, so nothing hostile is ever journaled or reaches the World.
const plain = v => v != null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const FIELDS = ['id', 'name', 'backend', 'provider', 'model', 'role', 'description', 'instructions', 'responsibilities', 'capabilities', 'tools', 'permissions', 'team', 'reportsTo', 'coordinatesWith', 'workstation', 'appearance', 'attribution', 'meta'];
const RESERVED_IDS = new Set(['kyle', 'hq', 'system', 'owner', 'world', 'sim', 'replay', 'admin', 'root']);
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._'-]{0,59}$/u;
const ID = /^[a-z][a-z0-9-]{2,39}$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/;
const TOKEN = /^[a-z0-9][a-z0-9_.-]{1,39}$/;
const KEY = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
export const ITEMS = ['glasses', 'headset', 'hoodie', 'goggles', 'antenna', 'visor', 'robe', 'bald', 'horns', 'hardhat', 'cap', 'helmet', 'crown', 'hood', 'wizard', 'vest', 'tie', 'cape', 'beard'];
export const ARCHETYPES = ['human', 'dwarf', 'elf', 'gnome', 'cyborg', 'golem', 'robot'];
export const RIGS = ['humanoid'];
const WORKSTATIONS = ['desk', 'bench', 'reading', 'reception'];
const PALETTE = ['primary', 'secondary', 'skin', 'hair', 'shirt', 'pants', 'accent'];

const fail = message => { throw Error(message); };
function str(v, field, max, { required = false, pattern = null } = {}) {
  if (v == null || v === '') { if (required) fail(`${field} is required`); return undefined; }
  if (typeof v !== 'string') fail(`${field} must be text`);
  const s = v.trim();
  if (!s) { if (required) fail(`${field} is required`); return undefined; }
  if (s.length > max) fail(`${field} is longer than ${max} characters`);
  // Control characters never belong in a definition (they could forge log lines or break a renderer).
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s)) fail(`${field} contains control characters`);
  if (pattern && !pattern.test(s)) fail(`${field} has characters that are not allowed`);
  return s;
}
function strList(v, field, { max = 12, each = 80, allowed = null, pattern = null } = {}) {
  if (v == null) return undefined;
  if (!Array.isArray(v)) fail(`${field} must be a list`);
  if (v.length > max) fail(`${field} has more than ${max} entries`);
  const out = [...new Set(v.map(x => str(x, field, each, { required: true, pattern })))];
  if (allowed) for (const x of out) if (!allowed.includes(x)) fail(`${field}: "${x.slice(0, 40)}" is not supported`);
  return out;
}
function onlyKeys(o, field, keys) { for (const k of Object.keys(o)) if (!keys.includes(k)) fail(`${field}: unknown field "${String(k).slice(0, 40)}"`); }
function look(v, field, { themes = false } = {}) {
  if (!plain(v)) fail(`${field} must be an object`);
  onlyKeys(v, field, ['archetype', 'rig', 'palette', 'body', 'clothing', 'accessories', ...(themes ? ['themes'] : [])]);
  const out = {};
  if (v.archetype != null) { if (!ARCHETYPES.includes(v.archetype)) fail(`${field}.archetype is not supported`); out.archetype = v.archetype; }
  if (v.rig != null) { if (!RIGS.includes(v.rig)) fail(`${field}.rig is not supported`); out.rig = v.rig; }
  if (v.palette != null) {
    if (!plain(v.palette)) fail(`${field}.palette must be an object`);
    onlyKeys(v.palette, `${field}.palette`, PALETTE);
    out.palette = {};
    // Colours are six-digit hex only: never a CSS function, URL or expression.
    for (const [k, c] of Object.entries(v.palette)) { if (typeof c !== 'string' || !HEX.test(c)) fail(`${field}.palette.${k} must be a #rrggbb colour`); out.palette[k] = c.toLowerCase(); }
  }
  if (v.body != null) {
    if (!plain(v.body)) fail(`${field}.body must be an object`);
    onlyKeys(v.body, `${field}.body`, ['scale', 'width', 'headScale']);
    out.body = {};
    for (const [k, lo, hi] of [['scale', 0.6, 1.4], ['width', 0.7, 1.5], ['headScale', 0.8, 1.3]]) if (v.body[k] != null) { const n = v.body[k]; if (typeof n !== 'number' || !(n >= lo && n <= hi)) fail(`${field}.body.${k} must be a number from ${lo} to ${hi}`); out.body[k] = n; }
  }
  for (const k of ['clothing', 'accessories']) { const l = strList(v[k], `${field}.${k}`, { max: 8, each: 20, allowed: ITEMS }); if (l) out[k] = l; }
  if (themes && v.themes != null) {
    if (!plain(v.themes)) fail(`${field}.themes must be an object`);
    onlyKeys(v.themes, `${field}.themes`, ['real', 'fantasy']);
    out.themes = Object.fromEntries(Object.entries(v.themes).map(([t, o]) => [t, look(o, `${field}.themes.${t}`)]));
  }
  return out;
}
function metaOf(v, depth = 0) {
  if (depth > 3) fail('meta is nested too deeply');
  if (!plain(v)) fail('meta must be an object of plain values');
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    if (!KEY.test(k)) fail(`meta: key "${String(k).slice(0, 40)}" is not allowed`);
    if (x === null || typeof x === 'boolean' || (typeof x === 'number' && Number.isFinite(x))) out[k] = x;
    else if (typeof x === 'string') out[k] = str(x, `meta.${k}`, 200) ?? '';
    else if (plain(x)) out[k] = metaOf(x, depth + 1);
    else fail(`meta.${k}: only text, numbers, booleans and nested objects are allowed`);
  }
  return out;
}
// A default look, so every agent is visually distinguishable without art: a colour picked from its id.
const COLOURS = ['#2a9d8f', '#e76f51', '#8e44ad', '#f4a261', '#3a86ff', '#d62828', '#6a994e', '#ff006e', '#118ab2', '#bc6c25'];
function defaultAppearance(id) {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  const i = Math.abs(h) % COLOURS.length;
  return { archetype: 'human', rig: 'humanoid', palette: { primary: COLOURS[i], secondary: COLOURS[(i + 3) % COLOURS.length] }, themes: { real: { accessories: [['glasses', 'headset', 'cap', 'hardhat'][Math.abs(h >> 4) % 4]] }, fantasy: { archetype: 'human', accessories: ['cape'] } } };
}

// Validates a creation request against the current HQ state. Returns { id, definition } or throws; pure.
export function validateAgentInput(input, state, { newId = () => randomBytes(3).toString('hex') } = {}) {
  if (!plain(input)) fail('An agent definition must be a JSON object');
  let size; try { size = JSON.stringify(input).length; } catch { fail('An agent definition must be plain JSON'); }
  if (size > 8000) fail('Agent definition is too large (8000 characters at most)');
  onlyKeys(input, 'Agent', FIELDS);
  const agents = Object.values(state.agents);
  const name = str(input.name, 'name', 60, { required: true, pattern: NAME });
  if (agents.some(a => String(a.name).toLowerCase() === name.toLowerCase())) fail(`An agent named ${name} already exists`);
  const backendId = str(input.backend, 'backend', 40, { required: true });
  const backend = Object.hasOwn(BACKENDS, backendId) ? BACKENDS[backendId] : fail(`Unsupported backend "${backendId.slice(0, 40)}". HQ can configure: ${Object.keys(BACKENDS).join(', ')}`);
  // The provider follows from the backend; a request cannot claim a different one.
  if (input.provider != null && input.provider !== backend.provider) fail(`Backend ${backendId} is provider ${backend.provider}, not "${String(input.provider).slice(0, 40)}"`);
  let id = str(input.id, 'id', 40, { pattern: ID });
  if (id != null) {
    if (RESERVED_IDS.has(id) || state.agents[id]) fail(`Agent id ${id} is already taken`);
  } else {
    const base = slug(name).slice(0, 24) || 'agent';
    for (let i = 0; i < 20 && (id == null || state.agents[id] || RESERVED_IDS.has(id)); i++) id = `${/^[a-z]/.test(base) ? base : `agent-${base}`}-${newId()}`.slice(0, 40);
    if (state.agents[id]) fail('Could not generate a unique agent id');
  }
  const model = str(input.model, 'model', 80, { pattern: MODEL });
  const capabilities = strList(input.capabilities, 'capabilities', { max: 8, each: 40 });
  if (!capabilities?.length) fail('At least one capability is required');
  for (const c of capabilities) {
    if (Object.hasOwn(RESERVED_CAPABILITIES, c)) fail(`Capability ${c} cannot be given to an HQ-created agent: ${RESERVED_CAPABILITIES[c]}`);
    if (!Object.hasOwn(CAPABILITIES, c)) fail(`Unsupported capability "${c.slice(0, 40)}"`);
  }
  const needed = [...new Set(capabilities.flatMap(c => CAPABILITIES[c].tools))];
  const tools = strList(input.tools, 'tools', { max: 8, each: 40 }) ?? needed;
  for (const t of tools) if (!Object.hasOwn(TOOLS, t)) fail(`Unsupported tool "${t.slice(0, 40)}"`);
  const permissions = strList(input.permissions, 'permissions', { max: 8, each: 40 }) ?? [...new Set(tools.map(t => TOOLS[t].permission).filter(Boolean))];
  for (const p of permissions) {
    if (!Object.hasOwn(PERMISSIONS, p)) fail(`Permission "${p.slice(0, 40)}" is refused: HQ-created agents may hold only ${Object.keys(PERMISSIONS).join(', ')}`);
    // Least privilege: a permission no granted tool uses is an escalation, not a convenience.
    if (!tools.some(t => TOOLS[t].permission === p)) fail(`Permission ${p} is not used by any of this agent's tools`);
  }
  const known = new Set([...Object.keys(state.agents), 'kyle']);
  const reportsTo = str(input.reportsTo, 'reportsTo', 40, { pattern: /^[a-z][a-z0-9-]{1,39}$/ });
  if (reportsTo && !known.has(reportsTo)) fail(`reportsTo: unknown agent ${reportsTo}`);
  const coordinatesWith = strList(input.coordinatesWith, 'coordinatesWith', { max: 8, each: 40, pattern: /^[a-z][a-z0-9-]{1,39}$/ });
  for (const c of coordinatesWith ?? []) if (!state.agents[c]) fail(`coordinatesWith: unknown agent ${c}`);
  let workstation;
  if (input.workstation != null) {
    if (!plain(input.workstation)) fail('workstation must be an object');
    onlyKeys(input.workstation, 'workstation', ['kind']);
    if (!WORKSTATIONS.includes(input.workstation.kind)) fail(`workstation.kind must be one of ${WORKSTATIONS.join(', ')}`);
    workstation = { kind: input.workstation.kind };
  }
  let attribution;
  if (input.attribution != null) {
    if (!plain(input.attribution)) fail('attribution must be { tokens: [...] }');
    onlyKeys(input.attribution, 'attribution', ['tokens']);
    // Literal words only (matched as whole words by the World); never a pattern or code.
    attribution = { tokens: strList(input.attribution.tokens, 'attribution.tokens', { max: 8, each: 40, pattern: TOKEN }) ?? [] };
  }
  const definition = Object.fromEntries(Object.entries({
    name, backend: backendId, provider: backend.provider, model,
    role: str(input.role, 'role', 120, { required: true }),
    description: str(input.description, 'description', 400),
    instructions: str(input.instructions, 'instructions', 2000),
    responsibilities: strList(input.responsibilities, 'responsibilities', { max: 12, each: 80 }),
    capabilities, tools, permissions,
    team: str(input.team, 'team', 60),
    reportsTo, coordinatesWith, workstation,
    appearance: input.appearance != null ? look(input.appearance, 'appearance', { themes: true }) : defaultAppearance(id),
    attribution,
    meta: input.meta != null ? metaOf(input.meta) : undefined,
  }).filter(([, v]) => v !== undefined));
  return { id, definition };
}

// ---- Provisioning checks. Each returns { ok, detail, ... } | { wait, detail, ownerAction } | { defer } (try again
// on a later tick, e.g. the local worker slot is busy). ctx: { engine, ollama: { enabled, request }, trialTimeoutMs }.
const clip = (s, n = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export function ensureLocalRoute(adapterId, operation) {
  if (!routesFor(adapterId, operation)[0]?.unclassified) return;
  registerRoute({ adapterId, operations: [operation], computeClass: 'LOCAL', provider: 'local', backend: 'Ollama on 127.0.0.1 (local model only)', authentication: 'none' });
}

export const CHECKS = {
  CONFIGURING(agent) {
    const d = agent.definition, backend = BACKENDS[d.backend];
    if (!backend) return { ok: false, detail: `Backend ${d.backend} is not one HQ can configure.` };
    if (backend.model === 'none' && d.model) return { ok: false, detail: `${backend.label} runs the signed-in tool's own default model; HQ cannot select model ${d.model} for it. Remove the model, or pick a backend that takes one.` };
    if (backend.model === 'required' && !d.model) return { ok: false, detail: `${backend.label} needs a model name (an installed Ollama model).` };
    if (d.backend === 'ollama' && isCloudModel(d.model)) return { ok: false, detail: `Model ${d.model} is an Ollama cloud model, not local compute; HQ never runs it.` };
    for (const c of d.capabilities) {
      const cap = CAPABILITIES[c], op = cap && operations[cap.operation];
      if (!cap || !op || op.capability !== c) return { ok: false, detail: `Capability ${c} does not map to an allowlisted HQ operation.` };
    }
    return { ok: true, detail: `Definition valid for ${backend.label}: ${d.capabilities.map(c => CAPABILITIES[c].operation).join(', ')}.` };
  },
  async CONNECTING_PROVIDER(agent, ctx) {
    const d = agent.definition, backend = BACKENDS[d.backend], adapterId = backend.adapterId(d), engine = ctx.engine;
    if (d.backend === 'ollama') {
      if (!ctx.ollama?.enabled) return { wait: true, detail: 'HQ\'s local Ollama bridge is off in this HQ.', ownerAction: 'Start HQ with HQ_OLLAMA_ENABLED=1 on a machine running Ollama; HQ re-checks automatically.' };
      let models;
      try { models = await discoverModels(ctx.ollama.request); } catch (error) { return { wait: true, detail: `Ollama is not reachable at 127.0.0.1:11434 (${clip(error.message, 120)}).`, ownerAction: 'Start Ollama on this machine; HQ re-checks automatically.' }; }
      const m = models.find(x => x.name === d.model);
      if (!m) return { wait: true, detail: `Model ${d.model} is not installed in Ollama. HQ never downloads models.`, ownerAction: `Run \`ollama pull ${d.model}\` yourself if you want it; HQ re-checks automatically.` };
      if (m.remote_host || isCloudModel(m.name)) return { ok: false, detail: `Model ${d.model} runs remotely, not on this machine; HQ refuses it.` };
      // Real setup: an adapter bound to exactly this installed model, on a LOCAL route.
      engine.adapters[adapterId] ??= new OllamaAdapter(d.model, { request: ctx.ollama.request });
      ensureLocalRoute(adapterId, 'summarize-local');
      return { ok: true, detail: `Ollama model ${d.model} is installed locally (${clip(m.details?.family, 30)}); adapter ${adapterId} configured.` };
    }
    const adapter = engine.adapters[adapterId];
    if (!adapter) return backend.bridge
      ? { wait: true, detail: `${backend.label}: the bridge is off in this HQ.`, ownerAction: `Start HQ with ${backend.bridge} on a machine where the CLI is installed and signed in; HQ re-checks automatically.` }
      : { wait: true, detail: `${backend.label}: launcher not connected in this HQ.`, ownerAction: 'Restart HQ; the local check launcher is part of every HQ.' };
    let h;
    try { h = await adapter.health(); } catch (error) { return { wait: true, detail: `${backend.label}: health check failed (${clip(error.message, 160)}).`, ownerAction: 'HQ re-checks automatically.' }; }
    if (h?.status === 'IDLE' && (!backend.bridge || h.auth === 'subscription')) return { ok: true, detail: clip(h.detail) };
    // A missing or wrong sign-in is waiting for Kyle's authorization, never a reason to use an API key instead.
    if (/AUTH_REQUIRED/.test(h?.detail ?? '')) return { wait: true, detail: `Waiting for authorization: ${clip(h.detail, 260)}`, ownerAction: 'Sign the CLI in with your subscription; HQ re-checks automatically and never falls back to an API key.' };
    return { wait: true, detail: `${backend.label} is ${h?.status ?? 'UNKNOWN'}: ${clip(h?.detail, 240)}`, ownerAction: 'Install or start it; HQ re-checks automatically.' };
  },
  CONNECTING_TOOLS(agent, ctx) {
    const d = agent.definition, backend = BACKENDS[d.backend], adapterId = backend.adapterId(d), adapter = ctx.engine.adapters[adapterId];
    for (const t of d.tools) if (!backend.tools.includes(t)) return { ok: false, detail: `Tool ${t} is not available on ${backend.label} (it provides ${backend.tools.join(', ')}).` };
    const bindings = [];
    for (const c of d.capabilities) {
      const cap = CAPABILITIES[c];
      for (const t of cap.tools) {
        if (!d.tools.includes(t)) return { ok: false, detail: `Capability ${c} needs tool ${t}, which this agent was not given.` };
        const perm = TOOLS[t].permission;
        if (perm && !d.permissions.includes(perm)) return { ok: false, detail: `Tool ${t} needs permission ${perm}, which was not granted. Without it the agent cannot become READY.` };
        const probe = TOOLS[t].probe();
        if (probe !== true) return { ok: false, detail: `Tool ${t} is not available here: ${probe}.` };
      }
      const route = routeFor(adapterId, cap.operation);
      if (route.unclassified) return { ok: false, detail: `No HQ compute route serves ${cap.operation} on ${adapterId}; HQ would have to treat it as metered, so it refuses.` };
      if (route.computeClass === 'METERED_API') return { ok: false, detail: `${cap.operation} on ${adapterId} is metered API compute; HQ-created agents are $0 only.` };
      const sup = adapter?.supports?.(cap.operation, route.variant);
      if (!adapter || sup === false || sup?.ok === false) return { ok: false, detail: `${adapterId} cannot run ${cap.operation} here${sup?.reason ? `: ${clip(sup.reason, 160)}` : ''}.` };
      bindings.push({ capability: c, operation: cap.operation, tools: cap.tools, permissions: [...new Set(cap.tools.map(t => TOOLS[t].permission).filter(Boolean))], computeClass: route.computeClass });
    }
    return { ok: true, detail: `Bound ${bindings.map(b => `${b.capability} -> ${b.operation} (${b.computeClass})`).join('; ')}.`, bindings };
  },
  async TESTING(agent, ctx) {
    const d = agent.definition, backend = BACKENDS[d.backend], adapterId = backend.adapterId(d), engine = ctx.engine, adapter = engine.adapters[adapterId];
    if (!adapter) return { ok: false, detail: `${adapterId} disappeared before the trial.` };
    if (backend.bridge) {
      // A trial review would spend subscription capacity; the check is a fresh sign-in and route verification only.
      const h = await adapter.health();
      if (h?.status !== 'IDLE' || h.auth !== 'subscription') return { wait: true, detail: `Sign-in check failed: ${clip(h?.detail, 240)}`, ownerAction: 'Sign the CLI in with your subscription; HQ re-checks automatically.' };
      return { ok: true, detail: `Sign-in verified as the subscription and every capability routes to $0 compute. No model call was made (a trial review would use subscription capacity).` };
    }
    // A real trial run through the same adapter work uses, when it is free: one allowlisted local process, or one short
    // local generation. It waits for the local worker slot rather than overlapping real work.
    if (Object.values(engine.state.runs).some(r => !r.endedAt && !engine.adapters[engine.state.agents[r.agentId]?.executionAdapter]?.remote)) return { defer: true };
    const task = d.backend === 'ollama'
      ? { operation: 'summarize-local', safety: 'local-read-only', description: 'Hillink HQ provisioning check. Summarize this sentence in five words or fewer.' }
      : { operation: 'inspect-repo', safety: 'local-read-only', description: 'Hillink HQ provisioning trial.' };
    const r = await trial(adapter, task, ctx.trialTimeoutMs ?? 60_000);
    if (!r.ok) return { ok: false, detail: `Trial ${task.operation} failed: ${clip(r.detail, 240)}` };
    return { ok: true, detail: `Trial ${task.operation} passed: ${clip(r.detail, 240)}` };
  },
};

// One trial run on an adapter, outside HQ's task queue (it is provisioning evidence, not work).
export async function trial(adapter, task, timeoutMs) {
  const runId = `trial-${randomUUID()}`, seen = [];
  let settle, timer;
  const done = new Promise(resolve => { settle = resolve; });
  const emit = m => {
    seen.push(m);
    if (m.kind === 'COMPLETED') settle({ ok: seen.some(x => x.kind === 'ACK'), detail: [...seen].reverse().find(x => ['FINDING', 'MODEL_RESULT', 'TEST_RESULT'].includes(x.kind))?.summary ?? m.summary });
    if (['FAILED', 'BLOCKED', 'CANCELLED', 'RATE_LIMITED', 'UNCERTAIN'].includes(m.kind)) settle({ ok: false, detail: m.summary });
  };
  try {
    await adapter.start({ task: { id: runId, title: 'Provisioning trial', ...task }, runId, emit, compute: null });
    return await Promise.race([done, new Promise(resolve => { timer = setTimeout(() => resolve({ ok: false, detail: `no result within ${Math.round(timeoutMs / 1000)}s`, timedOut: true }), timeoutMs); })]).then(async r => {
      if (r.timedOut) await adapter.cancel?.(runId).catch?.(() => {});
      return r;
    });
  } catch (error) { return { ok: false, detail: error.message }; } finally { clearTimeout(timer); }
}

// The execution binding an agent gets at READY (from its backend; never from the request).
export function bindingFor(agent) {
  const d = agent.definition, b = BACKENDS[d.backend];
  return { executionAdapter: b.adapterId(d), telemetryAdapter: b.telemetry, usageSource: b.usage, routingPriority: 50, ...(b.ackTimeoutMs ? { ackTimeoutMs: b.ackTimeoutMs } : {}) };
}

// After a restart: adapters HQ created during provisioning (Ollama models) are created again for agents that have one.
export function rebindAdapters(engine, { ollama } = {}) {
  for (const a of Object.values(engine.state.agents)) {
    if (!a.lifecycle || a.definition?.backend !== 'ollama' || !a.executionAdapter || !ollama?.enabled) continue;
    engine.adapters[a.executionAdapter] ??= new OllamaAdapter(a.definition.model, { request: ollama.request });
    ensureLocalRoute(a.executionAdapter, 'summarize-local');
  }
}
