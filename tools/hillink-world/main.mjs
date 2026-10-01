// Hillink World app: wires source -> store -> view -> renderer, plus camera input, themes and overlays.
import { WorldStore, emptyWorld } from './core/state.mjs';
import { readonly } from './core/readonly.mjs';
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
import { explainAgent, STATE_LABEL } from './core/truth.mjs';
import { createConstructionDemo, DEMO_STEPS, REFIT_CAPABILITY } from './sim/construction-demo.mjs';
import { STAGE_LABEL as PROJECT_STAGE } from './procgen/construction.mjs';
import { loadSite, createSiteSync, sourceLabel } from './ui/site-sync.mjs';
import { worldFingerprint } from './procgen/world.mjs';
import { setPxLighting, pxLighting } from './render/px/skin.mjs';
import { LIGHTING_IDS } from './render/px/palette.mjs';

const $ = id => document.getElementById(id);
const storage = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Persistence is a convenience. */ } },
};
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const params = new URLSearchParams(location.search);
// Pass 5H slice: ?art=px is the pixel renderer (both themes); ?light=day|dusk|night its lighting setting.
const pxMode = () => theme?.art === 'px';
// The slice keeps its own saved camera, so a zoom saved by another skin never opens it zoomed out.
const camKey = () => `hlw:camera:${theme?.id}${siteWorld ? ':gen' : ''}${pxMode() ? ':px' : ''}`;
if (params.get('light')) setPxLighting(params.get('light'));
const deviceRatio = () => Math.min(2, devicePixelRatio || 1);
// Source: live HQ when it answers (default), or the dev simulator. `?source=sim` forces the simulator.
const requested = params.get('source') ?? 'auto';
let mode = 'sim';

// World state starts empty; boot fills it from HQ (backend truth) or from the saved simulation.
const store = new WorldStore(emptyWorld());
// 5E correction (B7): what the renderer, HUD and inspector read is a read-only view of the World.
const shown = () => readonly(store.world);
const effects = new Effects();
const camera = new Camera({ bounds: { x: 0, y: 0, w: 1, h: 1 } });
const canvas = $('world'), renderer = createCanvasRenderer(canvas);
let theme, scene, view;
// Pass 5B: the canonical procedural world the building is generated from (GET /api/site), or null for the
// hand-authored legacy building (?world=legacy). In the construction demo it is a simulated copy that is never saved.
let siteWorld = null, demo = null;
let hover = null, selected = null, follow = null, lastFrame = performance.now(), running = false;

// The home framing. The slice (art px) opens at its 2x scale centred on the building; other skins fit the overview.
function overview(opts = {}) {
  if (!pxMode()) return camera.overview(opts);
  const h = theme.layout.home, z = theme.skin.defaultZoom(deviceRatio());
  camera.animateTo({ ...(h ? camera.centerFor(h.x + h.w / 2, h.y + h.h / 2, z) : {}), zoom: z }, opts.duration);
}
// Themes: same World state, different layout and art. Switching rebuilds only the view.
function applyTheme(id, { keepCamera = false } = {}) {
  const cam0 = keepCamera && theme ? camera.toJSON() : null;
  theme = loadTheme(THEME_ORDER.includes(id) ? id : 'real', { world: siteWorld, art: params.get('art') ?? '5d' });
  const places = view?.places ?? {}; // Semantic places (room + station ids) carry across themes.
  scene = new Scene(); view = new IsoWorldView(scene, effects, theme.layout, theme.scenery, theme.interpreter); view.places = places;
  Object.assign(camera, { bounds: theme.layout.bounds, home: theme.layout.home ?? null, minZoom: theme.camera.minZoom, maxZoom: theme.camera.maxZoom });
  view.sync(store.world, new Set(['*']), performance.now());
  // Agents start at their stations instead of walking in from the entrance.
  for (const e of scene.entities.values()) if (e.kind === 'agent') { const p = e.path?.at(-1); if (p) { e.x = p[0]; e.y = p[1]; e.path = []; e.moving = false; scene.moved(e); } }
  view.step(0, performance.now(), { instant: true }, stepPath);
  hover = null; if (!keepCamera) { select(null); cameraTouched = false; }
  const cam = cam0 ?? (params.get('camera') ? null : storage.get(camKey()));
  if (cam && Number.isFinite(cam.zoom)) camera.animateTo(cam, 0); else overview({ duration: 0 });
  storage.set('hlw:theme', theme.id);
  document.documentElement.dataset.theme = theme.id;
  for (const b of $('themes').children) b.setAttribute('aria-checked', String(b.dataset.theme === theme.id));
  renderNav(); renderHud(); invalidate();
}
$('themes').innerHTML = THEME_ORDER.map(id => `<button role="radio" data-theme="${id}">${THEME_NAMES[id]}</button>`).join('');
$('themes').addEventListener('click', e => { const id = e.target.closest('[data-theme]')?.dataset.theme; if (id && id !== theme.id) applyTheme(id, { keepCamera: pxMode() }); });

