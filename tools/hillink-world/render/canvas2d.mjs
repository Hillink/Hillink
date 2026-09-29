// Canvas 2D renderer. Draws scene entities with a replaceable skin (placeholder primitives today,
// sprites later). It receives a frame description; it never reads World state or backends directly.
import { placeholderSkin } from './skin-placeholder.mjs';

export function createCanvasRenderer(canvas, { skin = placeholderSkin } = {}) {
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  return {
    skin,
    resize(width, height, ratio = 1) {
      dpr = ratio; canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    },
    draw(frame) {
      const { camera, entities, time, hoverId, selectedId, effects, signals, reducedMotion, theme, world, layout, activity } = frame;
      const skin = frame.skin ?? this.skin;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      skin.background(ctx, camera, theme);
      ctx.save();
      ctx.translate(camera.width / 2, camera.height / 2);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);
      const [farBelow, nearFrom] = skin.lod ?? [0.45, 0.9];
      const lod = camera.zoom < farBelow ? 'far' : camera.zoom < nearFrom ? 'mid' : 'near';
      // Labels claim screen space per frame so stacked agents don't print names over each other.
      const claimed = [];
      const claimLabel = (x, y, w, h, force) => {
        const r = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
        if (!force && claimed.some(c => r[0] < c[2] && r[2] > c[0] && r[1] < c[3] && r[3] > c[1])) return false;
        claimed.push(r); return true;
      };
      const env = { ctx, time, lod, zoom: camera.zoom, reducedMotion, theme, signals, scene: frame.scene, claimLabel, world, layout, activity, late: [] };
      skin.ground?.(ctx, env);
      for (const e of entities) {
        const draw = skin[e.kind];
        if (draw) draw(e, env, { hovered: e.id === hoverId, selected: e.id === selectedId });
      }
      for (const fx of effects) skin.effect?.(fx, env);
      skin.overlay?.(ctx, env); // particles above the scene
      for (const draw of env.late) draw(); // UI (badges, labels) above everything in the world
      ctx.restore();
    },
  };
}
