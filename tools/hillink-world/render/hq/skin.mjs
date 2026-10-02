// Art 'hq' (?art=hq): the HQ diorama look over the canonical World (Kyle chose it 2026-10-02: one style, drawn in code).
// The World is seen through the diamond projection (world/generated-layout.mjs, projection 'diamond') and drawn by the
// art5d skin's architecture, furniture and characters; this file adds the diorama around it:
//   sky.mjs    a sky by time of day (gradient, sun and moon, stars, clouds, far floating rocks);
//   island.mjs the settlement as a floating island: the ground is clipped to it and a rock underside hangs below;
//   light.mjs  day, dusk and night: a darkness layer with light cut out where the World is really lit (rooms, agents).
// Nothing here invents state: rooms are lit because they exist, agents glow where they stand.
import { createArtSkin } from '../art5d/skin.mjs';
import { createSky } from './sky.mjs';
import { createIsland, islandRect } from './island.mjs';
import { createLighting, lightsOf } from './light.mjs';
import { dayPhase } from './time.mjs';

export { setHqLight, hqLight } from './time.mjs';

export function createHqSkin(layout, skinId = 'real') {
  const base = createArtSkin(layout, skinId, { region: islandRect(layout) });
  const sky = createSky(), island = createIsland(layout), lighting = createLighting();
  return {
    ...base,
    id: skinId, art: 'hq',
    background(ctx, camera) {
      const t = performance.now() / 1000, sun = dayPhase();
      sky.draw(ctx, camera.width, camera.height, t, sun, camera);
    },
    frame(ctx, env, entities) {
      const sun = dayPhase(), T = env.reducedMotion ? 0 : env.time / 1000;
      island.underside(ctx, sun, T);
      base.frame(ctx, env, entities);
      island.rim(ctx, sun);
      lighting.draw(ctx, sun, lightsOf(layout, env, T), T, island);
    },
  };
}
