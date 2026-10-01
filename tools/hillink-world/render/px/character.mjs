// Pass 5H vertical slice: modular pixel characters. One shared construction for every character, Real or Fantasy:
//   a BODY PLAN (proportions: the standard human, the dwarf) + PARTS (hair, face, beard, headwear, garments, arm
//   material, tools; pixel masks authored as data) + a PALETTE (named colours) + CLIPS (pose tables: idle, walk and
//   each role's work clip, standing or seated) -> a sprite for one facing and one frame.
// Facings are the four diagonals. Two are authored (front-right, back-right); the left ones mirror them. An
// asymmetric character (the Fantasy Codex: the right half of his face and his right arm are machine) is not simply
// mirrored: its anatomical sides are swapped before the mirror, so the machine half stays on his right (§6).
// Everything below the functions is data: masks are strings, palettes are colours, poses are numbers. Appearance
// metadata can only select parts and colours by name (validateLook); nothing reaches the raster as code.
import { PixelBuffer, hex } from './buffer.mjs';
import { ramp } from './palette.mjs';

// ---- Body plans (pixels; y is up from the feet: the lowest row is y = -1). -----------------------------------------
export const BODY_PLANS = {
  human: { height: 24, head: { x0: -4, w: 9, top: -23, h: 8 }, torso: { x0: -4, w: 9, top: -15, h: 7 }, belt: -8, legs: { top: -7, w: 3, xs: [-3, 1], boot: 2 }, arm: { w: 2, len: 6 } },
  dwarf: { height: 21, head: { x0: -4, w: 9, top: -20, h: 8 }, torso: { x0: -5, w: 11, top: -12, h: 7 }, belt: -5, legs: { top: -4, w: 3, xs: [-4, 1], boot: 2 }, arm: { w: 3, len: 5 } },
};

