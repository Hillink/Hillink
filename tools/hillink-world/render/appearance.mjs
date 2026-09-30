// Pass 5E: appearance as data. One canonical agent, any number of representations: an appearance definition has a
// theme-neutral base and per-theme overrides, and never duplicates the agent's identity (it lives inside the agent's
// definition, core/agents.mjs). This is the contract a future character creator or art pipeline fills in; nothing
// here generates art.
//
// Appearance definition (every field optional):
//   archetype      species or archetype ("human", "dwarf", "cyborg", "golem", ...): what the character is
//   rig            rig profile id (RIG_PROFILES): the body and animation set that can draw it
//   body           { type?, scale?, width?, headScale? }: proportions within the rig
//   palette        { primary?, secondary?, skin?, hair?, shirt?, pants?, accent? }: colours
//   hair, face     { style?, color? }, { features?[] }
//   clothing, accessories, equipment, effects   lists of named items (["glasses", "headset", "hardhat", "hammer"])
//   animationSet   named animation set within the rig (defaults to the rig's)
//   sprite         { sheet?, directions?, frame? }: for sprite-based rigs (directional views through depth)
//   figure         the exact parameters of today's procedural figure renderers (render/figure.mjs, art5d/figure.mjs)
//   themes         { <themeId>: { ...any of the above } }: per-theme overrides, merged over the base
//
// Resolution order for a theme: base, then themes[theme]; a theme with no override uses the base, and the Blueprint
// debug view uses the Real one.

const THEME_ALIAS = { blueprint: 'real' };
export function resolveAppearance(appearance, themeId = 'real') {
  const a = appearance ?? {}, t = THEME_ALIAS[themeId] ?? themeId, over = a.themes?.[t] ?? {};
  const { themes, ...base } = a;
  return { ...base, ...over, palette: { ...(base.palette ?? {}), ...(over.palette ?? {}) }, body: { ...(base.body ?? {}), ...(over.body ?? {}) }, theme: t };
}

// Rig profiles: the body plans the World can animate. Only the humanoid is drawn today; every other planned body
// (dwarf and goblin proportions are humanoid variants; flyers, golems, giants, creatures and vehicles are not) falls back
// to the humanoid with its declared height, so an agent defined with a future rig still appears and behaves, and the
// fallback is visible in the data (`fallbackFrom`). A new rig registers here with its own drawer and clip set.
export const RIG_PROFILES = {
  humanoid: { id: 'humanoid', body: 'figure', heightScale: 1, clips: 'humanoid', locomotion: 'walk', seats: true, carries: true },
};
export function defineRig(id, profile) { RIG_PROFILES[id] = { id, heightScale: 1, clips: 'humanoid', locomotion: 'walk', seats: true, carries: true, ...profile }; return RIG_PROFILES[id]; }
export function rigProfileOf(resolved) {
  const id = resolved?.rig ?? 'humanoid', p = RIG_PROFILES[id];
  if (p) return p;
  const h = Number(resolved?.body?.heightScale);
  return { ...RIG_PROFILES.humanoid, heightScale: Number.isFinite(h) && h > 0.3 && h < 3 ? h : 1, fallbackFrom: id };
}

// What today's procedural figure renderers take (their `look`). A definition that carries `figure` gets exactly that;
// any other is built from the generic fields, so a new agent needs no renderer change and no code keyed by its id.
const HAT = { hardhat: 'hardhat', cap: 'cap', helmet: 'helmet', crown: 'crown', hood: 'hood', wizard: 'wizard' };
const TRUE_ITEMS = ['glasses', 'headset', 'hoodie', 'goggles', 'antenna', 'visor', 'robe', 'bald', 'horns'];
const valid = c => (typeof c === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(c) ? c : null);
export function figureLookOf(resolved, themeId = resolved?.theme ?? 'real') {
  const fantasy = (THEME_ALIAS[themeId] ?? themeId) === 'fantasy', pkg = fantasy ? 'scroll' : 'box';
  if (resolved?.figure && typeof resolved.figure === 'object') return { package: pkg, ...resolved.figure };
  const p = resolved?.palette ?? {}, items = new Set([...(resolved?.clothing ?? []), ...(resolved?.accessories ?? []), ...(resolved?.equipment ?? [])].map(String));
  const primary = valid(p.shirt) ?? valid(p.primary) ?? valid(resolved?.color) ?? '#6b7a90';
  const look = { shirt: primary, pants: valid(p.pants) ?? '#2c3340', hair: valid(p.hair) ?? valid(resolved?.hair?.color) ?? '#3b2a20', package: pkg };
  if (valid(p.skin)) look.skin = valid(p.skin);
  if (valid(p.secondary)) look.jacket = valid(p.secondary);
  for (const k of TRUE_ITEMS) if (items.has(k)) look[k] = true;
  for (const k of Object.keys(HAT)) if (items.has(k)) { look.hat = HAT[k]; if (valid(p.accent)) look.hatColor = valid(p.accent); }
  if (items.has('vest')) look.vest = valid(p.accent) ?? '#f2b01e';
  if (items.has('tie')) look.tie = valid(p.accent) ?? '#7c4dff';
  if (items.has('cape')) look.cape = valid(p.accent) ?? '#7c4dff';
  if (items.has('beard')) look.beard = look.hair;
  const b = resolved?.body ?? {};
  for (const [k, lo, hi] of [['scale', 0.6, 1.4], ['width', 0.7, 1.5], ['headScale', 0.8, 1.3]]) { const v = Number(b[k]); if (Number.isFinite(v) && v >= lo && v <= hi) look[k === 'width' ? 'wide' : k] = v; }
  return look;
}
