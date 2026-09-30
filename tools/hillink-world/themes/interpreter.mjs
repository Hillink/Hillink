// Pass 5E: the theme interpreter. The one place a World theme decides how canonical facts LOOK. It reads canonical
// state and semantic events (core/semantic.mjs) and returns presentation: where a character should be staged, which
// clip, what its caption says, which named visual sequence plays. It never returns or dispatches events, and it only
// ever sees read-only views of the World (readonly() below): a sequence finishing, looping or failing on screen can
// not create, advance or undo any HQ fact. READY comes from HQ (or the labelled simulator); the World reacts.
//
// A theme is a table:
//   agent[lifecycleState]  -> { place?, clip?, caption, sequence? }   staging for an agent that is not yet (or no
//                             longer) a working member; members are placed by their activity as before
//   events[semanticType]   -> { sequence, text(names, e) }            a named visual beat and a feed line
// Missing entries fall back to the theme it extends, then to NEUTRAL (plain captions, no sequence), so a new theme
// can start empty and nothing breaks.
import { presenceOf } from '../core/agents.mjs';

// Read-only view: any write throws, at any depth. Interpretations get these, never the live objects.
const RO = new WeakMap();
export function readonly(v) {
  if (v == null || typeof v !== 'object') return v;
  if (RO.has(v)) return RO.get(v);
  const p = new Proxy(v, {
    get: (t, k) => readonly(Reflect.get(t, k)),
    set: () => { throw TypeError('the theme interpreter cannot change canonical state'); },
    defineProperty: () => { throw TypeError('the theme interpreter cannot change canonical state'); },
    deleteProperty: () => { throw TypeError('the theme interpreter cannot change canonical state'); },
    setPrototypeOf: () => { throw TypeError('the theme interpreter cannot change canonical state'); },
  });
  RO.set(v, p); return p;
}

const NEUTRAL = {
  agent: {
    REQUESTED: { caption: 'Requested' }, CONFIGURING: { caption: 'Provisioning: configuring' }, CONNECTING_PROVIDER: { caption: 'Provisioning: connecting provider' },
    CONNECTING_TOOLS: { caption: 'Provisioning: connecting tools' }, GENERATING_APPEARANCE: { caption: 'Provisioning: appearance' }, TESTING: { caption: 'Provisioning: testing' },
    WAITING: { caption: 'Provisioning paused' }, ERROR: { caption: 'Provisioning failed' },
  },
  events: {},
};

// Real HQ: a new hire. Candidates wait in the lobby (the onboarding area of today's HQ) while their real setup runs;
// only when HQ says READY do they walk in to the team. Construction and task beats are already staged by the Real
// renderers from canonical state; their names are recorded here so the table is the one index of Real's staging.
const REAL = {
  extends: NEUTRAL,
  agent: {
    REQUESTED: { place: 'onboarding', clip: 'waiting', caption: 'Candidate: arrived for onboarding', sequence: 'candidate-arrives' },
    CONFIGURING: { place: 'onboarding', clip: 'waiting', caption: 'Onboarding: role and instructions', sequence: 'interview' },
    CONNECTING_PROVIDER: { place: 'onboarding', clip: 'waiting', caption: 'Onboarding: provider account', sequence: 'interview' },
    CONNECTING_TOOLS: { place: 'onboarding', clip: 'waiting', caption: 'Onboarding: tool access', sequence: 'interview' },
    GENERATING_APPEARANCE: { place: 'onboarding', clip: 'waiting', caption: 'Onboarding: ID badge', sequence: 'interview' },
    TESTING: { place: 'onboarding', clip: 'waiting', caption: 'Onboarding: trial task', sequence: 'trial' },
    WAITING: { place: 'onboarding', clip: 'waiting', caption: 'Onboarding paused: waiting on setup', sequence: 'interview-paused' },
    ERROR: { place: 'onboarding', clip: 'blocked', caption: 'Onboarding failed', sequence: 'interview-failed' },
  },
  events: {
    AGENT_REQUESTED: { sequence: 'candidate-arrives', text: n => `${n} arrived for onboarding` },
    AGENT_PROVISIONING: { sequence: 'interview', text: (n, e) => `${n}: onboarding (${String(e.stage).toLowerCase().replace(/_/g, ' ')})` },
    AGENT_PROVISIONING_WAITING: { sequence: 'interview-paused', text: n => `${n}: onboarding paused` },
    AGENT_PROVISIONING_FAILED: { sequence: 'interview-failed', text: n => `${n}: onboarding failed` },
    AGENT_READY: { sequence: 'onboarding-complete', text: n => `${n} finished onboarding` },
    AGENT_ACTIVATED: { sequence: 'joins-team', text: n => `${n} joined the team` },
    AGENT_DISABLED: { sequence: 'leaves-office', text: n => `${n} was disabled` },
    AGENT_RETIRED: { sequence: 'leaves-office', text: n => `${n} retired` },
    TASK_STARTED: { sequence: 'task-board-pickup' }, TASK_COMPLETED: { sequence: 'file-at-archive' }, TASK_BLOCKED: { sequence: 'frustrated-at-desk' },
    BUILD_STARTED: { sequence: 'construction-crew' }, BUILD_STAGE_CHANGED: { sequence: 'construction-stage' }, BUILD_BLOCKED: { sequence: 'site-stopped' }, BUILD_COMPLETED: { sequence: 'site-handover' },
  },
};

// Themes. Fantasy uses the Real staging until its own interpretation is built (Pass 5G): that is where AGENT_REQUESTED
// becomes the summoning chamber, the provisioning stages become portal runes, ERROR an unstable portal, and READY the
// portal stabilising as the hero walks out. Only this table changes; canonical logic does not.
export const THEMES = { real: REAL, blueprint: REAL, fantasy: { extends: REAL, agent: {}, events: {} } };
export function defineTheme(id, table) { THEMES[id] = { extends: NEUTRAL, agent: {}, events: {}, ...table }; return THEMES[id]; }

const lookup = (theme, part, key) => { for (let t = theme; t; t = t.extends) if (t[part]?.[key]) return t[part][key]; return null; };

export function createInterpreter(themeId = 'real') {
  const theme = THEMES[themeId] ?? THEMES.real;
  return {
    themeId,
    // Staging for one agent, from its canonical lifecycle: { presence, place?, clip?, caption?, sequence? }.
    agent(a) {
      const ro = readonly(a), presence = presenceOf(ro);
      if (presence !== 'candidate') return { presence };
      const s = lookup(theme, 'agent', ro.lifecycle.state) ?? {};
      return { presence, place: s.place ?? null, clip: s.clip ?? 'waiting', caption: s.caption ?? ro.lifecycle.state, sequence: s.sequence ?? null };
    },
    // A semantic event's visual beat: { sequence, text } or null. `names` resolves an agent id to its display name.
    cue(e, names = id => id) {
      const ro = readonly(e), s = lookup(theme, 'events', ro.type); if (!s) return null;
      return { sequence: s.sequence ?? null, text: s.text ? s.text(names(ro.agentId), ro) : null };
    },
  };
}