// ---- Parts: pixel masks. A mask is { at, ox, oy, rows } where `at` names the anchor box (head, torso, legs, hand),
// ox/oy offset it from the box's top-left, and each character of a row is a palette slot code (see CODES) or '.'.
// Views: fr (front, facing right), br (back, facing right). Optional R / L variants carry anatomical sides.
const CODES = { '#': ['k', 2], '+': ['k', 3], '-': ['k', 1], '=': ['k', 0], o: ['outline', 2], e: ['eye', 2], w: ['white', 2], s: ['skin', 2], S: ['skin', 1], g: ['accent', 2], G: ['accent', 3], a: ['accent2', 2], A: ['accent2', 1], m: ['metal', 2], M: ['metal', 1], N: ['metal', 3], r: ['glow', 2], R: ['glow', 4], b: ['shirt', 2], B: ['shirt', 1], h: ['hair', 2], H: ['hair', 3], d: ['hair', 1] };
// `k` is the part's own colour slot (part.slot), so one mask serves any colour.
export const PARTS = {
  // Hair (slot hair).
  'hair.short': { slot: 'hair', layer: 'hair', fr: { at: 'head', ox: 0, oy: -1, rows: ['..#####..', '.#######+', '#####++##', '####.....', '##.......', '#........'] }, br: { at: 'head', ox: 0, oy: -1, rows: ['..#####..', '.#######.', '#########', '#########', '#########', '#########', '-#######-'] } },
  'hair.slick': { slot: 'hair', layer: 'hair', fr: { at: 'head', ox: 0, oy: -1, rows: ['..######.', '.##++####', '##+######', '####.....', '##.......', '#........'] }, br: { at: 'head', ox: 0, oy: -1, rows: ['..#####..', '.##+####.', '#########', '#########', '#########', '-#######-'] } },
  'hair.long': { slot: 'hair', layer: 'hair', fr: { at: 'head', ox: 0, oy: -1, rows: ['..#####..', '.#####++#', '##+######', '###......', '##.......', '##.......', '##.......', '-#.......', '-#.......'] }, br: { at: 'head', ox: 0, oy: -1, rows: ['..#####..', '.##+####.', '#########', '#########', '#########', '#########', '#########', '-#######-', '.-#####-.'] } },
  'hair.wild': { slot: 'hair', layer: 'hair', fr: { at: 'head', ox: -1, oy: -2, rows: ['..#.#.#....', '.########..', '.####+++##.', '#######+##.', '#####......', '###........', '##.........'] }, br: { at: 'head', ox: -1, oy: -2, rows: ['..#.#.#.#..', '.#########.', '###########', '###########', '###########', '###########', '###########', '-#########-', '.-#######-.'] } },
  'hair.crop': { slot: 'hair', layer: 'hair', fr: { at: 'head', ox: 0, oy: 0, rows: ['.#######.', '#####+++#', '###......', '#........'] }, br: { at: 'head', ox: 0, oy: 0, rows: ['.#######.', '#########', '#########', '#########', '-#######-'] } },
  // Faces (front only; skin is drawn by the head).
  'face.plain': { layer: 'face', fr: { at: 'head', ox: 0, oy: 0, rows: ['', '', '', '', '.....e.e.', '........S', '......S..'] } },
  'face.glasses': { layer: 'face', fr: { at: 'head', ox: 0, oy: 0, rows: ['', '', '', '', '....NeNeN', '........S', '......S..'] } },
  'face.stern': { layer: 'face', fr: { at: 'head', ox: 0, oy: 0, rows: ['', '', '', '....-.-..', '.....e.e.', '........S', '......S..'] } },
  // The Fantasy Codex: the right half of his face is machine, with ONE red eye (anatomical right = the far side in a
  // right-facing view). L is the same face for a mirrored (left-facing) view, where his right is the near side.
  'face.cyborg': { layer: 'face', side: true,
    fr: { R: { at: 'head', ox: 0, oy: 0, rows: ['.mmmm....', 'mNmmM....', 'mmmmM....', 'MmmmMm...', 'mmmmRR.e.', 'MmmmrM..S', '.MmmM.S..', '.MMM.....'] }, L: { at: 'head', ox: 0, oy: 0, rows: ['....mmmm.', '....MmmNm', '....MmmmM', '...mMmmmM', '.e.RRmmmM', '...MrmmmS', '....MmmM.', '.....MMM.'] } },
    br: { R: { at: 'head', ox: 0, oy: 0, rows: ['.mmmm....', 'mNmmM....', 'mmmmM....', 'MmmmM....', 'mmrmM....', 'MmmmM....'] }, L: { at: 'head', ox: 0, oy: 0, rows: ['....mmmm.', '....MmmNm', '....Mmmmm', '....MmmmM', '....MmrmM', '....MmmmM'] } } },
  // Beards (slot hair).
  'beard.long': { slot: 'hair', layer: 'beard', fr: { at: 'head', ox: 0, oy: 5, rows: ['...######', '..#######', '..###+###', '...#####.', '...####..', '....##...'] }, br: { at: 'head', ox: 0, oy: 6, rows: ['#.......#', '##.....##'] } },
  'beard.full': { slot: 'hair', layer: 'beard', fr: { at: 'head', ox: 0, oy: 5, rows: ['...######', '..#######', '...######', '....####.', '.....##..'] }, br: { at: 'head', ox: 0, oy: 6, rows: ['#.......#'] } },
  'beard.stubble': { slot: 'hair', layer: 'beard', fr: { at: 'head', ox: 0, oy: 6, rows: ['.....-.-.', '......-..'] } },
  // Headwear (slot hat).
  'hat.hardhat': { slot: 'hat', layer: 'hat', fr: { at: 'head', ox: 0, oy: -3, rows: ['...####..', '..##++##.', '.###++###', '.#########', '-----------'] }, br: { at: 'head', ox: -1, oy: -3, rows: ['...####...', '..##++##..', '.###++###.', '.########.', '----------'] } },
  'hat.crown': { slot: 'hat', layer: 'hat', fr: { at: 'head', ox: 1, oy: -4, rows: ['#.#.#.#', '#######', '#a#a#a#', '-------'] }, br: { at: 'head', ox: 1, oy: -4, rows: ['#.#.#.#', '#######', '#######', '-------'] } },
  'hat.cap': { slot: 'hat', layer: 'hat', fr: { at: 'head', ox: 0, oy: -2, rows: ['..#####..', '.#######.', '##########+', '.........--'] }, br: { at: 'head', ox: 0, oy: -2, rows: ['..#####..', '.#######.', '#########', '-#######-'] } },
  // Garments over the torso (slot top; shirt shows under).
  'top.suit': { slot: 'top', layer: 'top', fr: { at: 'torso', ox: 0, oy: 0, rows: ['####www##', '####wg###', '-###wg##+', '-###wg##+', '-####g##+', '-#######+', '-#######+'] }, br: { at: 'torso', ox: 0, oy: 0, rows: ['#########', '-#######+', '-#######+', '-#######+', '-#######+', '-#######+', '-#######+'] } },
  'top.vest': { slot: 'top', layer: 'top', fr: { at: 'torso', ox: 0, oy: 0, rows: ['##bbbbb##', '##bbbbb##', 'GGGGGGGGG', '-#bbbbb#+', 'GGGGGGGGG', '-#bbbbb#+', '-#######+'] }, br: { at: 'torso', ox: 0, oy: 0, rows: ['#########', '-#######+', 'GGGGGGGGG', '-#######+', 'GGGGGGGGG', '-#######+', '-#######+'] } },
  'top.jacket': { slot: 'top', layer: 'top', fr: { at: 'torso', ox: 0, oy: 0, rows: ['###bbb###', '-##bbb##+', '-##bbb##+', '-##bbb##+', '-##bbb##+', '-##bbb##+', '-#######+'] }, br: { at: 'torso', ox: 0, oy: 0, rows: ['#########', '-#######+', '-#######+', '-#######+', '-#######+', '-#######+', '-#######+'] } },
  'top.robe': { slot: 'top', layer: 'top', fr: { at: 'torso', ox: 0, oy: 0, rows: ['g###g###g', '-##g####+', '-###g###+', '-####g##+', '-#####g#+', '-#######+', 'gggggggggg'] }, br: { at: 'torso', ox: 0, oy: 0, rows: ['#########', '-#######+', '-#######+', '-#######+', '-#######+', '-#######+', '-#######+'] } },
  'top.apron': { slot: 'top', layer: 'top', fr: { at: 'torso', ox: 0, oy: 0, rows: ['bb#bbbb#bbb', 'bb#####bbbb', '-b#####bbb+', '-b#####bbb+', '-b#####bbb+', '-b#####bbb+', '-b#####bbb+'] }, br: { at: 'torso', ox: 0, oy: 0, rows: ['bbbbbbbbbbb', '-bbbbbbbbb+', '-b#######b+', '-bbbbbbbbb+', '-bbbbbbbbb+', '-bbbbbbbbb+', '-bbbbbbbbb+'] } },
  'top.armor': { slot: 'top', layer: 'top', fr: { at: 'torso', ox: 0, oy: 0, rows: ['mm#####mm', 'M#######+', '-##rr##+.', '-##RR###+', '-#######+', 'MmmmmmmmM', '-#######+'] }, br: { at: 'torso', ox: 0, oy: 0, rows: ['mm#####mm', 'M#######M', '-#######+', '-###m###+', '-#######+', 'MmmmmmmmM', '-#######+'] } },
  'top.shirt': { slot: 'top', layer: 'top', fr: { at: 'torso', ox: 0, oy: 0, rows: ['###...###', '-#######+', '-#######+', '-#######+', '-#######+', '-#######+', '-#######+'] }, br: { at: 'torso', ox: 0, oy: 0, rows: ['#########', '-#######+', '-#######+', '-#######+', '-#######+', '-#######+', '-#######+'] } },
  // A long robe or cape continues over the legs (slot top).
  'skirt.robe': { slot: 'top', layer: 'skirt', fr: { at: 'legs', ox: -1, oy: 0, rows: ['-########+', '-########+', '-########+', '-########+', 'gggggggggg'] }, br: { at: 'legs', ox: -1, oy: 0, rows: ['-########+', '-########+', '-########+', '-########+', '-########+'] } },
  'cape.back': { slot: 'cape', layer: 'cape', fr: { at: 'torso', ox: -1, oy: 0, rows: ['##', '##', '##', '-#', '-#', '-#', '-#', '-#', '-#', '-#'] }, br: { at: 'torso', ox: -1, oy: -1, rows: ['.#########.', '###########', '##+#####+##', '###########', '###########', '###########', '###########', '###########', '-#########-', '-#########-', '.-#######-.'] } },
};
// Held tools, drawn at the near hand (fr frame; mirrored with the body). Slot tool.
export const TOOLS = {
  hammer: { ox: -1, oy: -5, rows: ['MmM', '.w.', '.w.', '.w.', '.w.'] },
  tablet: { ox: 0, oy: -3, rows: ['MMMM', 'MrrM', 'MRrM', 'MMMM'] },
  lens: { ox: 0, oy: -4, rows: ['.mm.', 'mrRm', 'mRrm', '.mm.', '.M..'] },
  scepter: { ox: 0, oy: -7, rows: ['.a.', 'aGa', '.a.', '.g.', '.g.', '.g.', '.g.', '.g.'] },
  clipboard: { ox: 0, oy: -3, rows: ['MwwM', 'wwww', 'w--w', 'wwww'] },
};

