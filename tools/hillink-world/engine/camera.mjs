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
  fitZoom(rect = this.bounds, padding = 40) {
    return Math.min((this.width - padding * 2) / rect.w, (this.height - padding * 2) / rect.h);
  }
  clamp() {
    // The center may not leave the world bounds; at low zoom the world stays centered.
    const b = this.bounds, halfW = this.width / this.zoom / 2, halfH = this.height / this.zoom / 2;
    this.x = halfW * 2 >= b.w ? b.x + b.w / 2 : Math.min(b.x + b.w - halfW, Math.max(b.x + halfW, this.x));
    this.y = halfH * 2 >= b.h ? b.y + b.h / 2 : Math.min(b.y + b.h - halfH, Math.max(b.y + halfH, this.y));
  }
  animateTo(target, duration = 700, now = performance.now()) {
    const to = { x: target.x ?? this.x, y: target.y ?? this.y, zoom: Math.min(this.maxZoom, Math.max(this.minZoom, target.zoom ?? this.zoom)) };
    if (duration <= 0) { Object.assign(this, to); this.tween = null; this.clamp(); return; }
    this.tween = { from: { x: this.x, y: this.y, zoom: this.zoom }, to, start: now, duration };
  }
  focusRect(rect, { padding = 80, maxZoom = 1.6, duration } = {}) {
    const zoom = Math.min(maxZoom, this.fitZoom(rect, padding));
    this.animateTo({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, zoom }, duration);
  }
  focusPoint(x, y, { zoom = 1.6, duration } = {}) { this.animateTo({ x, y, zoom }, duration); }
  overview(opts) { this.focusRect(this.bounds, { padding: 30, maxZoom: 10, ...opts }); }
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
