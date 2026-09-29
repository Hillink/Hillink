// Hillink World app: wires source -> store -> view -> renderer, plus camera input, themes and overlays.
import { WorldStore, emptyWorld } from './core/state.mjs';
import { Camera } from './engine/camera.mjs';
import { Scene } from './engine/scene.mjs';
import { Effects, stepPath } from './engine/motion.mjs';
import { IsoWorldView, actionText, PRODUCTIVE_STATES } from './engine/iso-view.mjs';
import { statusLine } from './render/iso-skin.mjs';
import { jobOf, lastJobOf, issuesFor } from './core/job.mjs';
import { createCanvasRenderer } from './render/canvas2d.mjs';
import { loadTheme, THEME_ORDER, THEME_NAMES } from './themes/index.mjs';
import { Simulator, SCENARIOS, SIM_PASS_STEPS } from './sim/simulator.mjs';
import { STAGE_LABEL } from './core/construction.mjs';
import { hoverText, inspectHTML } from './ui/inspect.mjs';
import { summarize, feedHTML, attentionHTML, rosterHTML, paintFaces } from './ui/hud.mjs';
import { connectHq, hqAvailable } from './adapters/hq-client.mjs';

const $ = id => document.getElementById(id);
const storage = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Persistence is a convenience. */ } },
};
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const params = new URLSearchParams(location.search);
// Source: live HQ when it answers (default), or the dev simulator. `?source=sim` forces the simulator.
const requested = params.get('source') ?? 'auto';
let mode = 'sim';

// World state starts empty; boot fills it from HQ (backend truth) or from the saved simulation.
const store = new WorldStore(emptyWorld());
const effects = new Effects();
const camera = new Camera({ bounds: { x: 0, y: 0, w: 1, h: 1 } });
const canvas = $('world'), renderer = createCanvasRenderer(canvas);
let theme, scene, view;
let hover = null, selected = null, follow = null, lastFrame = performance.now(), running = false;

// Themes: same World state, different layout and art. Switching rebuilds only the view.
function applyTheme(id) {
  theme = loadTheme(THEME_ORDER.includes(id) ? id : 'real');
  const places = view?.places ?? {}; // Semantic places (room + station ids) carry across themes.
  scene = new Scene(); view = new IsoWorldView(scene, effects, theme.layout, theme.scenery); view.places = places;
  Object.assign(camera, { bounds: theme.layout.bounds, minZoom: theme.camera.minZoom, maxZoom: theme.camera.maxZoom });
  view.sync(store.world, new Set(['*']), performance.now());
  // Agents start at their stations instead of walking in from the entrance.
  for (const e of scene.entities.values()) if (e.kind === 'agent') { const p = e.path?.at(-1); if (p) { e.x = p[0]; e.y = p[1]; e.path = []; e.moving = false; scene.moved(e); } }
  view.step(0, performance.now(), { instant: true }, stepPath);
  hover = null; select(null); cameraTouched = false;
  const cam = storage.get(`hlw:camera:${theme.id}`);
  if (cam && Number.isFinite(cam.zoom)) camera.animateTo(cam, 0); else camera.overview({ duration: 0 });
  storage.set('hlw:theme', theme.id);
  document.documentElement.dataset.theme = theme.id;
  for (const b of $('themes').children) b.setAttribute('aria-checked', String(b.dataset.theme === theme.id));
  renderNav(); renderHud(); invalidate();
}
$('themes').innerHTML = THEME_ORDER.map(id => `<button role="radio" data-theme="${id}">${THEME_NAMES[id]}</button>`).join('');
$('themes').addEventListener('click', e => { const id = e.target.closest('[data-theme]')?.dataset.theme; if (id && id !== theme.id) applyTheme(id); });

// The header and roster are fixed over the canvas; the camera frames the world between them.
let cameraTouched = false;
function updateInsets() {
  const roster = $('roster'), bottom = roster.childElementCount ? roster.offsetHeight + 16 : 0, top = 50;
  if (camera.insets.bottom === bottom && camera.insets.top === top) return;
  camera.insets = { top, right: 0, bottom, left: 0 };
  if (cameraTouched || storage.get(`hlw:camera:${theme?.id}`)) camera.clamp(); else camera.overview({ duration: 0 });
  invalidate();
}
function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  camera.resize(r.width, r.height); updateInsets(); renderer.resize(r.width, r.height, Math.min(2, devicePixelRatio || 1)); invalidate();
}
new ResizeObserver(resize).observe(canvas.parentElement);

store.subscribe((changed, world) => {
  view.sync(world, changed, performance.now());
  if (selected) showInspect(selected);
  $('empty').hidden = Object.keys(world.agents).length > 0;
  if (changed.has('*') || [...changed].some(k => k.startsWith('agent:'))) renderNav();
  renderHud();
  invalidate();
});