// ---- Poses. Hand positions are offsets from the shoulder (px); legs name a leg pose. -----------------------------
const HAND = { down: [1, 6], swingF: [3, 5], swingB: [-1, 6], up: [2, -5], strike: [4, 4], hold: [2, 3], point: [6, 0], raise: [2, -6], type1: [3, 3], type2: [3, 4], rest: [2, 4], holdFar: [1, 3] };
export const CLIPS = {
  idle: { fps: 1.4, frames: [{}, { breath: 1 }] },
  walk: { fps: 7, frames: [{ legs: 'stepA', near: 'swingB', far: 'swingF' }, { legs: 'pass', bob: -1 }, { legs: 'stepB', near: 'swingF', far: 'swingB' }, { legs: 'pass', bob: -1 }] },
  'work.hammer': { fps: 3.2, frames: [{ near: 'up', tool: 'hammer' }, { near: 'up', tool: 'hammer' }, { near: 'strike', tool: 'hammer', spark: true, bob: 0 }] },
  'work.scan': { fps: 1.6, frames: [{ near: 'hold', far: 'holdFar', tool: 'scan' }, { near: 'hold', far: 'holdFar', tool: 'scan', glint: true }] },
  'work.orchestrate': { fps: 1.1, frames: [{ near: 'point', tool: 'staff' }, { near: 'raise', tool: 'staff' }, { near: 'point', tool: 'staff', breath: 1 }] },
  'sit.work': { fps: 4, frames: [{ legs: 'sit', near: 'type1', far: 'type2' }, { legs: 'sit', near: 'type2', far: 'type1' }] },
  'sit.idle': { fps: 1.2, frames: [{ legs: 'sit', near: 'rest', far: 'rest' }, { legs: 'sit', near: 'rest', far: 'rest', breath: 1 }] },
};
export const FACINGS = ['fr', 'fl', 'br', 'bl'];

