// Pass 5B visual evidence: drives a real headless Chrome (or Edge) over the DevTools protocol, with no
// dependencies (Node's built-in WebSocket and fetch), and saves screenshots of the running World.
//   node tools/hillink-world/scripts/capture.mjs <shots.json> [outDir]
// shots.json: { base: 'http://127.0.0.1:4320', browser?: '<path>', width?, height?, shots: [{ name, path, waitMs?,
//   until?: '<JS expression that becomes true>', untilMs?, eval?: '<JS run after load>', width?, height? }] }
// The World server must already be running. Every shot is a fresh page load, so each is reproducible from its URL.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const [, , specFile, outArg] = process.argv;
if (!specFile) { console.error('usage: node capture.mjs <shots.json> [outDir]'); process.exit(2); }
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const out = path.resolve(outArg ?? path.dirname(specFile));
fs.mkdirSync(out, { recursive: true });
const candidates = [spec.browser, process.env.CAPTURE_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome', '/opt/pw-browsers/chromium'].filter(Boolean);
const browser = candidates.find(p => fs.existsSync(p));
if (!browser) { console.error('no Chrome or Edge found (set CAPTURE_BROWSER)'); process.exit(2); }
const port = 9300 + Math.floor(Math.random() * 500), profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hlw-capture-'));
const proc = spawn(browser, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', `--window-size=${spec.width ?? 1400},${spec.height ?? 900}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function devtools() {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return; } catch { /* starting */ } await sleep(250); }
  throw Error('the browser did not open its DevTools port');
}
async function page() {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(), waiters = [];
  ws.onmessage = m => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(Error(msg.error.message)) : res(msg.result); }
    else if (msg.method) for (const w of waiters.filter(w => w.method === msg.method)) { waiters.splice(waiters.indexOf(w), 1); w.res(msg.params); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
  const once = method => new Promise(res => waiters.push({ method, res }));
  return { send, once, close: () => ws.close(), targetId: t.id };
}
const evaluate = async (p, expr) => { const r = await p.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };

try {
  await devtools();
  for (const shot of spec.shots) {
    const p = await page();
    await p.send('Page.enable'); await p.send('Runtime.enable');
    // Every shot starts clean: no saved simulation, camera or theme from an earlier shot.
    await p.send('Storage.clearDataForOrigin', { origin: new URL(spec.base).origin, storageTypes: 'all' });
    await p.send('Emulation.setDeviceMetricsOverride', { width: shot.width ?? spec.width ?? 1400, height: shot.height ?? spec.height ?? 900, deviceScaleFactor: 1, mobile: false });
    const loaded = p.once('Page.loadEventFired');
    await p.send('Page.navigate', { url: new URL(shot.path, spec.base).href });
    await loaded;
    await sleep(shot.settleMs ?? 1200);
    if (shot.eval) await evaluate(p, shot.eval);
    if (shot.until) { const t0 = Date.now(); while (!(await evaluate(p, shot.until)) && Date.now() - t0 < (shot.untilMs ?? 30000)) await sleep(100); }
    if (shot.waitMs) await sleep(shot.waitMs);
    if (shot.after) await evaluate(p, shot.after);
    const note = shot.note ? await evaluate(p, shot.note).catch(e => `note failed: ${e.message}`) : null;
    const { data } = await p.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(out, `${shot.name}.png`), Buffer.from(data, 'base64'));
    console.log(`${shot.name}.png${note ? `  ${typeof note === 'string' ? note : JSON.stringify(note)}` : ''}`);
    await fetch(`http://127.0.0.1:${port}/json/close/${p.targetId}`).catch(() => {});
    p.close();
  }
} finally {
  proc.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* the browser may still hold it */ }
}