// The header and roster are fixed over the canvas; the camera frames the world between them.
let cameraTouched = false;
// The right-hand panel (activity, or the inspector) is measured from the DOM so framing never puts the
// subject under it; on narrow screens the panels float over the world instead.
function updateInsets() {
  const roster = $('roster'), bottom = roster.childElementCount ? roster.offsetHeight + 16 : 0, top = 50;
  const host = canvas.parentElement.getBoundingClientRect(), panel = !$('inspect').hidden ? $('inspect') : !$('side').hidden ? $('side') : null;
  const right = panel && host.width > 760 && !document.body.classList.contains('ui-hidden') ? Math.round(Math.min(host.width * 0.4, host.right - panel.getBoundingClientRect().left + 8)) : 0;
  if (camera.insets.bottom === bottom && camera.insets.top === top && camera.insets.right === right) return;
  camera.insets = { top, right, bottom, left: 0 };
  if (cameraTouched || storage.get(camKey())) camera.clamp(); else overview({ duration: 0 });
  invalidate();
}
function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  camera.resize(r.width, r.height); updateInsets(); renderer.resize(r.width, r.height, deviceRatio()); invalidate();
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
  // Pass 5C: follow is frame-rate independent (the same glide at 30 or 144 fps), so a tracked walker never jitters.
  if (follow) { const e = scene.get(follow); if (e && !camera.tween) { const c = camera.centerFor(e.x, e.y - e.h / 2), k = 1 - Math.exp(-dt * 7); camera.x += (c.x - camera.x) * k; camera.y += (c.y - camera.y) * k; camera.clamp(); } }
  const cameraMoving = camera.step(now);
  if (pxMode()) camera.zoom = theme.skin.snapZoom(camera.zoom, deviceRatio()); // whole device pixels per art pixel
  const fx = effects.active(now);
  // Art themes always have ambient life (water, machinery, staff); the blueprint only animates its agents.
  const ambient = !instant; // the building always has quiet ambient life (street, lights, idle breathing)
  renderer.draw({ camera, scene, skin: theme.skin, layout: theme.layout, world: shown(), entities: scene.query(camera.viewRect(80)), time: now, hoverId: hover?.id, selectedId: selected?.id, effects: fx, signals: view.roomSignals, activity: view.activity, reducedMotion: instant, theme: theme.palette, modeLabel: $('mode').textContent });
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
  const text = hit ? hoverText(hit.ref.type === 'room' ? { ...hit.ref, name: hit.location.name } : hit.ref, shown(), { status: hit.kind === 'agent' ? statusLine(hit, shown(), theme.layout) : undefined }) : '';
  tip.hidden = !text || (pxMode() && hit?.kind === 'agent'); // the slice draws its own agent chip tip.textContent = text; tip.style.transform = `translate(${e.offsetX + 14}px, ${e.offsetY + 14}px)`;
});
canvas.addEventListener('pointerup', e => {
  pointers.delete(e.pointerId); if (pointers.size < 2) pinchDist = null;
  if (dragMoved > 4) return;
  const [wx, wy] = camera.screenToWorld(e.offsetX, e.offsetY);
  select(scene.pick(wx, wy, pickSlop()));
});
canvas.addEventListener('pointerleave', () => { $('tooltip').hidden = true; if (hover) { hover = null; invalidate(); } });
let wheelAcc = 0;
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (pxMode()) { wheelAcc += e.deltaY; if (Math.abs(wheelAcc) < 80) return; const dir = wheelAcc < 0 ? 1 : -1; wheelAcc = 0; camera.zoomAt(theme.skin.stepZoom(camera.zoom, deviceRatio(), dir) / camera.zoom, e.offsetX, e.offsetY); savePrefs(); invalidate(); return; }
  camera.zoomAt(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY); savePrefs(); invalidate();
}, { passive: false });
addEventListener('keydown', e => {
  if (e.target.closest('input,textarea,select')) return;
  const step = 80;
  if (pxMode() && (e.key === 'l' || e.key === 'L')) { setLighting(LIGHTING_IDS[(LIGHTING_IDS.indexOf(pxLighting()) + 1) % LIGHTING_IDS.length]); return; }
  if (pxMode() && e.key === 'Enter' && selected) { select(selected, { details: true }); return; }
  if (pxMode() && ['+', '=', '-'].includes(e.key)) { e.preventDefault(); camera.zoomAt(theme.skin.stepZoom(camera.zoom, deviceRatio(), e.key === '-' ? -1 : 1) / camera.zoom); savePrefs(); invalidate(); return; }
  if (e.key === 'h' || e.key === 'H') { document.body.classList.toggle('ui-hidden'); updateInsets(); return; } // hide overlays: the world on its own
  const actions = { ArrowLeft: () => camera.pan(step, 0), ArrowRight: () => camera.pan(-step, 0), ArrowUp: () => camera.pan(0, step), ArrowDown: () => camera.pan(0, -step), '+': () => camera.zoomAt(1.2), '=': () => camera.zoomAt(1.2), '-': () => camera.zoomAt(1 / 1.2), Escape: () => { select(null); follow = null; overview(); } };
  if (actions[e.key]) { e.preventDefault(); actions[e.key](); savePrefs(); invalidate(); }
});