// ---- Aliases (C25 and refs 6B/6D, 10A/10B): six authored looks for the three canonical agents. ---------------------
export const ALIASES = {
  'chatgpt:real': { name: 'ChatGPT (Real: the boss)', plan: 'human', parts: ['hair.slick', 'face.stern', 'top.suit'], work: 'orchestrate', tools: {},
    palette: { skin: '#e8b48c', hair: '#2a1d16', top: '#202329', shirt: '#f1f1ec', white: '#f1f1ec', accent: '#10a37f', accent2: '#10a37f', legs: '#202329', boots: '#121316', eye: '#1a1a22', hat: '#202329', metal: '#9aa3ad', glow: '#7fe0ff', cape: '#202329', tool: '#202329' } },
  'claude:real': { name: 'Claude (Real: the builder)', plan: 'human', parts: ['hair.crop', 'face.plain', 'beard.stubble', 'hat.hardhat', 'top.vest'], work: 'hammer', tools: { hammer: 'hammer' },
    palette: { skin: '#e2a57c', hair: '#5a3a22', top: '#ff8a1f', shirt: '#5c6670', white: '#7a5236', accent: '#e8ecef', accent2: '#e8ecef', legs: '#3d5a80', boots: '#5a3a22', eye: '#1a1a22', hat: '#ffcc1f', metal: '#8a939c', glow: '#ffe27a', cape: '#ff8a1f', tool: '#7a5236' } },
  'codex:real': { name: 'Codex (Real: the engineer)', plan: 'human', parts: ['hair.short', 'face.glasses', 'top.jacket'], work: 'scan', tools: { scan: 'tablet' },
    palette: { skin: '#d8a883', hair: '#1c1c22', top: '#2d4f8e', shirt: '#dfe7f2', white: '#dfe7f2', accent: '#5ee1ff', accent2: '#5ee1ff', legs: '#2a3140', boots: '#1d2129', eye: '#141820', hat: '#2d4f8e', metal: '#a9b4c2', glow: '#5ee1ff', cape: '#2d4f8e', tool: '#3a4350' } },
  'chatgpt:fantasy': { name: 'ChatGPT (Fantasy: the King)', plan: 'human', parts: ['cape.back', 'hair.long', 'face.stern', 'beard.long', 'hat.crown', 'top.robe', 'skirt.robe'], work: 'orchestrate', tools: { staff: 'scepter' },
    palette: { skin: '#efc6a2', hair: '#ece6d8', top: '#1f6b3a', shirt: '#1f6b3a', white: '#ece6d8', accent: '#d9b44a', accent2: '#d9b44a', legs: '#173d24', boots: '#3a2a1a', eye: '#1a1a22', hat: '#d9b44a', metal: '#d9b44a', glow: '#fff1a8', cape: '#c8962e', tool: '#d9b44a' } },
  'claude:fantasy': { name: 'Claude (Fantasy: the dwarf artificer)', plan: 'dwarf', parts: ['hair.wild', 'face.plain', 'beard.long', 'top.apron'], work: 'hammer', tools: { hammer: 'hammer' },
    palette: { skin: '#eab28a', hair: '#c4521f', top: '#6a4228', shirt: '#b5552b', white: '#6a4228', accent: '#d9b44a', accent2: '#d9b44a', legs: '#5a3b24', boots: '#3c2a1a', eye: '#1a1a22', hat: '#9aa6b4', metal: '#9aa6b4', glow: '#ffb35a', cape: '#b5552b', tool: '#6a4228' } },
  'codex:fantasy': { name: 'Codex (Fantasy: the cyborg inspector)', plan: 'human', parts: ['hair.crop', 'face.cyborg', 'top.armor'], arm: { R: 'metal' }, work: 'scan', tools: { scan: 'lens' }, asymmetric: true,
    palette: { skin: '#e0b894', hair: '#2b2f38', top: '#2e3138', shirt: '#2e3138', white: '#c8d4e2', accent: '#c9a24a', accent2: '#c9a24a', legs: '#1e2026', boots: '#121418', eye: '#1a1a22', hat: '#2e3138', metal: '#9aa2ab', glow: '#ff2a1a', cape: '#2e3138', tool: '#6fd8ff' } },
};
// The lineup-only generic character (not canonical, never placed in the World): assembled from the same parts to
// prove a character the art has never seen is built by the same system.
export const TEST_LOOK = { name: 'TEST (generic, reference only)', plan: 'human', parts: ['hair.short', 'face.plain', 'hat.cap', 'top.shirt'], work: 'scan', tools: { scan: 'clipboard' }, test: true,
  palette: { skin: '#c99a76', hair: '#3b2d22', top: '#5f8f8a', shirt: '#5f8f8a', white: '#e8e4da', accent: '#e8e4da', accent2: '#e8e4da', legs: '#4a4f58', boots: '#2b2e33', eye: '#1a1a22', hat: '#d06a3a', metal: '#7c8590', glow: '#ffffff', cape: '#5f8f8a', tool: '#7c8590' } };

