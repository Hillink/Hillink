// Pass 5H visual evidence: the World server (simulation mode, clearly marked) and the review pages in headless
// Chromium. Every agent state shown comes from World events (the simulator or sim-family events dispatched through the
// dev handle); nothing is painted on top. Dynamic agents are onboarded through the real lifecycle events.
// Usage: node tools/hillink-world/live/pass5h-shots.mjs <outDir> [prefix,prefix,...]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const out = path.resolve(process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'pass5h-'))), onlyList = (process.argv[3] ?? '').split(',').filter(Boolean);
const only = onlyList.length ? 'x' : '', want = name => !onlyList.length || onlyList.some(o => name.startsWith(o)), wantAny = re => !onlyList.length || onlyList.some(o => re.test(o));
fs.mkdirSync(out, { recursive: true });
const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(path.resolve(here, '../../../node_modules/playwright/index.mjs'));
const PORT = 4398, state = fs.mkdtempSync(path.join(os.tmpdir(), 'pass5h-world-'));
const wait = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join(here, '../serve.mjs')], { env: { ...process.env, WORLD_PORT: String(PORT), HQ_URL: 'http://127.0.0.1:1', WORLD_GIT: '0', WORLD_STATE_DIR: state }, stdio: 'ignore' });
await wait(900);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = [], taken = [];

async function open(url) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  page.on('pageerror', e => errors.push(`${url}: ${e.message}`));
  await page.goto(`http://127.0.0.1:${PORT}/${url}`); await wait(3200);
  return page;
}
const shot = async (page, name) => { if (!want(name)) return; await page.screenshot({ path: path.join(out, `${name}.png`) }); taken.push(name); console.log('shot', name); };
const js = (page, code) => page.evaluate(code);
// Sim-family World events through the page's store (the same validation as the simulator's).
const EVENTS = `(() => { const W = window.hillinkWorld, E = (type, f) => ({ v: 1, id: 'shot-' + Math.random().toString(36).slice(2), type, at: Date.now(), source: 'sim', ...f });
  const send = (type, f) => { W.store.dispatch(E(type, f)); W.store.flush(); };
  const onboard = (def, activate = true) => { send('AGENT_REQUESTED', { agentId: def.id, definition: def }); for (const stage of ['CONFIGURING', 'CONNECTING_PROVIDER', 'CONNECTING_TOOLS', 'TESTING']) send('AGENT_PROVISIONING', { agentId: def.id, stage }); send('AGENT_READY', { agentId: def.id }); if (activate) send('AGENT_ACTIVATED', { agentId: def.id }); };
  return { send, onboard }; })()`;
const DYNAMIC = [
  { id: 'dyn-scout', name: 'Scout', role: 'Scout', team: 'Outreach', appearance: { palette: { primary: '#e56b9f' } } },
  { id: 'dyn-treasurer', name: 'Treasurer', role: 'Treasurer', team: 'Finance', appearance: { palette: { primary: '#c9a227' } } },
  { id: 'agent-5h-unknown-417', name: 'Unknown 417', role: 'Repository inspector', team: 'Engineering', capabilities: ['inspect-repo'], appearance: { palette: { primary: '#2a9d8f' }, accessories: ['cap'], themes: { fantasy: { archetype: 'elf' } } } },
];
async function populate(page, { work = true } = {}) {
  await js(page, `(() => { const { send, onboard } = ${EVENTS}; for (const id of ['chatgpt', 'kyle', 'qwen', 'gemma']) send('AGENT_REGISTERED', { agentId: id, activity: 'idle' }); for (const d of ${JSON.stringify(DYNAMIC)}) onboard(d); })()`);
  if (work) await js(page, `(() => { const S = window.hillinkWorld.sim; S.claudeCodes(); S.codexTests(); })()`);
}
const focus = (page, target) => js(page, `window.hillinkWorld.focus(${JSON.stringify(target)})`);
const zoomAt = (page, target, zoom) => js(page, `(() => { const W = window.hillinkWorld, t = ${JSON.stringify(target)}; let x, y; if (t.startsWith('agent:')) { const e = W.scene.get(t); x = e.x; y = e.y - e.h / 2; } else { const l = W.theme.layout.locationById[t.slice(5)]; x = l.x + l.w / 2; y = l.y + l.h / 2; } W.camera.focusPoint(x, y, { zoom: ${zoom}, duration: 0 }); })()`);

// ---- Character sheets (lineup page). ----
for (const [name, q] of [
  ['02-real-lineup', 'theme=real&mode=lineup&zoom=1.6'], ['02b-real-closeup', 'theme=real&mode=lineup&zoom=3.2&ids=claude,codex,chatgpt,kyle'], ['02c-real-views', 'theme=real&mode=views&zoom=1.1'], ['02d-real-states', 'theme=real&mode=states&ids=claude,codex,chatgpt&zoom=1'],
  ['08-fantasy-lineup', 'theme=fantasy&mode=lineup&zoom=1.6'], ['08b-fantasy-closeup', 'theme=fantasy&mode=lineup&zoom=3.2&ids=claude,codex,chatgpt,kyle'], ['08c-fantasy-closeup-2', 'theme=fantasy&mode=lineup&zoom=3.2&ids=dyn-treasurer,dyn-cyclops,dyn-scout,dyn-oracle'], ['08d-fantasy-views', 'theme=fantasy&mode=views&zoom=1.1'], ['08e-fantasy-states', 'theme=fantasy&mode=states&ids=claude,codex,chatgpt&zoom=1'],
  ['25-status-comparison', 'mode=status&zoom=1.2'],
]) { if (!want(name)) continue; const p = await open(`lineup.html?${q}`); await shot(p, name); await p.close(); }

