// Pass 5H: how an agent is dressed in a theme: { look, parts, archetype? }. One place for Real and Fantasy, driven only by
// the agent's definition (core/agents.mjs), never by its id:
//   Real     the definition's appearance resolved for Real (render/appearance.mjs) plus its named parts;
//   Fantasy  an explicit Fantasy appearance first, else the archetype its role maps to (themes/fantasy/metaphor.mjs).
// `parts` names sprites in render/art/parts.mjs (hair style, overlays); unknown names are dropped.
import { definitionOf } from '../../core/agents.mjs';
import { resolveAppearance, figureLookOf } from '../appearance.mjs';
import { lookFor } from '../looks.mjs';
import { ARCHETYPES, DOMAIN_ARCHETYPE, archetypeId, domainOf } from '../../themes/fantasy/metaphor.mjs';
import { characterParts } from './character.mjs';

export const OVERLAY_ITEMS = new Set(['wings', 'bow', 'bionic-eye', 'armor', 'goblin-ears', 'elf-ears', 'coin-pouch', 'hood-glow', 'cyclops-eye', 'shaggy', 'book', 'satchel', 'hammer', 'regal-glow', 'rune-core', 'quiver', 'apron']);
// A hero's kingdom look: { look (figure data), archetype, overlays, domain }. THEME, derived from the definition only.
export function kingdomLook(agent) {
  const def = definitionOf(agent ?? {}), own = def?.appearance?.themes?.fantasy, dom = domainOf(def);
  const named = r => [...(r?.effects ?? []), ...(r?.equipment ?? []), ...(r?.accessories ?? [])].filter(x => typeof x === 'string' && OVERLAY_ITEMS.has(x));
  if (own && typeof own === 'object') {
    const res = resolveAppearance(def.appearance, 'fantasy'), arch = archetypeId(own.archetype);
    return { look: figureLookOf(res, 'fantasy'), archetype: arch, overlays: [...new Set([...(arch ? ARCHETYPES[arch].overlays : []), ...named(res)])], domain: dom.domain };
  }
  const arch = DOMAIN_ARCHETYPE[dom.domain] ?? 'human', base = def?.appearance ?? {}, accent = typeof base.palette?.primary === 'string' && /^#[0-9a-f]{6}$/i.test(base.palette.primary) ? base.palette.primary : null;
  return { look: { ...ARCHETYPES[arch].figure, ...(accent ? { badge: accent } : {}), package: 'scroll' }, archetype: arch, overlays: [...ARCHETYPES[arch].overlays, ...named(base)], domain: dom.domain };
}

// Real HQ outfits by role domain (THEME data): an agent with no explicit Real look still dresses for its job, in its own
// registered colour (palette.primary), so a finance agent reads as finance and a researcher as a researcher.
export const REAL_OUTFITS = {
  owner: { jacket: '#2a2f3a', sleeve: '#2a2f3a', shirt: '#f2f4f7', tie: 'primary', pants: '#2a2f3a', hair: 'swept' },
  orchestration: { jacket: 'primary', sleeve: 'primary', shirt: '#f2f4f7', pants: '#2a2f3a', hair: 'swept' },
  implementation: { shirt: 'primary', hoodie: true, pants: '#3a3f4a', hair: 'short' },
  qa: { shirt: '#e9edf2', jacket: 'primary', sleeve: 'primary', pants: '#2a313a', glasses: true, badge: '#e8f1ff', hair: 'short' },
  finance: { shirt: '#f2f4f7', jacket: '#1f2f5a', sleeve: '#1f2f5a', tie: 'primary', pants: '#1f2f5a', glasses: true, hair: 'swept' },
  analytics: { shirt: 'primary', pants: '#2b2440', glasses: true, hair: 'curly' },
  outreach: { shirt: 'primary', jacket: '#3a3f4a', sleeve: '#3a3f4a', pants: '#3a3f4a', headset: true, hair: 'bun' },
  security: { shirt: '#56606e', vest: 'primary', pants: '#2a313a', hat: 'cap', hatColor: '#2a313a', hair: 'short' },
  memory: { shirt: 'primary', pants: '#3b3346', glasses: true, hair: 'long' },
  apprentice: { shirt: 'primary', pants: '#2c3340', headset: true, hair: 'spiky' },
  process: { shirt: '#56606e', vest: '#f2b01e', pants: '#2a313a', hat: 'hardhat', hatColor: '#f2f2f2', hair: 'short' },
  general: { shirt: 'primary', pants: '#2c3340', hair: 'short' },
};
const HEX6 = /^#[0-9a-f]{6}$/i;
function realOutfit(def, base) {
  const dom = domainOf(def).domain, o = REAL_OUTFITS[dom] ?? REAL_OUTFITS.general, primary = HEX6.test(def?.appearance?.palette?.primary ?? '') ? def.appearance.palette.primary : base.shirt;
  const look = {}; let hair = null;
  for (const [k, v] of Object.entries(o)) { if (k === 'hair') hair = v; else look[k] = v === 'primary' ? primary : v; }
  return { look: { ...look, ...base, shirt: base.shirt === primary ? look.shirt ?? primary : base.shirt }, hair };
}