// Look for an agent in a theme: the authored alias for the three canonical agents; any other agent is composed from
// its definition's appearance (archetype and colours only), by the same parts.
export function lookFor(agentId, themeId, def = null) {
  const key = `${agentId}:${themeId === 'fantasy' ? 'fantasy' : 'real'}`;
  if (ALIASES[key]) return ALIASES[key];
  const th = def?.appearance?.themes?.[themeId] ?? {}, f = th.figure ?? {}, primary = def?.appearance?.palette?.primary;
  const ok = c => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : null);
  const archetype = th.archetype ?? def?.appearance?.archetype;
  return validateLook({ name: def?.name ?? agentId, plan: archetype === 'dwarf' ? 'dwarf' : 'human', parts: ['hair.short', 'face.plain', f.hat === 'crown' ? 'hat.crown' : f.hat ? 'hat.cap' : null, f.robe ? 'top.robe' : 'top.shirt'].filter(Boolean), work: 'scan', tools: { scan: 'clipboard' },
    palette: { ...TEST_LOOK.palette, top: ok(f.shirt) ?? ok(primary) ?? TEST_LOOK.palette.top, shirt: ok(f.shirt) ?? TEST_LOOK.palette.shirt, legs: ok(f.pants) ?? TEST_LOOK.palette.legs, hair: ok(f.hair) ?? TEST_LOOK.palette.hair, skin: ok(f.skin) ?? TEST_LOOK.palette.skin, hat: ok(f.hatColor) ?? TEST_LOOK.palette.hat } });
}
// Appearance can only select known parts, plans, tools and colour literals. Anything else is dropped.
export function validateLook(look) {
  const parts = (look.parts ?? []).filter(p => typeof p === 'string' && PARTS[p]);
  const palette = Object.fromEntries(Object.entries(look.palette ?? {}).filter(([k, v]) => /^[a-z][a-z0-9]{0,15}$/i.test(k) && typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)));
  const tools = Object.fromEntries(Object.entries(look.tools ?? {}).filter(([k, v]) => typeof k === 'string' && TOOLS[v]));
  return { name: String(look.name ?? '').slice(0, 60), plan: BODY_PLANS[look.plan] ? look.plan : 'human', parts, palette, tools, work: ['hammer', 'scan', 'orchestrate'].includes(look.work) ? look.work : 'scan', asymmetric: !!look.asymmetric, arm: look.arm && typeof look.arm === 'object' ? { R: look.arm.R === 'metal' ? 'metal' : undefined } : null, test: !!look.test };
}
// Problems in part and tool data (tests): rows are strings of known codes only.
export function validateParts() {
  const out = [], codes = new Set([...Object.keys(CODES), '.']);
  const check = (m, where) => { if (!m) return; if (!Array.isArray(m.rows) || !m.rows.every(r => typeof r === 'string' && [...r].every(ch => codes.has(ch)))) out.push(where); if (!Number.isInteger(m.ox) || !Number.isInteger(m.oy)) out.push(`${where}: offsets`); };
  for (const [id, p] of Object.entries(PARTS)) for (const v of ['fr', 'br']) { const m = p[v]; if (!m) continue; if (p.side) { check(m.R, `${id}.${v}.R`); check(m.L, `${id}.${v}.L`); } else check(m, `${id}.${v}`); }
  for (const [id, t] of Object.entries(TOOLS)) check(t, `tool ${id}`);
  return out;
}