// Render loop: runs only while something changes or animates; ambient animation is throttled; paused when hidden.
function invalidate() { if (!running && !document.hidden && view) { running = true; requestAnimationFrame(frame); } }
function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
  store.flush();
  const instant = reducedMotion.matches;
  const moving = view.step(dt, now, { instant }, stepPath);
  if (follow) { const e = scene.get(follow); if (e && !camera.tween) { const c = camera.centerFor(e.x, e.y - e.h / 2); camera.x += (c.x - camera.x) * 0.12; camera.y += (c.y - camera.y) * 0.12; camera.clamp(); } }
  const cameraMoving = camera.step(now);
  const fx = effects.active(now);
  // Art themes always have ambient life (water, machinery, staff); the blueprint only animates its agents.
  const ambient = !instant; // the building always has quiet ambient life (street, lights, idle breathing)
  renderer.draw({ camera, scene, skin: theme.skin, layout: theme.layout, world: store.world, entities: scene.query(camera.viewRect(80)), time: now, hoverId: hover?.id, selectedId: selected?.id, effects: fx, signals: view.roomSignals, activity: view.activity, reducedMotion: instant, theme: theme.palette, modeLabel: $('mode').textContent });
  if (document.hidden) { running = false; return; }
  if (moving || cameraMoving || fx.length || follow || store.pending.length) requestAnimationFrame(frame);
  else if (ambient) setTimeout(() => requestAnimationFrame(frame), theme.id === 'blueprint' ? 50 : 28); // ~30 fps ambience (~20 on the blueprint)
  else running = false;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { lastFrame = performance.now(); invalidate(); } });
setInterval(() => { if (!document.hidden) store.flush(); }, 250); // flush events even when nothing animates

// Input: drag to pan, wheel/pinch to zoom, click to select, keyboard for navigation.
const pointers = new Map(); let dragMoved = 0, pinchDist = null;
const pickSlop = () => 6 / camera.zoom;
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.offsetX, e.offsetY]); dragMoved = 0; });
canvas.addEventListener('pointermove', e => {
  const prev = pointers.get(e.pointerId);
  if (prev) {
    if (pointers.size === 2) {
      pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
      const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinchDist) camera.zoomAt(d / pinchDist, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      pinchDist = d; dragMoved += 10;
    } else {
      camera.pan(e.offsetX - prev[0], e.offsetY - prev[1]); dragMoved += Math.abs(e.offsetX - prev[0]) + Math.abs(e.offsetY - prev[1]);
      pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
      if (dragMoved > 4) follow = null;
    }
    savePrefs(); invalidate(); return;
  }
  const [wx, wy] = camera.screenToWorld(e.offsetX, e.offsetY);
  const hit = scene.pick(wx, wy, pickSlop());
  if (hit?.id !== hover?.id) { hover = hit; canvas.style.cursor = hit ? 'pointer' : 'grab'; invalidate(); }
  const tip = $('tooltip');
  const text = hit ? hoverText(hit.ref.type === 'room' ? { ...hit.ref, name: hit.location.name } : hit.ref, store.world, { status: hit.kind === 'agent' ? statusLine(hit, store.world, theme.layout) : undefined }) : '';
  tip.hidden = !text; tip.textContent = text; tip.style.transform = `translate(${e.offsetX + 14}px, ${e.offsetY + 14}px)`;
});
canvas.addEventListener('pointerup', e => {
  pointers.delete(e.pointerId); if (pointers.size < 2) pinchDist = null;
  if (dragMoved > 4) return;
  const [wx, wy] = camera.screenToWorld(e.offsetX, e.offsetY);
  select(scene.pick(wx, wy, pickSlop()));
});
canvas.addEventListener('pointerleave', () => { $('tooltip').hidden = true; if (hover) { hover = null; invalidate(); } });
canvas.addEventListener('wheel', e => { e.preventDefault(); camera.zoomAt(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY); savePrefs(); invalidate(); }, { passive: false });
addEventListener('keydown', e => {
  if (e.target.closest('input,textarea,select')) return;
  const step = 80;
  if (e.key === 'h' || e.key === 'H') { document.body.classList.toggle('ui-hidden'); return; } // hide overlays: the world on its own
  const actions = { ArrowLeft: () => camera.pan(step, 0), ArrowRight: () => camera.pan(-step, 0), ArrowUp: () => camera.pan(0, step), ArrowDown: () => camera.pan(0, -step), '+': () => camera.zoomAt(1.2), '=': () => camera.zoomAt(1.2), '-': () => camera.zoomAt(1 / 1.2), Escape: () => { select(null); follow = null; camera.overview(); } };
  if (actions[e.key]) { e.preventDefault(); actions[e.key](); savePrefs(); invalidate(); }
});

