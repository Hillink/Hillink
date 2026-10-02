// Pass 5C: rigs, the last stage of simulation state -> animation intent -> rendered animation (engine/animation.mjs).
// A rig turns what a character means (its intent and variant, and the body clip the controller resolved) into what
// one visual identity draws: the clip drawFigure plays and the props in its hands. It never reads World state, so a
// Fantasy rig, a sprite sheet or a 3D character can replace this one without touching behaviour: Real's builder
// swings a hammer; Fantasy's swings a mallet, digs with a spade and works with a rune staff, for the same canonical
// construction stage.
const IDENTITY = { clips: {}, props: {} };
export const RIGS = {
  real: IDENTITY,
  blueprint: IDENTITY,
  fantasy: {
    clips: {},
    props: { hammer: 'mallet', shovel: 'spade', roller: 'brush', wrench: 'staff', tablet: 'scroll' },
  },
};
export function rigFor(skinId) { return RIGS[skinId] ?? IDENTITY; }
// What to draw for a character: { clip, props } for drawFigure (clip defaults to the resolved body clip).
export function dress(rig, anim) {
  const state = anim?.state ?? 'idle', over = rig.clips[`${anim?.intent}:${anim?.variant}`] ?? rig.clips[anim?.intent] ?? null;
  return { clip: over?.[state] ?? state, prev: anim?.prev ? over?.[anim.prev] ?? anim.prev : null, props: rig.props };
}