// ---- Composition. ---------------------------------------------------------------------------------------------------
export const CANVAS = { w: 24, h: 34, footX: 12, footY: 31 }; // feet bottom row at y = footY - 1
const rampCache = new Map();
const colourOf = (look, slot, k) => {
  const base = look.palette[slot] ?? look.palette.top ?? '#888888', key = base;
  if (!rampCache.has(key)) rampCache.set(key, ramp(base));
  return rampCache.get(key)[k];
};
// Which clip and frame an animation state asks for (the state names come from the 5C animation system).
const WORK_STATES = new Set(['type', 'work', 'assemble', 'install', 'dig', 'paint', 'lift', 'measure', 'carry', 'pickup']);
const INSPECT_STATES = new Set(['inspect', 'survey', 'read', 'review', 'test', 'think']);
export function clipFor(look, { state = 'idle', moving = false, posture = null } = {}) {
  if (moving) return 'walk';
  if (posture === 'sit') return WORK_STATES.has(state) || INSPECT_STATES.has(state) ? 'sit.work' : 'sit.idle';
  if (WORK_STATES.has(state) || INSPECT_STATES.has(state) || state === 'talk' || state === 'meeting') return `work.${look.work}`;
  return 'idle';
}
export const frameAt = (clip, seconds) => { const c = CLIPS[clip] ?? CLIPS.idle; return Math.floor(Math.max(0, seconds) * c.fps) % c.frames.length; };
// Facing from a screen heading (radians, y down) or a cardinal dir.
export function facingOf(heading, dir = 'front') {
  if (typeof heading === 'number' && Number.isFinite(heading)) { const dx = Math.cos(heading), dy = Math.sin(heading); return `${dy >= -0.25 ? 'f' : 'b'}${dx >= 0 ? 'r' : 'l'}`; }
  return { front: 'fl', back: 'br', left: 'fl', right: 'fr' }[dir] ?? 'fr';
}