function select(entity) {
  selected = entity; follow = null;
  if (entity) showInspect(entity); else $('inspect').hidden = true;
  $('side').hidden = !!entity;
  invalidate();
}
function showInspect(entity) {
  const panel = $('inspect'), current = scene.get(entity.id);
  if (!current) {
    if (entity.ref?.type === 'meeting') return showInspectRef(entity.ref, null); // ended meetings stay readable
    panel.hidden = true; selected = null; $('side').hidden = false; return;
  }
  showInspectRef(current.ref, current);
}
// The inspector reads World state plus what the view knows about the body (action) for agents.
function inspectExtra(ref, entity) {
  const world = store.world, a = ref.type === 'agent' ? world.agents[ref.id] : null;
  return {
    status: entity?.kind === 'agent' ? actionText(entity, theme.layout) : undefined,
    job: a ? jobOf(world, a) : null, lastJob: a ? lastJobOf(world, a) : null, issues: a ? issuesFor(world, a) : [],
    meetingRoomId: theme.layout.locationById.comms?.id,
  };
}
function showInspectRef(ref, entity) {
  const panel = $('inspect');
  panel.innerHTML = `<button class="close" aria-label="Close">×</button>${inspectHTML(ref, store.world, Date.now(), entity?.location, view.places, inspectExtra(ref, entity))}`;
  panel.hidden = false; $('side').hidden = true;
}
// Links inside the inspector that open another record (an ended meeting has no scene object to click).
$('inspect').addEventListener('click', e => {
  const target = e.target.closest('[data-inspect]')?.dataset.inspect; if (!target) return;
  const [type, ...rest] = target.split(':'), id = rest.join(':'), entity = scene.get(target);
  if (entity) select(entity); else { selected = { id: target, ref: { type, id } }; showInspectRef({ type, id }, null); }
});
// Any overlay element with data-focus moves the camera (inspect links, attention items, roster cards).
for (const id of ['inspect', 'side', 'roster']) $(id).addEventListener('click', e => {
  if (e.target.closest('.close')) return select(null);
  const target = e.target.closest('[data-focus]')?.dataset.focus;
  if (target) focus(target);
});
// Camera commands: the hooks for "show me what Codex is doing" / "show the whole company".
export function focus(target) {
  cameraTouched = true; // a chosen view must survive HUD resizes
  if (target === 'overview') { follow = null; camera.overview(); return invalidate(); }
  const [kind, id] = target.split(':');
  if (kind === 'room') { const l = theme.layout.locationById[id]; follow = null; camera.focusRect({ x: l.x, y: l.y, w: l.w, h: l.h }, { maxZoom: theme.camera.maxZoom * 0.75 }); }
  else {
    const e = scene.get(target); if (!e) return;
    camera.focusPoint(e.x, e.y - e.h / 2, { zoom: theme.camera.maxZoom * 0.6 });
    if (kind === 'agent') setTimeout(() => { follow = target; invalidate(); }, 720);
    select(e);
  }
  invalidate();
}

// Navigation overlay: overview, rooms and agents.
function renderNav() {
  const agents = Object.values(store.world.agents);
  $('nav').innerHTML = `<button data-go="overview">Whole company</button>${theme.layout.locations.map(l => `<button data-go="room:${l.id}">${l.name}</button>`).join('')}${agents.length ? '<hr>' : ''}${agents.map(a => `<button data-go="agent:${a.id}">${a.name}</button>`).join('')}`;
}
$('nav').addEventListener('click', e => { const go = e.target.closest('[data-go]')?.dataset.go; if (go) focus(go); });
const toggle = (btn, panel, other) => () => {
  const open = $(panel).hidden; $(panel).hidden = !open; $(btn).setAttribute('aria-expanded', String(open));
  if (open) { $(other.panel).hidden = true; $(other.btn).setAttribute('aria-expanded', 'false'); }
};
$('nav-toggle').onclick = toggle('nav-toggle', 'nav', { btn: 'sim-toggle', panel: 'sim-panel' });
$('sim-toggle').onclick = toggle('sim-toggle', 'sim-panel', { btn: 'nav-toggle', panel: 'nav' });

