// Pass 5C: the environmental animation layer. Secondary motion that keeps the World alive when no character moves:
// wind in the trees (with gusts that roll across the map), flags, drifting cloud shadows, and construction machinery.
// Pure functions of time and a seed, so they cost nothing to "simulate", never drift between frames or reloads, and
// are evaluated only for what is on screen (the renderer culls first). Nothing here reads World state, with one
// exception that is a picture of truth, not a new fact: machinery at a construction site moves only while
// buildersWork(project) says HQ has the build under way (procgen/construction.mjs); stopped sites stand still.
import { hash } from './ambience.mjs';
import { buildersWork } from '../procgen/construction.mjs';

// Wind at a place (x, z in plan units): a steady sway plus gusts that travel across the map. -1..1.
export function wind(t, x = 0, z = 0) {
  const gust = Math.max(0, Math.sin(t * 0.23 - x * 0.0021 - z * 0.0013)) ** 3; // a front of wind moving across
  return Math.sin(t * 1.1 + x * 0.013 + z * 0.007) * (0.35 + 0.65 * gust) + Math.sin(t * 2.7 + x * 0.05) * 0.12 * gust;
}
// A flag's wave: offset (in cloth widths) of point k (0 at the pole .. 1 at the fly end).
export function flutter(t, k, seed = 0) {
  const w = 0.5 + 0.5 * Math.max(0, wind(t, seed * 97, 0));
  return Math.sin(t * 6 - k * 5 + seed) * 0.08 * k * (0.4 + w);
}
// Cloud shadows drifting over the ground within a box (plan units). Few, large, faint.
export function cloudShadows(t, box, n = 5) {
  const w = box.x1 - box.x0, dz = box.z1 - box.z0, out = [];
  for (let i = 0; i < n; i++) {
    const speed = 9 + hash(i * 3.3) * 7, span = w + 900;
    const x = box.x0 - 450 + ((t * speed + hash(i * 7.1) * span) % span), z = box.z0 + hash(i * 5.7) * dz;
    out.push({ x, z, rx: 180 + hash(i * 2.1) * 220, rz: 90 + hash(i * 4.9) * 110, alpha: 0.05 + hash(i * 8.3) * 0.04 });
  }
  return out;
}
// Machinery on a construction site: its motion phase, or null when it must stand still (the build is not under way).
export function siteMachinery(t, project) {
  if (!project || !buildersWork(project)) return { active: false, jib: 0.6, hook: 0, drum: 0 };
  return { active: true, jib: 0.6 + Math.sin(t * 0.21) * 0.9, hook: (Math.sin(t * 0.5) + 1) / 2, drum: t * 2.4 };
}