function select(entity, { details = false } = {}) {
  selected = entity; follow = null;
  // The slice shows a contextual card for an agent; the full inspector opens on Enter (details).
  if (entity && (!pxMode() || details || entity.kind !== 'agent')) showInspect(entity); else $('inspect').hidden = true;
  $('side').hidden = !!entity;
  updateInsets(); invalidate();
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
    // Pass 1: the one real command loop. Only LIVE mode, and only agents the World server lists as commandable.
    command: mode === 'hq' && a ? commandInfo.commandable?.[a.id] ?? null : null, commands: commandInfo.commands,
  };
}
function showInspectRef(ref, entity) {
  const panel = $('inspect');
  // The inspector re-renders on every World change; keep what the user is typing and which results are open.
  const text = $('cmd-text'), draft = text?.value ?? '', typing = document.activeElement === text, caret = text?.selectionStart;
  const note = $('cmd-note')?.textContent ?? '', open = [...panel.querySelectorAll('details')].map(d => d.open);
  panel.innerHTML = `<button class="close" aria-label="Close">×</button>${inspectHTML(ref, shown(), Date.now(), entity?.location, view.places, inspectExtra(ref, entity))}`;
  panel.hidden = false; $('side').hidden = true;
  const next = $('cmd-text');
  if (next) { next.value = draft; if (typing) { next.focus(); next.setSelectionRange(caret, caret); } $('cmd-note').textContent = note; }
  panel.querySelectorAll('details').forEach((d, i) => { if (open[i]) d.open = true; });
}

