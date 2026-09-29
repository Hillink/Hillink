// Camera: world <-> screen transform, pan, zoom around a point, clamping, and smooth focus transitions.
// Commands like "show me Codex" or "show the whole company" become focusRect/overview calls.
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Camera {
  constructor({ bounds, minZoom = 0.2, maxZoom = 3 }) {
    Object.assign(this, { bounds, minZoom, maxZoom, x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2, zoom: 1, width: 1, height: 1, tween: null });
  }
  resize(width, height) { this.width = Math.max(1, width); this.height = Math.max(1, height); this.clamp(); }
  worldToScreen(wx, wy) { return [(wx - this.x) * this.zoom + this.width / 2, (wy - this.y) * this.zoom + this.height / 2]; }
  screenToWorld(sx, sy) { return [(sx - this.width / 2) / this.zoom + this.x, (sy - this.height / 2) / this.zoom + this.y]; }
  viewRect(margin = 0) {
    const w = this.width / this.zoom, h = this.height / this.zoom;
    return { x: this.x - w / 2 - margin, y: this.y - h / 2 - margin, w: w + margin * 2, h: h + margin * 2 };
  }
  pan(dxScreen, dyScreen) { this.tween = null; this.x -= dxScreen / this.zoom; this.y -= dyScreen / this.zoom; this.clamp(); }
  zoomAt(factor, sx = this.width / 2, sy = this.height / 2) {
    this.tween = null;
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.zoom = Math.min(this.maxZoom, Math.max(this.fitZoom() * 0.9, Math.max(this.minZoom, this.zoom * factor)));
    // Keep the world point under the cursor fixed.
    this.x = wx - (sx - this.width / 2) / this.zoom;
    this.y = wy - (sy - this.height / 2) / this.zoom;
    this.clamp();
  }
  // Screen-space insets (px) covered by fixed HUD; focus and clamping use the free area between them.
  insets = { top: 0, right: 0, bottom: 0, left: 0 };
  fitZoom(rect = this.bounds, padding = 40) {
    const i = this.insets;
    return Math.min((this.width - i.left - i.right - padding * 2) / rect.w, (this.height - i.top - i.bottom - padding * 2) / rect.h);
  }
  // World point that puts (wx, wy) at the center of the free area at zoom z.
  centerFor(wx, wy, z = this.zoom) { const i = this.insets; return { x: wx - (i.left - i.right) / (2 * z), y: wy - (i.top - i.bottom) / (2 * z) }; }
  clamp() {
    // The world may scroll until its edge meets the HUD inset, never past it; smaller worlds center in the free area.
    const b = this.bounds, z = this.zoom, i = this.insets, halfW = this.width / z / 2, halfH = this.height / z / 2;
    const axis = (v, lo, size, half, a, c) => {
      const min = lo + half - a / z, max = lo + size - half + c / z;
      return min > max ? lo + size / 2 - (a - c) / (2 * z) : Math.min(max, Math.max(min, v));
    };
    this.x = axis(this.x, b.x, b.w, halfW, i.left, i.right);
    this.y = axis(this.y, b.y, b.h, halfH, i.top, i.bottom);
  }
  animateTo(target, duration = 700, now = performance.now()) {
    const to = { x: target.x ?? this.x, y: target.y ?? this.y, zoom: Math.min(this.maxZoom, Math.max(this.minZoom, target.zoom ?? this.zoom)) };
    if (duration <= 0) { Object.assign(this, to); this.tween = null; this.clamp(); return; }
    this.tween = { from: { x: this.x, y: this.y, zoom: this.zoom }, to, start: now, duration };
  }
  focusRect(rect, { padding = 80, maxZoom = 1.6, duration } = {}) {
    const zoom = Math.max(this.minZoom, Math.min(maxZoom, this.fitZoom(rect, padding)));
    this.animateTo({ ...this.centerFor(rect.x + rect.w / 2, rect.y + rect.h / 2, zoom), zoom }, duration);
  }
  focusPoint(x, y, { zoom = 1.6, duration } = {}) { const z = Math.min(this.maxZoom, Math.max(this.minZoom, zoom)); this.animateTo({ ...this.centerFor(x, y, z), zoom: z }, duration); }
  // The overview frames the home rect (the building) when the theme has one, else the whole world.
  overview(opts) { this.focusRect(this.home ?? this.bounds, { padding: 24, maxZoom: 10, ...opts }); }
  // Advances an active transition; returns true while moving.
  step(now) {
    if (!this.tween) return false;
    const { from, to, start, duration } = this.tween;
    const t = Math.min(1, (now - start) / duration), k = ease(t);
    // Interpolate zoom geometrically so zooming feels even.
    this.zoom = from.zoom * Math.pow(to.zoom / from.zoom, k);
    this.x = from.x + (to.x - from.x) * k; this.y = from.y + (to.y - from.y) * k;
    if (t >= 1) { this.tween = null; this.clamp(); }
    return this.tween !== null;
  }
  toJSON() { return { x: this.x, y: this.y, zoom: this.zoom }; }
}
