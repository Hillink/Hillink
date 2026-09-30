// Pass 5F live evidence: a real HQ (createHQ, file journal, real local-checks adapter, the Claude/Codex CLI bridges as
// installed on this machine) and the real World server + page in headless Chromium. Agents are created only through
// HQ's owner HTTP API. Nothing is simulated: every lifecycle step below is HQ's own check result.
// Usage: node tools/hillink-world/live/pass5f-live.mjs <outDir>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHQ } from '../../hillink-hq/server.mjs';

const out = path.resolve(process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'pass5f-'))); fs.mkdirSync(out, { recursive: true });
const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(path.resolve(here, '../../../node_modules/playwright/index.mjs'));
const HQ_PORT = 4399, WORLD_PORT = 4398, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass5f-hq-')), worldState = fs.mkdtempSync(path.join(os.tmpdir(), 'pass5f-world-'));
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
const worldView = async () => page.evaluate(() => { const h = window.hillinkWorld, s = h.store; return { family: s.family, sim: h.sim === null ? null : 'present', rejected: s.rejected.map(r => r.error), agents: Object.fromEntries(Object.values(s.world.agents).filter(a => a.lifecycle).map(a => [a.id, { state: a.lifecycle.state, activity: a.activity, taskId: a.taskId, name: a.name }])), entities: [...h.scene.entities.values()].filter(e => e.kind === 'agent').map(e => ({ id: e.ref.id, presence: e.staging?.presence, place: e.staging?.place ?? null, caption: e.staging?.caption ?? null })) }; });
try {
  await wait(800);
  // 14. Owner-only and validated.
  note('create-without-session', (await fetch(`http://127.0.0.1:${HQ_PORT}/api/agents`, { method: 'POST', headers: { 'X-HQ-Client': 'command-center', 'Content-Type': 'application/json' }, body: '{}' })).status);
  note('create-escalation', await api('/api/agents', { name: 'Escalator', backend: 'local-checks', role: 'r', capabilities: ['inspect-repo'], permissions: ['write-repo'] }));
  note('create-hostile-appearance', await api('/api/agents', { name: 'Hostile', backend: 'local-checks', role: 'r', capabilities: ['inspect-repo'], appearance: { palette: { primary: 'url(javascript:alert(1))' } } }));
  await page.goto(`http://127.0.0.1:${WORLD_PORT}/?source=hq&art=5d`); await wait(3000);
  // A. the unknown agent; J. a second one with a different capability and look; C. failures; a subscription reviewer.
  const scout = await api('/api/agents', { id: 'agent-5f-unknown-927', name: 'Scout 927', backend: 'local-checks', role: 'Repository inspector', team: 'Engineering', capabilities: ['inspect-repo'], appearance: { palette: { primary: '#e76f51' }, accessories: ['hardhat'], themes: { fantasy: { archetype: 'dwarf', accessories: ['helmet', 'beard'] } } } });
  const tester = await api('/api/agents', { name: 'Tester 5F', backend: 'local-checks', role: 'HQ test runner', team: 'QA', capabilities: ['verify-hq'], appearance: { palette: { primary: '#3a86ff' }, accessories: ['glasses'] } });
  const cfg = await api('/api/agents', { id: 'agent-5f-bad-model', name: 'Bad Model', backend: 'claude-cli', model: 'some-model', role: 'Reviewer', capabilities: ['review-repo'] });
  const perm = await api('/api/agents', { id: 'agent-5f-no-permission', name: 'No Permission', backend: 'local-checks', role: 'Inspector', capabilities: ['inspect-repo'], permissions: [] });
  const codex = await api('/api/agents', { id: 'agent-5f-codex-reviewer', name: 'Codex Reviewer', backend: 'codex-cli', role: 'Reviewer', capabilities: ['review-repo'] });
  const claude = await api('/api/agents', { id: 'agent-5f-claude-reviewer', name: 'Claude Reviewer', backend: 'claude-cli', role: 'Read-only reviewer', capabilities: ['review-repo'] });
  note('created', [scout, tester, cfg, perm, codex, claude].map(r => [r.status, r.body.id ?? r.body.error]));
  const ids = { scout: scout.body.id, tester: tester.body.id, cfg: cfg.body.id, perm: perm.body.id, codex: codex.body.id, claude: claude.body.id };
  await wait(1200); await shot('1-candidates-onboarding');
  note('world-during-provisioning', await worldView());
  await until(() => ['READY', 'ERROR', 'WAITING'].includes(lc(ids.scout)?.state) && ['READY', 'ERROR', 'WAITING'].includes(lc(ids.tester)?.state) && ['READY', 'ERROR', 'WAITING'].includes(lc(ids.claude)?.state));
  await wait(1500);
  for (const [k, id] of Object.entries(ids)) note(`lifecycle:${k}`, lc(id).history.map(h => `${h.state}${h.detail ? `: ${h.detail}` : ''}`));
  await shot('2-ready-and-failed');
  note('world-after-provisioning', await worldView());
  // D. activation is Kyle's.
  note('task-before-activation', await api('/api/tasks', { title: 'Too early', description: 'x', operation: 'inspect-repo', safety: 'local-read-only', priority: 50, preferredAgentId: ids.scout }));
  for (const id of [ids.scout, ids.tester]) note(`activate:${id}`, await api('/api/agents/activate', { id }));
  await wait(2500); await shot('3-activated-joined');
  // F, G. real work through HQ: a World command (capability routing) for the scout, an HQ task for the tester.
  const cmdList = await fetch(`http://127.0.0.1:${WORLD_PORT}/api/commands`).then(r => r.json());
  note('world-commandable', Object.fromEntries(Object.entries(cmdList.commandable).map(([k, v]) => [k, v.operation])));
  const cmd = await page.evaluate(async id => { const r = await fetch('/api/commands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ commandId: 'cmd-pass5f-live-1', agentId: id, instruction: 'Inventory the repository source for Pass 5F' }) }); return { status: r.status, body: await r.json() }; }, ids.scout);
  note('world-command', cmd);
  const t2 = await api('/api/tasks', { title: 'Run HQ foundation tests', description: 'Pass 5F live check', operation: 'verify-hq', safety: 'local-read-only', priority: 40, preferredAgentId: ids.tester });
  await wait(900); await shot('4-working');
  note('world-while-working', await worldView());
  await until(() => hq.engine.state.tasks[cmd.body.taskId]?.stage === 'DONE' && hq.engine.state.tasks[t2.body.id]?.stage === 'DONE', 120_000);
  for (const t of [cmd.body.taskId, t2.body.id]) { const x = hq.engine.state.tasks[t]; note(`task:${x.title}`, { stage: x.stage, agentId: x.agentId, evidence: x.evidence.filter(e => ['FINDING', 'TEST_RESULT', 'COMPLETED'].includes(e.kind)).map(e => `${e.kind}: ${e.summary}`) }); }
  await wait(4000); await shot('5-finished');
  // H. disable mid-work.
  const t3 = await api('/api/tasks', { title: 'Run HQ foundation tests again', description: 'to be interrupted', operation: 'verify-hq', safety: 'local-read-only', priority: 40, preferredAgentId: ids.tester });
  await until(() => hq.engine.state.tasks[t3.body.id]?.evidence.some(e => e.kind === 'ACK'), 20_000);
  note('disable-mid-work', await api('/api/agents/disable', { id: ids.tester }));
  const x3 = hq.engine.state.tasks[t3.body.id];
  note('interrupted-task', { stage: x3.stage, agentId: x3.agentId, preferredAgentId: x3.preferredAgentId, runTerminal: Object.values(hq.engine.state.runs).find(r => r.taskId === t3.body.id)?.terminal, testerAssignment: hq.engine.state.agents[ids.tester].assignment });
  await wait(2500); await shot('6-disabled-left');
  note('world-after-disable', await worldView());
  await until(() => hq.engine.state.tasks[t3.body.id]?.stage === 'DONE', 120_000);
  note('requeued-task-finished-by', hq.engine.state.tasks[t3.body.id].agentId);
  // I. HQ restart and World reload.
  const before = JSON.stringify({ a: hq.engine.state.agents[ids.scout], b: hq.engine.state.agents[ids.tester] }, (k, v) => (['observedAt', 'observedStatus', 'detail', 'lastMeaningfulAt', 'usage', 'retryAt'].includes(k) ? undefined : v));
  await hq.close(); note('hq', 'stopped'); await wait(1500);
  hq = await createHQ({ port: HQ_PORT, directory: dir, intervalMs: 500, cliAgents: true });
  const after = JSON.stringify({ a: hq.engine.state.agents[ids.scout], b: hq.engine.state.agents[ids.tester] }, (k, v) => (['observedAt', 'observedStatus', 'detail', 'lastMeaningfulAt', 'usage', 'retryAt'].includes(k) ? undefined : v));
  note('restart-identical-definition-and-lifecycle', before === after);
  await page.reload(); await wait(4000); await shot('7-after-restart-and-reload');
  note('world-after-restart', await worldView());
  const t4 = await api('/api/tasks', { title: 'After restart', description: 'x', operation: 'inspect-repo', safety: 'local-read-only', priority: 50, preferredAgentId: ids.scout });
  await until(() => hq.engine.state.tasks[t4.body.id]?.stage === 'DONE', 30_000);
  note('work-after-restart', { stage: hq.engine.state.tasks[t4.body.id].stage, agentId: hq.engine.state.tasks[t4.body.id].agentId });
  // K. a sim event in the live page.
  note('sim-event-in-live-page', await page.evaluate(id => { const s = window.hillinkWorld.store; s.dispatch({ v: 1, id: 'sim-x', type: 'AGENT_RETIRED', at: Date.now(), source: 'sim', agentId: id }); s.flush(); return { state: s.world.agents[id].lifecycle.state, rejected: s.rejected.at(-1)?.error }; }, ids.scout));
  note('retire', await api('/api/agents/retire', { id: ids.tester }));
  note('retired-cannot-return', await api('/api/agents/activate', { id: ids.tester }));
  note('page-errors', pageErrors);
} finally {
  fs.writeFileSync(path.join(out, 'pass5f-live-results.json'), JSON.stringify(log, null, 1));
  await browser.close(); world.kill(); await hq.close();
}
