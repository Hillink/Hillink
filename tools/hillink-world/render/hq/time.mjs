// Time of day for the HQ look. 'auto' follows the viewer's clock (6:00 sunrise, 12:00 noon, 18:00 sunset, 0:00
// midnight); 'day', 'dusk' and 'night' pin it (?light=day|dusk|night). Day and night are a parameter of the look only:
// they change no World state.
export const LIGHT_MODES = ['auto', 'day', 'dusk', 'night'];
const PINNED = { day: 0.25, dusk: 0.485, night: 0.75 };
let mode = 'auto';
export function setHqLight(m) { mode = LIGHT_MODES.includes(m) ? m : 'auto'; }
export const hqLight = () => mode;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// phase 0..1 (0 sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight); sun = sin(phase·2π); night and dusk weights 0..1.
export function phaseAt(phase) {
  const sun = Math.sin(phase * Math.PI * 2);
  return { phase, sun, night: 1 - sstep(-0.18, 0.22, sun), dusk: clamp(1 - Math.abs(sun - 0.02) / 0.3, 0, 1) };
}
export function dayPhase(now = new Date()) {
  if (PINNED[mode] !== undefined) return phaseAt(PINNED[mode]);
  const h = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  return phaseAt((((h - 6) / 24) % 1 + 1) % 1);
}