// World commands (Pass 1). The page never talks to HQ: it asks the World server, which creates the HQ task
// through HQ's validated API. The id is made once per request and reused on retry, so a double click, a
// network retry or a reload can never create a second HQ task.
let commandInfo = { commandable: {}, commands: [] }, pendingCommand = null;
async function pollCommands() {
  try {
    const r = await fetch('/api/commands', { cache: 'no-store' });
    if (r.ok) {
      const body = await r.json(), sig = JSON.stringify(body);
      if (sig !== pollCommands.sig) { pollCommands.sig = sig; commandInfo = body; if (selected) showInspect(selected); }
    }
  } catch { /* history stays as last seen */ }
  clearTimeout(pollCommands.t); pollCommands.t = setTimeout(pollCommands, 3000);
}
async function sendCommand(agentId) {
  const text = $('cmd-text'), note = $('cmd-note'), instruction = text?.value.trim() ?? '';
  if (!instruction) { note.textContent = 'Type an instruction first.'; return; }
  if (pendingCommand?.busy) return;
  if (!pendingCommand || pendingCommand.instruction !== instruction || pendingCommand.agentId !== agentId) pendingCommand = { commandId: crypto.randomUUID(), agentId, instruction };
  pendingCommand.busy = true; note.textContent = 'Sending to HQ…';
  try {
    const r = await fetch('/api/commands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pendingCommand) });
    const body = await r.json().catch(() => ({}));
    if (r.status === 201 || (r.ok && body.duplicate)) {
      pendingCommand = null; text.value = '';
      $('cmd-note').textContent = `HQ task ${String(body.taskId).slice(0, 8)} created. ${store.world.agents[agentId]?.name ?? agentId} shows Working only once HQ confirms the run started.`;
    } else { pendingCommand.busy = false; pendingCommand = body.id ? null : pendingCommand; $('cmd-note').textContent = body.error ? `Not sent: ${body.error}` : `Not sent (HTTP ${r.status}).`; }
  } catch (error) { pendingCommand.busy = false; $('cmd-note').textContent = `Could not reach the World server (${error.message}). Sending again reuses the same request id.`; }
  pollCommands();
}
$('inspect').addEventListener('click', e => { const id = e.target.closest('[data-command]')?.dataset.command; if (id) sendCommand(id); });
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
  if (target === 'overview') { follow = null; overview(); return invalidate(); }
  const cut = target.indexOf(':'), kind = target.slice(0, cut), id = target.slice(cut + 1); // ids may contain ':' (site:meeting-room)
  if (kind === 'room') { const l = theme.layout.locationById[id]; follow = null; camera.focusRect({ x: l.x, y: l.y, w: l.w, h: l.h }, { maxZoom: theme.camera.maxZoom * 0.75 }); }
  else {
    const e = scene.get(target); if (!e) return;
    select(e); // first, so the inspector's width is part of the framing
    camera.focusPoint(e.x, e.y - e.h / 2, { zoom: theme.camera.maxZoom * 0.6 });
    if (kind === 'agent') setTimeout(() => { follow = target; invalidate(); }, 720);
  }
  invalidate();
}