// ---- Real HQ (the browser default is the 5D art; the old site skin stays at ?art=classic). ----
if (wantAny(/^(0[1346]|2[124])/)) {
  const p = await open('');
  await shot(p, '01-real-overview');
  await populate(p); await wait(26000);
  await focus(p, 'room:development'); await wait(1200); await shot(p, '03-real-work-area');
  await zoomAt(p, 'agent:claude', 2.6); await wait(600); await shot(p, '24a-real-depth-desk');
  await js(p, 'window.hillinkWorld.camera.overview({ duration: 0 })'); await wait(400); await js(p, 'window.hillinkWorld.shot("overview")'); await wait(800); await shot(p, '06-real-several-agents');
  await focus(p, 'agent:agent-5h-unknown-417'); await wait(1200); await shot(p, '22-real-unknown-agent');
  await focus(p, 'agent:claude'); await wait(1200); await shot(p, '21a-same-state-real');
  await js(p, 'window.hillinkWorld.setTheme("fantasy")'); await wait(1500); await focus(p, 'agent:claude'); await wait(1500); await shot(p, '21b-same-state-fantasy');
  await js(p, 'window.hillinkWorld.setTheme("real")'); await wait(800);
  await js(p, 'window.hillinkWorld.sim.run("teamMeeting")'); await wait(32000); await focus(p, 'room:comms'); await wait(1200); await shot(p, '04-real-meeting');
  await p.close();
}
if (wantAny(/^05/)) {
  const p = await open('?demo=construction&step=4'); const site = await js(p, `window.hillinkWorld.theme.layout.locations.find(l => l.kind === 'site' || l.site)?.id ?? null`);
  if (site) await focus(p, `room:${site}`); else await js(p, 'window.hillinkWorld.shot("overview")');
  await wait(1500); await shot(p, '05-real-construction-refit'); await p.close();
}

// ---- Fantasy kingdom. ----
if (wantAny(/^(0[79]|1[01679]|2[035])/)) {
  const p = await open('?theme=fantasy');
  await shot(p, '07-fantasy-overview');
  await populate(p); await js(p, `(() => { const { onboard } = ${EVENTS}; onboard({ id: 'dyn-candidate', name: 'Candidate', role: 'Metrics analyst', team: 'Analytics', appearance: { palette: { primary: '#c46a2b' } } }, false); })()`);
  await wait(40000);
  await focus(p, 'room:forge'); await wait(1200); await shot(p, '10-fantasy-forge-claude');
  await focus(p, 'room:oracle'); await wait(1200); await shot(p, '11-fantasy-codex-inspection');
  await focus(p, 'room:throne'); await wait(1200); await shot(p, '09-fantasy-kings-command');
  await focus(p, 'room:arcane'); await wait(1200); await shot(p, '16-fantasy-arcane-engine');
  await focus(p, 'room:summoning'); await wait(1200); await shot(p, '17-fantasy-summoning');
  await focus(p, 'agent:agent-5h-unknown-417'); await wait(1200); await shot(p, '23-fantasy-unknown-agent');
  await js(p, 'window.hillinkWorld.sim.run("manyAgents")'); await wait(9000);
  await js(p, `(() => { const W = window.hillinkWorld, l = W.theme.layout.locationById.plaza ?? W.theme.layout.locationById.forge; W.camera.focusPoint(l.x + l.w / 2, l.y + l.h / 2, { zoom: 0.95, duration: 0 }); })()`); await wait(1000); await shot(p, '20-fantasy-several-agents');
  await js(p, 'window.hillinkWorld.sim.run("ownerNeeded")'); await wait(2500);
  await focus(p, 'room:gate'); await wait(1500); await shot(p, '19-fantasy-gate-security');
  await focus(p, 'agent:codex'); await wait(1500); await shot(p, '25b-needs-kyle-in-world');
  await p.close();
}
// Districts that only stand when HQ has the capability: a demo (simulated, never saved) world with those capabilities.
if (wantAny(/^(1[2-58]|24b)/)) {
  const p = await open('?theme=fantasy&demo=construction&step=3');
  await js(p, `(() => { const W = window.hillinkWorld, w = W.siteWorld; for (const [id, kind, name] of [['cap-5h-finance', 'finance', 'Treasury'], ['cap-5h-analytics', 'analytics', 'Metrics'], ['cap-5h-archive', 'archive', 'Archive']]) w.capabilities[id] = { id, spec: { id, kind, name, traits: [] }, status: 'operational' }; W.setTheme('fantasy'); })()`);
  await populate(p, { work: false }); await wait(2500);
  for (const [room, name] of [['vault', '12-fantasy-vault'], ['oracle', '13-fantasy-oracle-chamber'], ['observatory', '14-fantasy-observatory'], ['library', '15-fantasy-great-library']]) { await focus(p, `room:${room}`); await wait(1300); await shot(p, name); }
  await focus(p, 'room:yard'); await wait(1500); await shot(p, '18-fantasy-construction-giant');
  await js(p, 'window.hillinkWorld.sim.claudeCodes()'); await wait(38000); await focus(p, 'room:forge'); await wait(1000);
  await zoomAt(p, 'room:forge', 2.4); await wait(800); await shot(p, '24b-fantasy-depth-forge');
  await p.close();
}
fs.writeFileSync(path.join(out, 'shots.json'), JSON.stringify({ taken, errors, at: new Date().toISOString(), mode: 'simulation (HQ unreachable on purpose)' }, null, 2));
console.log('errors', JSON.stringify(errors));
await browser.close(); srv.kill();