// HUD: counts, attention, recent activity and roster, all derived from World state.
let hudQueued = false, hudSig = '';
// The roster shows what bodies are doing, which changes without a World event (arriving, sitting down).
const bodySignature = () => [...(scene?.entities.values() ?? [])].filter(e => e.kind === 'agent').map(e => `${e.id}:${e.anim?.state}:${e.dest?.location ?? ''}`).join('|');
setInterval(() => { if (!document.hidden && theme && bodySignature() !== hudSig) renderHud(); }, 500);
function renderHud() {
  if (hudQueued || !theme) return; hudQueued = true;
  requestAnimationFrame(() => {
    hudQueued = false;
    const world = store.world, s = summarize(world, a => PRODUCTIVE_STATES.has(scene.get(`agent:${a.id}`)?.anim?.state));
    $('stats').innerHTML = `<span class="n-total"><b>${s.total}</b>Agents</span><span class="n-working" title="${s.assigned} assigned; ${s.working} at their work right now"><b>${s.working}</b>Working</span><span class="n-waiting"><b>${s.waiting}</b>Waiting</span><span class="n-idle"><b>${s.idle}</b>Idle</span><span class="n-attention"><b>${s.attention.length}</b>Attention</span>`;
    $('attention').innerHTML = `<h2>Attention needed (${s.attention.length})</h2>${attentionHTML(s.attention)}`;
    $('feed').innerHTML = `<h2>Recent activity</h2>${feedHTML(world, Date.now())}`;
    const statusOf = a => { const e = scene.get(`agent:${a.id}`); return e ? actionText(e, theme.layout) : a.activity; };
    hudSig = bodySignature();
    $('roster').innerHTML = rosterHTML(world, statusOf); paintFaces($('roster'), theme, world); updateInsets();
  });
}
function tickClock() { $('clock').textContent = new Date().toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
setInterval(() => { tickClock(); if (!document.hidden) renderHud(); }, 15000); tickClock();

// Dev simulation panel.
const sim = new Simulator(store);
function showMode(state) {
  const text = { sim: 'SIMULATION: not real Hillink activity', live: 'LIVE: HQ', down: 'HQ OFFLINE: showing last known state' }[state];
  $('mode').textContent = text; $('mode').dataset.state = state;
}
$('scenarios').innerHTML = SCENARIOS.map(([key, text]) => `<button data-sim="${key}">${text}</button>`).join('') + '<button data-sim="reset" class="danger">Reset simulation</button>';
$('scenarios').addEventListener('click', e => {
  const key = e.target.closest('[data-sim]')?.dataset.sim; if (!key) return;
  if (key === 'reset') { sim.stop(); storage.set('hlw:sim-world', null); location.reload(); return; }
  const cancelled = sim.run(key);
  $('sim-note').textContent = cancelled.length ? `Stopped “${cancelled.join('”, “')}” so it can't overwrite this scenario.` : '';
  if (key === 'constructionStep') {
    store.flush();
    const p = store.world.passes?.['sim-pass'];
    $('sim-note').textContent = p ? `Simulated construction: ${STAGE_LABEL[p.stage] ?? p.stage} (${Object.keys(p.evidence).length} of ${SIM_PASS_STEPS.length - 1} milestones). Click again for the next one.` : '';
  }
  invalidate();
});
// v2: worlds saved by older builds (v1) are discarded rather than replayed into the new state shape.
setInterval(() => { if (mode === 'sim') storage.set('hlw:sim-world', { v: 2, world: store.world }); }, 2000);

function savePrefs() { cameraTouched = true; clearTimeout(savePrefs.t); savePrefs.t = setTimeout(() => storage.set(`hlw:camera:${theme.id}`, camera.toJSON()), 300); }

// Construction (LIVE only): pass evidence from git and GitHub, collected and journaled by the World server.
// Kept as sticky events so an HQ reconnect never demolishes what has been built.
let constructionStatus = null;
async function pollConstruction() {
  try {
    const r = await fetch('/api/construction', { cache: 'no-store' });
    if (r.ok) { const body = await r.json(); constructionStatus = body.status ?? null; if (Array.isArray(body.events)) store.keep(body.events); }
  } catch { /* the World keeps what it already has */ }
  setTimeout(pollConstruction, 30000);
}

// Boot.
resize();
applyTheme(params.get('theme') ?? storage.get('hlw:theme') ?? 'real');
mode = requested === 'sim' ? 'sim' : requested === 'hq' || await hqAvailable() ? 'hq' : 'sim';
if (mode === 'hq') {
  // Live: the simulator is hidden so simulated events can never mix with real ones.
  $('sim-toggle').hidden = true; $('sim-panel').hidden = true;
  showMode('live');
  connectHq(store, { onStatus: ok => showMode(ok ? 'live' : 'down') });
  pollConstruction();
} else {
  showMode('sim');
  const saved = storage.get('hlw:sim-world');
  if (saved?.v === 2) store.replace(saved.world); else sim.seed();
}
$('empty').hidden = Object.keys(store.world.agents).length > 0;
invalidate();
window.hillinkWorld = { get constructionStatus() { return constructionStatus; }, store, get scene() { return scene; }, get theme() { return theme; }, camera, sim, focus, setTheme: applyTheme }; // Dev handle for tests and console.