// Draws one mask at an anchor box.
function stamp(buf, look, part, m, box) {
  if (!m) return;
  for (let j = 0; j < m.rows.length; j++) for (let i = 0; i < m.rows[j].length; i++) {
    const ch = m.rows[j][i]; if (ch === '.') continue;
    const [slot, k] = CODES[ch]; const s = slot === 'k' ? part.slot : slot;
    buf.set(box.x + m.ox + i, box.y + m.oy + j, colourOf(look, s, k));
  }
}
// Builds the sprite of one look, facing, clip and frame. Returns { buf, foot: [x, y], top, light: [[x, y, colour]] }.
export function buildSprite(lookIn, facing = 'fr', clip = 'idle', frame = 0) {
  const look = lookIn.validated ? lookIn : { ...validateLook(lookIn), validated: true };
  const plan = BODY_PLANS[look.plan], back = facing[0] === 'b', mirrored = facing[1] === 'l';
  const v = back ? 'br' : 'fr', pose = (CLIPS[clip] ?? CLIPS.idle).frames[frame % (CLIPS[clip] ?? CLIPS.idle).frames.length];
  // Anatomical sides in the right-facing frame: right = far. A mirrored view swaps them first (so after the mirror
  // the machine half is still on the character's right).
  const sideOf = anat => (mirrored ? (anat === 'R' ? 'L' : 'R') : anat);
  const farIs = 'R', buf = new PixelBuffer(CANVAS.w, CANVAS.h), fx = CANVAS.footX, fy = CANVAS.footY;
  const bob = (pose.bob ?? 0), breath = pose.breath ?? 0;
  const P = (x, y) => [fx + x, fy + y];
  const c = (slot, k = 2) => colourOf(look, slot, k);
  const seated = pose.legs === 'sit';
  // Boxes (top-left, in canvas px). Breathing lowers the head and shoulders a pixel; a bob lifts the body.
  const T = plan.torso, Hd = plan.head, L = plan.legs;
  const [tx, ty] = P(T.x0, T.top + bob + breath), [hx, hy] = P(Hd.x0, Hd.top + bob + breath), [lx, ly] = P(L.xs[0], L.top + bob);
  const boxes = { head: { x: hx, y: hy }, torso: { x: tx, y: ty }, legs: { x: lx, y: ly } };
  // Legs: two columns; walking separates them; seated, the thighs go forward and the shins down.
  const legPx = (x0, x1, y0, y1, slot, k) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) buf.set(x, y, c(slot, k)); };
  const legs = () => {
    const bootTop = fy - L.boot, top = fy + L.top + bob;
    L.xs.forEach((x0, i) => {
      const near = i === 1, shadeK = near ? 2 : 1;
      let dx = 0, lift = 0;
      if (pose.legs === 'stepA') { dx = near ? 1 : -1; lift = near ? 0 : 1; }
      if (pose.legs === 'stepB') { dx = near ? -1 : 1; lift = near ? 1 : 0; }
      if (seated) {
        const tx0 = fx + x0 + (near ? 2 : 1), thighY = top;
        legPx(tx0, tx0 + L.w - 1 + 1, thighY, thighY + 1, 'legs', shadeK);
        legPx(tx0 + 2, tx0 + 2 + L.w - 2, thighY + 2, fy - 2, 'legs', shadeK - 1 < 0 ? 0 : shadeK - 1);
        legPx(tx0 + 2, tx0 + 2 + L.w - 1, fy - 1, fy - 1, 'boots', 1);
        return;
      }
      const X = fx + x0 + dx;
      legPx(X, X + L.w - 1, top, bootTop - 1 - lift, 'legs', shadeK);
      legPx(X, X + L.w - 1 + (back ? 0 : 1), bootTop - lift, fy - 1 - lift, 'boots', near ? 2 : 1);
    });
  };
  // Arms: a two-pixel limb from the shoulder to the hand, the hand in skin (or metal for a machine arm).
  const shoulder = near => [near ? tx + T.w : tx - 1 + (back ? 0 : 1), ty + 1];
  const hands = {};
  const arm = (near, poseName) => {
    const [sx, sy] = shoulder(near), [hx2, hy2] = HAND[poseName ?? 'down'] ?? HAND.down;
    const dir = near ? 1 : -1, ex = sx + dir * (hx2 - 1), ey = sy + hy2;
    const anat = near ? (farIs === 'R' ? 'L' : 'R') : farIs, metal = look.arm?.[sideOf(anat)] === 'metal';
    const sleeve = metal ? 'metal' : 'top', k = near ? 2 : 1;
    for (let w = 0; w < plan.arm.w; w++) buf.line(sx + (near ? w : -w), sy, ex + (near ? w : -w), ey - 1, c(sleeve, w === plan.arm.w - 1 ? k - 1 : k));
    buf.set(ex, ey, c(metal ? 'metal' : 'skin', metal ? 3 : 2)); buf.set(ex + dir, ey, c(metal ? 'metal' : 'skin', 1));
    hands[near ? 'near' : 'far'] = [ex, ey];
  };
  const parts = look.parts.map(id => [id, PARTS[id]]).filter(([, p]) => p);
  const draw = layer => { for (const [, p] of parts.filter(([, q]) => q.layer === layer)) { let m = p[v]; if (m && p.side) m = m[sideOf('R') === 'R' ? 'R' : 'L']; stamp(buf, look, p, m, boxes[m?.at ?? 'head']); } };
  const torso = () => {
    for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) buf.set(tx + x, ty + y, c('shirt', x === 0 ? 1 : x === T.w - 1 ? 3 : 2));
    for (let x = 0; x < T.w; x++) buf.set(tx + x, fy + plan.belt + bob, c('legs', 0)); // belt line
    draw('top');
  };
  const head = () => {
    for (let y = 0; y < Hd.h; y++) for (let x = 0; x < Hd.w; x++) {
      if ((y === 0 || y === Hd.h - 1) && (x === 0 || x === Hd.w - 1)) continue;
      buf.set(hx + x, hy + y, c('skin', back ? (x < 2 ? 1 : 2) : x === 0 ? 1 : x === Hd.w - 1 ? 3 : 2));
    }
    if (!back) draw('face');
    else draw('face');
    draw('beard'); draw('hair'); draw('hat');
  };
  const tool = () => {
    const toolId = look.tools[pose.tool]; if (!toolId) return;
    const t = TOOLS[toolId], [hx3, hy3] = hands.near ?? [tx + T.w + 1, ty + 4];
    const tp = { slot: 'tool' };
    for (let j = 0; j < t.rows.length; j++) for (let i = 0; i < t.rows[j].length; i++) {
      const ch = t.rows[j][i]; if (ch === '.') continue;
      const [slot, k] = CODES[ch]; buf.set(hx3 + t.ox + i, hy3 + t.oy + j, colourOf(look, slot === 'k' ? tp.slot : slot === 'white' ? 'tool' : slot, pose.glint && (slot === 'glow') ? 4 : k));
    }
  };
  // Draw order (right-facing frame): cape behind, far arm, legs, skirt, torso, near arm, head, tool. From the back the
  // near arm and the tool go behind the torso.
  if (back) { draw('cape'); }
  else draw('cape');
  arm(false, pose.far);
  if (back) { arm(true, pose.near); tool(); }
  legs(); draw('skirt'); torso();
  if (!back) arm(true, pose.near);
  head();
  if (!back) tool();
  const light = [];
  if (pose.spark && hands.near) light.push([hands.near[0] + 2, hands.near[1] + 1, '#ffd66b']);
  let out = buf.outlined({ dark: 0.22, bottom: 0.16 });
  if (mirrored) { const m = new PixelBuffer(out.w, out.h); m.blit(out, 0, 0, { flip: true }); out = m; }
  const footX = mirrored ? out.w - 1 - (fx + 1) : fx + 1;
  return { buf: out, foot: [footX, fy + 1], top: fy + 1 + Hd.top - 4, light: light.map(([x, y, col]) => [mirrored ? out.w - 1 - (x + 1) : x + 1, y + 1, hex(col)]) };
}

// A cache of sprites per look, facing, clip and frame (sprites are pure functions of those).
const spriteCache = new Map();
export function spriteOf(look, lookKey, facing, clip, frame) {
  const key = `${lookKey}|${facing}|${clip}|${frame}`;
  if (!spriteCache.has(key)) { if (spriteCache.size > 4000) spriteCache.clear(); spriteCache.set(key, buildSprite(look, facing, clip, frame)); }
  return spriteCache.get(key);
}
