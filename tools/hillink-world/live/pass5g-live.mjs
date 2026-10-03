// Pass 5G live evidence: a real HQ (createHQ, file journal, real local-checks adapter) and the real World server + page
// in headless Chromium, drawn by the Fantasy kingdom. Agents are created and activated only through HQ's owner HTTP API;
// the kingdom is only a different reading of HQ's own lifecycle and task events.
// Usage: node tools/hillink-world/live/pass5g-live.mjs <outDir>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHQ } from '../../hillink-hq/server.mjs';

const out = path.resolve(process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'pass5g-'))); fs.mkdirSync(out, { recursive: true });
const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(path.resolve(here, '../../../node_modules/playwright/index.mjs'));
const HQ_PORT = 4401, WORLD_PORT = 4400, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass5g-hq-')), worldState = fs.mkdtempSync(path.join(os.tmpdir(), 'pass5g-world-'));
const log = [], note = (k, v) => { log.push({ at: new Date().toISOString(), k, v }); console.log(k, typeof v === 'string' ? v : JSON.stringify(v)); };
const wait = ms => new Promise(r => setTimeout(r, ms));
let hq = await createHQ({ port: HQ_PORT, directory: dir, intervalMs: 500, cliAgents: true });
async function api(p, body) {
  const headers = { 'X-HQ-Client': 'command-center' };
  headers.Authorization = `Bearer ${(await fetch(`http://127.0.0.1:${HQ_PORT}/api/session`, { headers }).then(r => r.json())).token}`;
  const r = await fetch(`http://127.0.0.1:${HQ_PORT}${p}`, body === undefined ? { headers } : { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
const lc = id => hq.engine.state.agents[id]?.lifecycle;
const until = async (pred, ms = 60_000) => { const end = Date.now() + ms; while (Date.now() < end) { if (pred()) return true; await wait(200); } return false; };
const world = spawn(process.execPath, [path.join(here, '../serve.mjs')], { env: { ...process.env, WORLD_PORT: String(WORLD_PORT), HQ_URL: `http://127.0.0.1:${HQ_PORT}`, WORLD_GIT: '0', WORLD_STATE_DIR: worldState }, stdio: 'ignore' });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } }); const pageErrors = []; page.on('pageerror', e => pageErrors.push(e.message));
const shot = async name => { await page.screenshot({ path: path.join(out, `${name}.png`) }); note('screenshot', `${name}.png`); };
const kingdomView = async () => page.evaluate(() => { const h = window.hillinkWorld, s = h.store; return { layout: h.theme.layout.id, family: s.family, sim: h.sim === null ? null : 'present', agents: Object.values(s.world.agents).filter(a => a.lifecycle).map(a => ({ id: a.id, state: a.lifecycle.state, activity: a.activity, taskId: a.taskId })), entities: [...h.scene.entities.values()].filter(e => e.kind === 'agent').map(e => ({ id: e.ref.id, presence: e.staging?.presence, place: e.staging?.place ?? null, caption: e.staging?.caption ?? null, location: h.theme.layout.locationAt?.(e.x, e.y)?.id ?? null })), derived: [...h.scene.entities.values()].filter(e => String(e.id).startsWith('derived:')).map(e => e.id) }; });
try {
  await wait(800);
  await page.goto(`http://127.0.0.1:${WORLD_PORT}/?source=hq&theme=fantasy`); await wait(3500);
  note('layout', await page.evaluate(() => window.hillinkWorld.theme.layout.id));
  await page.evaluate(() => window.hillinkWorld.focus('overview')); await wait(900); await shot('1-kingdom-overview-live');
  // An agent HQ has never heard of before (fantasy archetype 'elf' is not in any table: it aliases to ranger), and one with no fantasy look at all.
  const scout = await api('/api/agents', { id: 'agent-5g-unknown-512', name: 'Scout 512', backend: 'local-checks', role: 'Repository inspector', team: 'Engineering', capabilities: ['inspect-repo'], appearance: { palette: { primary: '#2a9d8f' }, themes: { fantasy: { archetype: 'elf' } } } });
  const tester = await api('/api/agents', { name: 'Tester 5G', backend: 'local-checks', role: 'HQ test runner', team: 'QA', capabilities: ['verify-hq'] });
  note('created', [scout, tester].map(r => [r.status, r.body.id ?? r.body.error]));
  const ids = { scout: scout.body.id, tester: tester.body.id };
  await page.evaluate(() => window.hillinkWorld.focus('room:summoning')); await wait(400); await shot('5a-summoning-in-progress');
  note('kingdom-during-provisioning', await kingdomView());
  await until(() => ['READY', 'ERROR', 'WAITING'].includes(lc(ids.scout)?.state) && ['READY', 'ERROR', 'WAITING'].includes(lc(ids.tester)?.state));
  const pageUntil = async (fn, arg, ms = 20_000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await page.evaluate(fn, arg)) return true; await wait(100); } return false; };
  note('candidates-arrived-at-ready-zone', await pageUntil(ids => ids.every(id => { const h = window.hillinkWorld, e = h.scene.get(`agent:${id}`); return e && !e.moving && h.theme.layout.locationAt?.(e.x, e.y)?.id === 'summon-ready'; }), Object.values(ids)));
  for (const [k, id] of Object.entries(ids)) note(`lifecycle:${k}`, lc(id).history.map(h => h.state));
  await page.evaluate(() => window.hillinkWorld.focus('room:summon-ready')); await wait(900); await shot('5-summon-ready-not-active');
  note('kingdom-ready', await kingdomView());
  note('activate', await api('/api/agents/activate', { id: ids.scout }));
  await wait(3000);
  const t = await api('/api/tasks', { title: 'Inventory the repository (Pass 5G)', description: 'Pass 5G live check', operation: 'inspect-repo', safety: 'local-read-only', priority: 40, preferredAgentId: ids.scout });
  // HQ's local inventory run is shorter than one World poll, so wait for the canonical TASK_STARTED in the World log.
  note('page-saw-task-started', await pageUntil(id => window.hillinkWorld.store.world.log.some(e => e.type === 'TASK_STARTED' && e.agentId === id), ids.scout));
  await page.evaluate(id => window.hillinkWorld.focus(`agent:${id}`), ids.scout); await wait(750); await shot('6-dynamic-agent-active-fantasy');
  note('kingdom-working', await kingdomView());
  // Same state, two representations, switched repeatedly: canonical World identical, no duplicate entities.
  note('switching', await page.evaluate(async () => {
    const h = window.hillinkWorld, s = h.store, snap = () => JSON.stringify(s.world), rows = [];
    for (const id of ['real', 'fantasy', 'real', 'fantasy', 'real', 'fantasy']) {
      const before = snap(); h.setTheme(id, { keepCamera: false }); const ents = [...h.scene.entities.values()].map(e => e.id);
      rows.push({ id, layout: h.theme.layout.id, truthUnchanged: snap() === before, entities: ents.length, duplicates: ents.length - new Set(ents).size });
    }
    return rows;
  }));
  await page.evaluate(() => { window.hillinkWorld.setTheme('real'); window.hillinkWorld.focus('overview'); }); await wait(1200); await shot('2b-same-state-real');
  await page.evaluate(() => { window.hillinkWorld.setTheme('fantasy'); window.hillinkWorld.focus('overview'); }); await wait(1200); await shot('2a-same-state-fantasy');
  await until(() => hq.engine.state.tasks[t.body.id]?.stage === 'DONE', 120_000);
  const x = hq.engine.state.tasks[t.body.id]; note('task', { stage: x.stage, agentId: x.agentId, evidence: x.evidence.filter(e => ['FINDING', 'COMPLETED'].includes(e.kind)).map(e => `${e.kind}: ${e.summary}`).slice(0, 4) });
  await page.reload(); await wait(4000); note('after-reload', await kingdomView());
  await page.evaluate(id => window.hillinkWorld.focus(`agent:${id}`), ids.scout); await wait(1500); await shot('6b-after-reload');
  note('page-errors', pageErrors);
} finally {
  fs.writeFileSync(path.join(out, 'pass5g-live-results.json'), JSON.stringify(log, null, 1));
  await browser.close(); world.kill(); await hq.close();
}