export function dressFor(agent, theme = 'real') {
  const def = definitionOf(agent ?? {});
  if (theme === 'fantasy') {
    const K = kingdomLook(agent), res = resolveAppearance(def?.appearance, 'fantasy');
    const arch = K.archetype ? ARCHETYPES[K.archetype] : null;
    return { look: K.look, parts: characterParts({ ...res, hair: res.hair ?? (arch?.hair ? { style: arch.hair } : undefined) }, K.overlays), archetype: K.archetype, domain: K.domain };
  }
  const res = resolveAppearance(def?.appearance, 'real'), look = lookFor('real', agent);
  if (res.figure) return { look, parts: characterParts(res) };
  // No explicit Real figure: dress for the role, keep every explicit choice (colours, items) from the definition.
  const { skin, hair: hairColor, pants, ...rest } = look, outfit = realOutfit(def, rest);
  const parts = characterParts(res);
  return { look: { ...outfit.look, ...(skin ? { skin } : {}), hair: hairColor, pants: HEX6.test(res.palette?.pants ?? '') ? pants : outfit.look.pants ?? pants }, parts: { ...parts, hair: parts.hair ?? outfit.hair } };
}

// Ambient people and theme workers (never agents): a deterministic look from their index only, over the skin's NPC
// colours. Real: office clothes and varied hair. Fantasy: townsfolk (hoods, caps, aprons).
const NPC_HAIR = ['short', 'bun', 'curly', 'swept', 'long', 'spiky', 'bald', 'short'];
const NPC_REAL = [{}, { jacket: '#3a4250', sleeve: '#3a4250' }, { hoodie: true }, { glasses: true }, { vest: '#6b7788' }, {}, { jacket: '#5a4a3e', sleeve: '#5a4a3e' }, { tie: '#b3262c' }];
const NPC_FANTASY = [{ hat: 'hood', hatColor: '#6b3a2a' }, { apron: true }, { hat: 'cap', hatColor: '#4f6b3a' }, {}, { hat: 'hood', hatColor: '#2f4f6b' }, { apron: true, beard: '#8a6a44' }];
export function npcLook(index, theme, base = {}) {
  const i = Math.abs(Math.trunc(index ?? 0));
  const extra = theme === 'fantasy' ? NPC_FANTASY[i % NPC_FANTASY.length] : NPC_REAL[i % NPC_REAL.length];
  const { apron, ...look } = extra;
  return { look: { ...base, ...look }, parts: characterParts({ hair: { style: NPC_HAIR[(i * 5 + 3) % NPC_HAIR.length] } }, apron ? ['apron'] : []) };
}
