// Pass 5C: the animation intent layer. Three stages, each replaceable on its own:
//
//   simulation state  ->  animation intent  ->  rendered animation
//   (agent activity, HQ truth,    (what the body means: one of      (a rig turns intent + variant into a clip, a
//    place, motion, the project    INTENTS, plus a variant such as    held prop and a tempo for one visual identity:
//    stage at its site)            the construction stage)            render/rigs.mjs; drawFigure draws the clip)
//
// The controller (engine/iso-view.mjs) resolves the body clip and calls intentOf(); nothing here reads artwork, and
// nothing in a rig reads World state. A future sprite, 3D rig or Fantasy character only needs a new rig.
//
// Truth rule. An intent is a picture of canonical state, never a new fact: working, building, testing, reviewing,
// investigating and meeting appear only when the body clip is already a productive one (which the controller plays
// only for a verified activity, at the assigned station, after arriving) or a real meeting; waiting, blocked,
// attention and recovering come from HQ truth (core/truth.mjs) or the task's own status; completed only for the
// completion the reducer recorded.
export const INTENTS = ['idle', 'walking', 'working', 'building', 'investigating', 'testing', 'reviewing', 'meeting', 'waiting', 'blocked', 'onBreak', 'attention', 'recovering', 'completed'];
const BREAK_USES = new Set(['relax', 'coffee', 'snack', 'table', 'lean', 'look']);
// Short beats between poses keep the intent they lead to or come from (sitting down to type is part of working).
const BEATS = new Set(['react', 'stand', 'sit']);

// e: the character entity; body: its resolved clip (engine/iso-view.mjs resolveState); ctx: { world (the World
// state), projects (the canonical construction projects, layout.projects) }. Returns { intent, variant }.
export function intentOf(e, body, { world = null, projects = {} } = {}) {
  const a = e.agent;
  if (!a) return { intent: 'idle', variant: null };
  if (BEATS.has(body)) return { intent: e.anim?.intent && e.anim.intent !== 'walking' ? e.anim.intent : 'idle', variant: e.anim?.variant ?? null };
  if (body === 'walk' || body === 'carry') return { intent: 'walking', variant: e.carrying ? 'carrying' : e.ride ? 'to-lift' : null };
  if (e.gait === 'wait-lift' || e.gait === 'ride') return { intent: 'walking', variant: 'lift' };
  const site = e.spotInfo?.use === 'build' || e.spotInfo?.use === 'site-inspect' ? siteProject(e, projects) : null;
  switch (body) {
    case 'assemble': case 'dig': case 'paint': case 'install': case 'lift': case 'measure':
      return { intent: 'building', variant: site ? variantOfProject(site) : 'structure' };
    case 'survey': return { intent: a.activity === 'testing' ? 'testing' : 'reviewing', variant: 'site' };
    case 'type': case 'work': return { intent: 'working', variant: a.activity === 'thinking' ? 'thinking' : a.activity === 'coordinating' ? 'coordinating' : null };
    case 'inspect': return { intent: a.activity === 'testing' ? 'testing' : a.activity === 'coordinating' ? 'working' : 'reviewing', variant: null };
    case 'read': return { intent: 'investigating', variant: null };
    case 'meeting': return { intent: 'meeting', variant: null };
    case 'talk': return { intent: e.errand || e.receiving ? 'working' : 'meeting', variant: 'handoff' };
    case 'celebrate': return { intent: 'completed', variant: null };
    case 'offline': return { intent: 'idle', variant: 'offline' };
    case 'blocked': return { intent: 'recovering', variant: 'failed' };
    case 'waiting': {
      const state = a.truth?.state, task = a.taskId ? world?.tasks?.[a.taskId] : null;
      if (state === 'NEEDS_ATTENTION' || a.owner) return { intent: 'attention', variant: null };
      if (task?.status === 'blocked' || /blocked/i.test(a.truth?.reason ?? '')) return { intent: 'blocked', variant: null };
      return { intent: 'waiting', variant: site ? 'site-paused' : null };
    }
    default: {
      // Standing idle at a construction site while its inspection is under way: the build is paused, not worked.
      if (site && site.stage === 'inspection') return { intent: 'waiting', variant: 'inspection-pause' };
      if (a.activity === 'idle' && BREAK_USES.has(e.spotInfo?.use)) return { intent: 'onBreak', variant: e.spotInfo.use };
      if (a.truth?.state === 'FAILED') return { intent: 'recovering', variant: 'failed' };
      return { intent: 'idle', variant: null };
    }
  }
}
// The project whose site the character stands at (site station ids are "site:<project>:<key>").
function siteProject(e, projects) {
  const id = String(e.spot ?? '').match(/^site:([^:]+):/)?.[1];
  return id ? projects?.[id] ?? null : null;
}
// Construction variant: the project's canonical stage; 'repair' while it is being reworked after a review.
export function variantOfProject(p) {
  const last = p.history?.at(-1);
  if (p.stage === 'systems' && /^rework/.test(last?.why ?? '')) return 'repair';
  return p.stage;
}

// Which body clip a builder plays at a site, for the project's current stage (the rig then dresses it).
export const BUILD_CLIP = { 'site-preparation': 'measure', foundation: 'dig', structure: 'assemble', exterior: 'paint', systems: 'install', repair: 'install', furnishing: 'lift' };

// Facing angles (screen radians) for the four drawn directions, and the turn toward a station's facing.
export const FACING_ANGLE = { right: 0, front: Math.PI / 2, left: Math.PI, back: -Math.PI / 2 };

// Clip blending: how far a character is through the change from its previous clip (0..1 over BLEND_MS).
export const BLEND_MS = 280;
export function blendOf(anim, now) {
  if (!anim?.prev) return 1;
  const k = Math.min(1, Math.max(0, (now - anim.since) / BLEND_MS));
  return k * k * (3 - 2 * k);
}
// Records a change of clip, remembering the previous one so the renderer can blend (play() in engine/iso-view.mjs).
export function setClip(e, state, now, { intent = null, variant = null } = {}) {
  const cur = e.anim;
  if (cur?.state !== state) e.anim = { state, since: now, prev: cur?.state ?? null, prevSince: cur?.since ?? now, intent, variant };
  else { cur.intent = intent; cur.variant = variant; }
  return e.anim;
}