// Navigation overlay: overview, rooms and agents.
function renderNav() {
  const agents = Object.values(store.world.agents);
  $('nav').innerHTML = `<button data-go="overview">Whole company</button>${theme.layout.locations.map(l => `<button data-go="room:${l.id}">${l.name}</button>`).join('')}${agents.length ? '<hr>' : ''}${agents.map(a => `<button data-go="agent:${a.id}">${a.name}</button>`).join('')}`;
}
$('nav').addEventListener('click', e => {
  const go = e.target.closest('[data-go]')?.dataset.go; if (!go) return;
  $('nav').hidden = true; $('nav-toggle').setAttribute('aria-expanded', 'false'); // a pick closes the menu
  focus(go);
});
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
    const world = shown(), s = summarize(world, a => PRODUCTIVE_STATES.has(scene.get(`agent:${a.id}`)?.anim?.state));
    $('stats').innerHTML = `<span class="n-total"><b>${s.total}</b>Agents</span><span class="n-working" title="${s.assigned} assigned; ${s.working} at their work right now"><b>${s.working}</b>Working</span><span class="n-waiting"><b>${s.waiting}</b>Waiting</span><span class="n-idle"><b>${s.idle}</b>Idle</span><span class="n-attention"><b>${s.attention.length}</b>Attention</span>`;
    $('attention').innerHTML = `<h2>Attention needed (${s.attention.length})</h2>${attentionHTML(s.attention)}`;
    $('feed').innerHTML = `<h2>Recent activity</h2>${feedHTML(world, Date.now())}`;
    // A live agent that is not verified working shows its state (Not connected, Starting, Unknown...), never a pose.
    const statusOf = a => { if (a.truth && a.truth.state !== 'WORKING' && a.truth.state !== 'IDLE') return STATE_LABEL[a.truth.state]; const e = scene.get(`agent:${a.id}`); return e ? actionText(e, theme.layout) : a.activity; };
    hudSig = bodySignature();
    // Roster dot follows the body like the in-world dot: green only while the work is actually happening.
    const toneOf = a => { const e = scene.get(`agent:${a.id}`); return !e || PRODUCTIVE_STATES.has(e.anim?.state) || ['talk', 'meeting'].includes(e.anim?.state) || !['coding', 'thinking', 'reviewing', 'testing', 'researching', 'communicating'].includes(a.activity) ? a.activity : 'moving'; };
    $('roster').innerHTML = rosterHTML(world, statusOf, toneOf); paintFaces($('roster'), theme, world); updateInsets();
  });
}
function tickClock() { $('clock').textContent = new Date().toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
setInterval(() => { tickClock(); if (!document.hidden) renderHud(); }, 15000); tickClock();

// Dev simulation panel.
const sim = new Simulator(store);
function showMode(state) {
  // Live HQ facts on a fallback building must never read as the live generated World.
  const fallback = (siteSync?.state ?? siteSource) === 'unavailable' ? ' (fallback building, not the generated World)' : '';
  const text = { sim: 'SIMULATION: not real Hillink activity', live: 'LIVE: HQ', down: 'HQ OFFLINE: showing last known state' }[state] + fallback;
  $('mode').textContent = text; $('mode').dataset.state = state;
}
$('scenarios').innerHTML = SCENARIOS.map(([key, text]) => `<button data-sim="${key}">${text}</button>`).join('') + '<button data-sim="demoStep">Meeting room construction: next step (demo)</button><button data-sim="reset" class="danger">Reset simulation</button>';
$('scenarios').addEventListener('click', e => {
  const key = e.target.closest('[data-sim]')?.dataset.sim; if (!key || mode !== 'sim') return; // never against live HQ
  if (key === 'demoStep') { if (!demo) { $('sim-note').textContent = 'Open the World with ?demo=construction to run the construction demonstration (a simulated copy of the world).'; return; } demoStep(); return; }
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
// Pass 5H fix: save only after boot has seeded or restored the simulation (a slow boot, such as the first build of the
// Real art skin, used to save the empty pre-boot World and then restore it, leaving the simulation without agents).
let simBooted = false;
setInterval(() => { if (mode === 'sim' && simBooted) storage.set('hlw:sim-world', { v: 2, world: store.world }); }, 2000);

function savePrefs() { cameraTouched = true; clearTimeout(savePrefs.t); savePrefs.t = setTimeout(() => storage.set(camKey(), camera.toJSON()), 300); }

// Pass 5B: when the canonical world changes (construction reported by HQ, or a demo step), the building is regenerated
// from it: layout, navigation and art. Agents keep their places; the camera stays where it is.
function rebuildWorld() { applyTheme(theme.id, { keepCamera: true }); }
// Live: the World server applies HQ's facts to the persisted canonical world; the page picks up every new version,
// including one that arrives on the very first poll, and recovers the generated world if boot could not load it
// (ui/site-sync.mjs). Until then a fallback is labelled as one.
async function fetchSite() { const r = await fetch('/api/site', { cache: 'no-store' }); if (!r.ok) throw Error(`/api/site answered HTTP ${r.status}`); return (await r.json()).world; }
let siteSync = null;
function showSource() {
  const label = sourceLabel(siteSync?.state ?? siteSource, siteSync?.error ?? siteError), el = $('world-source');
  el.hidden = !label; el.textContent = label ?? '';
  if ($('mode').dataset.state) showMode($('mode').dataset.state);
}
async function pollSite() {
  await siteSync.poll();
  setTimeout(pollSite, siteSync.state === 'unavailable' ? 4000 : 10000);
}
// The construction demo: one step applies one batch of simulated HQ facts to the simulated world, regenerates the
// building, then moves the simulated agents (so builders walk to the site from where they were).
function demoStep({ rebuild = true } = {}) {
  if (!demo || demo.done) return null;
  const results = demo.applyCanonical();
  if (rebuild) rebuildWorld();
  const label = demo.applyAgents(); store.flush();
  const p = demo.project;
  $('sim-note').textContent = `Step ${demo.index} of ${DEMO_STEPS.length}: ${label}.${p ? ` Construction: ${PROJECT_STAGE[p.stage]}${p.blocked ? ' (blocked)' : ''}${p.rework ? ' (rework)' : ''}${p.completed ? ', complete' : ''}.` : ''}${results.some(r => !r.applied) ? ` Refused: ${results.filter(r => !r.applied).map(r => `${r.type} (${r.reason})`).join('; ')}.` : ''}`;
  invalidate();
  return { label, results };
}

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
// The geometry source: the generated canonical world, the legacy building when explicitly selected, or (only if the
// generated world cannot be loaded after retries) the legacy building as an identified fallback while it retries.
let siteSource = 'legacy', siteError = null;
if (params.get('world') !== 'legacy') {
  const r = await loadSite(fetchSite, { attempts: 3, wait: k => new Promise(res => setTimeout(res, 400 * k)) });
  siteWorld = r.world; siteSource = r.world ? 'generated' : 'unavailable'; siteError = r.error;
}
const demoKind = ['construction', 'refit'].includes(params.get('demo')) ? params.get('demo') : null; // refit: a capability built inside an existing room
const demoMode = !!demoKind && !!siteWorld;
if (demoMode) { siteWorld = structuredClone(siteWorld); siteWorld.simulated = true; } // never saved; refuses live HQ events
applyTheme(params.get('theme') ?? storage.get('hlw:theme') ?? 'real');
mode = demoMode || requested === 'sim' ? 'sim' : requested === 'hq' || await hqAvailable() ? 'hq' : 'sim';
// 5E correction (B4): the store takes events from one source family only. Live refuses every simulated event (from the
// simulator, the dev handle or the console), and the simulation refuses live facts.
store.family = mode === 'hq' ? 'live' : 'sim';
if (mode === 'hq') {
  // Live: the simulator is hidden so simulated events can never mix with real ones.
  $('sim-toggle').hidden = true; $('sim-panel').hidden = true;
  showMode('live');
  connectHq(store, { onStatus: ok => showMode(ok ? 'live' : 'down') });
  pollConstruction(); pollCommands();
} else {
  showMode('sim');
  const saved = demoMode ? null : storage.get('hlw:sim-world');
  if (saved?.v === 2 && Object.keys(saved.world?.agents ?? {}).length) store.replace(saved.world); else sim.seed();
  simBooted = true;
}
if (demoMode) {
  // ?demo=construction[&step=N][&walk=1]: jump to step N (agents placed), or with walk=1 leave the last step's walks running.
  $('sim-toggle').hidden = false; store.flush();
  demo = createConstructionDemo({ siteWorld, store, ...(demoKind === 'refit' ? { capability: REFIT_CAPABILITY } : {}) });
  const target = Math.min(DEMO_STEPS.length, Number(params.get('step') ?? 0));
  const walk = params.get('walk') === '1';
  for (let k = 0; k < target; k++) { const last = k === target - 1; demo.applyCanonical(); if (last && walk) rebuildWorld(); demo.applyAgents(); store.flush(); }
  if (target && !walk) rebuildWorld();
  $('sim-note').textContent = target ? `Construction demo at step ${target} of ${DEMO_STEPS.length}: ${DEMO_STEPS[target - 1].label}.` : 'Construction demo ready: press "Meeting room construction: next step".';
} else if (siteSource !== 'legacy') {
  siteSync = createSiteSync({ fetchSite, source: siteSource, world: siteWorld, apply: w => { siteWorld = w; rebuildWorld(); showSource(); }, report: showSource });
  pollSite();
}
if (demoKind && !demoMode) $('sim-note').textContent = 'The construction demo needs the generated world, which is unavailable right now.';
showSource();
// ?camera=room:<id>|agent:<id>|overview|building: frame a view on load (reproducible screenshots).
// Pass 5C: watchable scenarios. ?play=office|workstation|meeting loops a scripted, clearly simulated sequence (only in
// simulation mode, under the SIMULATION banner); ?demo=construction&autoplay=<seconds> steps the construction demo on
// its own. They exist to watch motion; they never run against live HQ.
const PLAYS = {
  office: { every: 80, steps: [[1, 'claudeCodes'], [6, 'codexTests'], [30, 'claudeMessagesCodex'], [44, 'testPasses'], [52, 'taskCompletes'], [66, 'allIdle']] },
  workstation: { every: 80, steps: [[2, 'claudeCodes'], [44, 'taskCompletes'], [54, 'allIdle']] }, // the trip up to the desk takes ~25 s
  meeting: { every: 60, steps: [[2, 'teamMeeting'], [34, 'endMeeting'], [44, 'allIdle']] },
};
function startPlay(kind) {
  const p = PLAYS[kind]; if (!p) return;
  const run = key => { if (key === 'allIdle') sim.allIdle(); else sim.run(key); };
  const cycle = () => { for (const [at, key] of p.steps) setTimeout(() => run(key), at * 1000); };
  cycle(); setInterval(cycle, p.every * 1000);
  $('sim-note').textContent = `Playing the "${kind}" scenario on a loop (simulated events, not real Hillink activity).`;
}
if (mode === 'sim' && !demoMode && params.get('play')) startPlay(params.get('play'));
if (demoMode && Number(params.get('autoplay')) > 0) {
  const every = Math.max(2, Number(params.get('autoplay'))) * 1000;
  const timer = setInterval(() => { if (!demo || demo.done) return clearInterval(timer); demoStep(); }, every);
}
if (params.get('camera')) setTimeout(() => focus(params.get('camera')), 50);
// Pass 5D-A: named camera positions for inspecting the visual prototype (?shot=overview|entrance|workspace|lounge|
// street|corner). Each is computed from the generated layout (the entrance door, the rooms, the road), not hard-coded.
function shotPoint(name) {
  const L = theme.layout, W = L.world, v = L.view, U = L.U;
  const door = Object.values(W.doors ?? {}).find(d => d.status === 'built' && (d.a === 'outside' || d.b === 'outside'));
  const dp = door && v ? v.toView((door.seg.x1 + door.seg.x2) / 2, (door.seg.y1 + door.seg.y2) / 2) : null;
  const room = id => { const l = L.locationById?.[id]; return l ? { x: l.x + l.w / 2, y: l.y + l.h / 2 } : null; };
  const b = Object.values(W.buildings ?? {})[0], r = b && v ? v.rectToView(b.footprint) : null;
  switch (name) {
    case 'overview': { const h = L.home; return h ? { x: h.x + h.w / 2, y: h.y + h.h / 2, zoom: 1.05 } : null; }
    case 'entrance': return dp ? { ...toXY(L.P.at(dp.x * U, dp.z * U - 40, 0, 60)), zoom: 2.4 } : null;
    case 'workspace': { const p = room('development'); return p && { ...p, zoom: 2.3 }; }
    case 'lounge': { const p = room('lounge'); return p && { ...p, zoom: 2.3 }; }
    case 'street': return dp ? { ...toXY(L.P.at(dp.x * U + 120, dp.z * U - 260, 0, 0)), zoom: 1.5 } : null;
    case 'corner': return r ? { ...toXY(L.P.at(r.x1 * U, r.z0 * U + 40, 0, 110)), zoom: 1.8 } : null;
    default: return null;
  }
}
const toXY = ([x, y]) => ({ x, y });
function applyShot(name) { const s = shotPoint(name); if (!s) return; follow = null; camera.focusPoint(s.x, s.y, { zoom: s.zoom, duration: 0 }); invalidate(); }
if (params.get('shot')) setTimeout(() => applyShot(params.get('shot')), 600); // after the initial camera has settled

$('empty').hidden = Object.keys(store.world.agents).length > 0;
invalidate();
function setLighting(id) { setPxLighting(id); invalidate(); return pxLighting(); }
window.hillinkWorld = { setLighting, get lighting() { return pxLighting(); }, shot: applyShot, get worldInfo() { return { source: siteSync?.state ?? siteSource, simulated: Boolean(siteWorld?.simulated), generator: siteWorld?.generator ?? null, seed: siteWorld?.seed ?? null, schema: siteWorld?.schema ?? null, fingerprint: siteWorld ? worldFingerprint(siteWorld) : null, historyLength: siteWorld?.history?.length ?? 0, layout: theme?.layout?.id ?? null, error: siteSync?.error ?? siteError }; }, get siteWorld() { return siteWorld; }, get demo() { return demo; }, demoStep, why: id => explainAgent(store.world, id), get commands() { return commandInfo; }, get constructionStatus() { return constructionStatus; }, store, get scene() { return scene; }, get theme() { return theme; }, camera, get sim() { return mode === 'sim' ? sim : null; }, focus, setTheme: applyTheme }; // Dev handle for tests and console. Live mode exposes no simulator (5E correction B4).
