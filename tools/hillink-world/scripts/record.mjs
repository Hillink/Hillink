// Pass 5C continuous visual evidence: records the running World as video, not stills. Drives a real headless Chrome
// (or Edge) over the DevTools protocol, collects its screencast frames with their timestamps, and has ffmpeg turn them
// into a constant-rate MP4, so what you watch is what the page actually animated, frame for frame.
//   node tools/hillink-world/scripts/record.mjs <clips.json> [outDir]
// clips.json: { base, width?, height?, fps?, clips: [{ name, path, seconds, eval?, until?, untilMs?, expect?,
//   actions?: [{ at: seconds, eval }], note? }] }
// A clip whose `until` never holds, or whose `expect` (checked at the end) is false, FAILS: its video is not kept and
// the run exits 1. notes.json records, per clip, which world was on screen and the clip's note at the end.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const [, , specFile, outArg] = process.argv;
if (!specFile) { console.error('usage: node record.mjs <clips.json> [outDir]'); process.exit(2); }
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const out = path.resolve(outArg ?? path.dirname(specFile));
fs.mkdirSync(out, { recursive: true });
const candidates = [spec.browser, process.env.CAPTURE_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome', '/opt/pw-browsers/chromium'].filter(Boolean);
const browser = candidates.find(p => fs.existsSync(p));
if (!browser) { console.error('no Chrome or Edge found (set CAPTURE_BROWSER)'); process.exit(2); }
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
if (spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status !== 0) { console.error('ffmpeg not found (set FFMPEG)'); process.exit(2); }
const W = spec.width ?? 1280, H = spec.height ?? 800, FPS = spec.fps ?? 25;
const port = 9300 + Math.floor(Math.random() * 500), profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hlw-record-'));
const proc = spawn(browser, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function devtools() {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return; } catch { /* starting */ } await sleep(250); }
  throw Error('the browser did not open its DevTools port');
}
async function page() {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(), listeners = new Map();
  ws.onmessage = m => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(Error(msg.error.message)) : res(msg.result); }
    else if (msg.method) for (const fn of listeners.get(msg.method) ?? []) fn(msg.params);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
  const on = (method, fn) => listeners.set(method, [...(listeners.get(method) ?? []), fn]);
  const once = method => new Promise(res => { const fn = p => { listeners.set(method, (listeners.get(method) ?? []).filter(x => x !== fn)); res(p); }; on(method, fn); });
  return { send, on, once, close: () => ws.close(), targetId: t.id };
}
const evaluate = async (p, expr) => { const r = await p.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };

const failures = [], notes = [];
try {
  await devtools();
  for (const clip of spec.clips) {
    const p = await page(), base = clip.base ?? spec.base;
    await p.send('Page.enable'); await p.send('Runtime.enable');
    const errors = [];
    p.on('Runtime.exceptionThrown', ev => errors.push(ev.exceptionDetails?.exception?.description ?? ev.exceptionDetails?.text));
    p.on('Runtime.consoleAPICalled', ev => { if (ev.type === 'error') errors.push(ev.args.map(x => x.value ?? x.description).join(' ')); });
    await p.send('Storage.clearDataForOrigin', { origin: new URL(base).origin, storageTypes: 'all' });
    await p.send('Emulation.setDeviceMetricsOverride', { width: clip.width ?? W, height: clip.height ?? H, deviceScaleFactor: 1, mobile: false });
    const loaded = p.once('Page.loadEventFired');
    await p.send('Page.navigate', { url: new URL(clip.path, base).href });
    await loaded; await sleep(clip.settleMs ?? 1200);
    if (clip.eval) await evaluate(p, clip.eval);
    let failed = null;
    if (clip.until) { const t0 = Date.now(); let ok = false; while (!(ok = Boolean(await evaluate(p, clip.until).catch(() => false))) && Date.now() - t0 < (clip.untilMs ?? 30000)) await sleep(100); if (!ok) failed = `prerequisite never became true: ${clip.until}`; }
    const frames = [], dir = fs.mkdtempSync(path.join(os.tmpdir(), `hlw-frames-${clip.name}-`));
    if (!failed) {
      p.on('Page.screencastFrame', f => { frames.push({ t: f.metadata.timestamp, data: f.data }); p.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
      await p.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: clip.width ?? W, maxHeight: clip.height ?? H, everyNthFrame: 1 });
      const t0 = Date.now(), actions = [...(clip.actions ?? [])].sort((a, b) => a.at - b.at);
      while (Date.now() - t0 < clip.seconds * 1000) {
        const el = (Date.now() - t0) / 1000;
        while (actions.length && actions[0].at <= el) { const a = actions.shift(); await evaluate(p, a.eval).catch(e => console.log(`  action at ${a.at}s failed: ${e.message}`)); }
        await sleep(40);
      }
      await p.send('Page.stopScreencast');
      if (clip.expect && !(await evaluate(p, clip.expect).catch(() => false))) failed = `expectation false at the end: ${clip.expect}`;
    }
    const world = await evaluate(p, 'globalThis.hillinkWorld?.worldInfo ?? null').catch(() => null);
    const note = clip.note ? await evaluate(p, clip.note).catch(e => `note failed: ${e.message}`) : null;
    if (errors.length) console.log(`  page errors in ${clip.name}: ${[...new Set(errors)].slice(0, 3).join(' | ').slice(0, 800)}`);
    if (!failed && errors.length) failed = `the page threw: ${String(errors[0]).slice(0, 200)}`;
    if (!failed && frames.length < clip.seconds * 5) failed = `only ${frames.length} frames captured in ${clip.seconds} s`;
    if (failed) { failures.push(`${clip.name}: ${failed}`); console.log(`FAILED ${clip.name}: ${failed}`); }
    else {
      // Constant frame rate from the real frame timestamps: each frame is held until the next one arrived.
      const list = [], t0 = frames[0].t;
      frames.forEach((f, i) => { const file = path.join(dir, `f${String(i).padStart(5, '0')}.jpg`); fs.writeFileSync(file, Buffer.from(f.data, 'base64')); const next = frames[i + 1]?.t ?? f.t + 1 / FPS; list.push(`file '${file.replace(/\\/g, '/')}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`); });
      list.push(`file '${path.join(dir, `f${String(frames.length - 1).padStart(5, '0')}.jpg`).replace(/\\/g, '/')}'`);
      fs.writeFileSync(path.join(dir, 'list.txt'), list.join('\n'));
      const mp4 = path.join(out, `${clip.name}.mp4`);
      const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', `fps=${FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
      if (r.status !== 0) { failures.push(`${clip.name}: ffmpeg failed`); console.log(`FAILED ${clip.name}: ffmpeg`); }
      else {
        const span = frames.at(-1).t - t0, rate = (frames.length / Math.max(0.001, span)).toFixed(1);
        const src = world ? `[world: ${world.source}${world.simulated ? ', simulated copy' : ''}, ${world.generator ?? 'hand-built'}${world.fingerprint ? ` ${String(world.fingerprint).slice(0, 12)}` : ''}]` : '[world: unknown]';
        console.log(`${clip.name}.mp4  ${span.toFixed(1)} s, ${frames.length} frames (${rate} fps captured)  ${src}${note ? `  ${typeof note === 'string' ? note : JSON.stringify(note)}` : ''}`);
        notes.push({ name: clip.name, path: clip.path, seconds: +span.toFixed(2), frames: frames.length, capturedFps: +rate, world, note });
      }
    }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
    await fetch(`http://127.0.0.1:${port}/json/close/${p.targetId}`).catch(() => {});
    p.close();
  }
  fs.writeFileSync(path.join(out, 'video-notes.json'), JSON.stringify({ base: spec.base, at: new Date().toISOString(), clips: notes, failures }, null, 2));
  if (failures.length) { console.error(`${failures.length} clip(s) failed:\n${failures.join('\n')}`); process.exitCode = 1; }
} finally {
  proc.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* the browser may still hold it */ }
}
