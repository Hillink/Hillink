// Pass 5A generator inspector: loads the persisted canonical world from /api/site and draws it with the plan-view
// renderer in either theme. The camera only changes the SVG viewBox (world metres); zoom limits and focus frames
// come from procgen/camera.mjs. Nothing here writes to the world.
import { renderSvg } from './procgen/svg.mjs';
import { frameFor, zoomLimits } from './procgen/camera.mjs';
import { represent, capabilityLook } from './procgen/themes.mjs';
import { summary } from './procgen/world.mjs';

const view = document.getElementById('view'), info = document.getElementById('info'), focus = document.getElementById('focus');
let world = null, theme = 'real', cam = null, showNav = false;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const viewport = () => ({ w: view.clientWidth || 800, h: view.clientHeight || 600 });

function frameTo(target) {
  const r = frameFor(world, target); if (!r) return;
  const vp = viewport(), aspect = vp.w / vp.h;
  const w = Math.max(r.w, r.h * aspect), h = w / aspect;
  cam = { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h };
  draw();
}
function zoomBy(k, about = null) {
  const vp = viewport(), { min, max } = zoomLimits(world, vp);
  const ppm = Math.max(min, Math.min(max, (vp.w / cam.w) * k)), w = vp.w / ppm, h = vp.h / ppm;
  const c = about ?? { x: cam.x + cam.w / 2, y: cam.y + cam.h / 2 }, fx = (c.x - cam.x) / cam.w, fy = (c.y - cam.y) / cam.h;
  cam = { x: c.x - fx * w, y: c.y - fy * h, w, h };
  draw();
}
function draw() {
  view.innerHTML = renderSvg(world, { theme, frame: cam, width: viewport().w, nav: showNav, labels: true });
  const svg = view.querySelector('svg'); svg.removeAttribute('width'); svg.removeAttribute('height'); svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
}
function panel() {
  const s = summary(world), rep = represent(world, theme);
  const byId = new Map(rep.items.map(i => [`${i.primitive}:${i.canonicalId}`, i]));
  info.innerHTML = `<h2>${esc(rep.name)}</h2>
    <table><tr><td>Seed</td><td>${esc(s.seed)}</td></tr><tr><td>Fingerprint</td><td><code>${esc(s.fingerprint.slice(0, 16))}…</code></td></tr>
    <tr><td>Map</td><td>${s.mapMetres} × ${s.mapMetres} m, ${s.developedShare}% developed</td></tr>
    <tr><td>Land</td><td>${s.districts} district, ${s.parcels.developed}/${s.parcels.total} parcels used</td></tr>
    <tr><td>Structures</td><td>${s.buildings.map(b => `${esc(byId.get(`building:${b.id}`)?.label ?? b.id)} (${esc(b.footprint)})`).join('<br>')}</td></tr>
    <tr><td>Scenery anchors</td><td>${s.environmentAnchors}</td></tr></table>
    <h2>Capabilities</h2><table>${Object.values(world.capabilities).map(c => `<tr><td>${esc(c.id)}</td><td>${esc(capabilityLook(theme, c.spec).label)}<br><span class="muted">${esc(c.placement?.spaceId ?? '')}, ${esc(c.status)}</span></td></tr>`).join('')}</table>`;
}
function fillFocus() {
  const opts = [['', 'Focus…'], ...Object.values(world.buildings).map(b => [b.id, `Building ${b.id}`]), ...Object.values(world.spaces).filter(s => s.primitive === 'room' || s.primitive === 'outdoor-facility').map(s => [s.id, `Room ${s.id}${s.capabilities.length ? ` (${s.capabilities.join(', ')})` : ''}`])];
  focus.innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
}

document.querySelectorAll('[data-theme]').forEach(b => b.addEventListener('click', () => { theme = b.dataset.theme; document.querySelectorAll('[data-theme]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); panel(); }));
document.querySelectorAll('[data-frame]').forEach(b => b.addEventListener('click', () => frameTo(b.dataset.frame)));
focus.addEventListener('change', () => { if (focus.value) frameTo(focus.value); });
document.getElementById('nav').addEventListener('change', e => { showNav = e.target.checked; draw(); });
document.getElementById('zoom-in').addEventListener('click', () => zoomBy(1.5));
document.getElementById('zoom-out').addEventListener('click', () => zoomBy(1 / 1.5));
view.addEventListener('wheel', e => { e.preventDefault(); const r = view.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2, { x: cam.x + ((e.clientX - r.left) / r.width) * cam.w, y: cam.y + ((e.clientY - r.top) / r.height) * cam.h }); }, { passive: false });
let drag = null;
view.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, cam: { ...cam } }; view.setPointerCapture(e.pointerId); });
view.addEventListener('pointermove', e => { if (!drag) return; const k = cam.w / view.clientWidth; cam = { ...drag.cam, x: drag.cam.x - (e.clientX - drag.x) * k, y: drag.cam.y - (e.clientY - drag.y) * k }; draw(); });
view.addEventListener('pointerup', () => { drag = null; });
window.addEventListener('resize', () => cam && draw());

const res = await fetch('/api/site', { headers: { accept: 'application/json' } });
if (!res.ok) info.textContent = `The procedural world is not available (${res.status}).`;
else { world = (await res.json()).world; fillFocus(); panel(); frameTo('settlement'); }
