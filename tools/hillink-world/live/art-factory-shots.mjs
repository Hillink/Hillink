// Art Factory Step 1 visual evidence: the World server (simulation mode) in headless Chromium, run from a checkout
// that holds a generated sheet (HQ's asset worktree). The pages only add URL flags; nothing is painted on top.
//   node tools/hillink-world/live/art-factory-shots.mjs <outDir> [worldRoot]
// worldRoot: the tools/hillink-world folder to serve (default: this one).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'art-factory-shots-')));
const worldRoot = path.resolve(process.argv[3] ?? path.join(here, '..'));
fs.mkdirSync(path.join(out, 'frames'), { recursive: true });
const { chromium } = await import(path.resolve(here, '../../../node_modules/playwright/index.mjs'));
const PORT = 4397, state = fs.mkdtempSync(path.join(os.tmpdir(), 'art-shots-world-'));
const wait = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join(worldRoot, 'serve.mjs')], { env: { ...process.env, WORLD_PORT: String(PORT), HQ_URL: 'http://127.0.0.1:1', WORLD_GIT: '0', WORLD_STATE_DIR: state }, stdio: 'ignore' });
await wait(900);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const report = { worldRoot, pages: {}, errors: [] };

async function open(name, query) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const logs = [];
  page.on('console', m => { if (/\[World\] authored/.test(m.text())) logs.push(m.text()); });
  page.on('pageerror', e => report.errors.push(`${name}: ${e.message}`));
  await page.goto(`http://127.0.0.1:${PORT}/${query}`);
  await page.waitForFunction(() => window.hillinkWorld?.authored?.ready === true, null, { timeout: 30000 });
  await wait(2500);
  report.pages[name] = { query, authored: await page.evaluate(() => { const a = window.hillinkWorld.authored; return { ...a, log: a.log.map(({ at, ...e }) => e) }; }), console: logs };
  return page;
}
// Centre on Claude at 4 screen pixels per art pixel (or k), then capture a square around him.
async function claudeShot(page, file, { k = 4, size = 360 } = {}) {
  await page.evaluate(k => { const W = window.hillinkWorld, e = W.scene.get('agent:claude'); W.camera.focusPoint(e.x, e.y - e.h / 2, { zoom: W.theme.skin.defaultZoom(1) * k / 2, duration: 0 }); }, k);
  await wait(120);
  const [x, y] = await page.evaluate(() => { const W = window.hillinkWorld, e = W.scene.get('agent:claude'), r = document.getElementById('world').getBoundingClientRect(), [sx, sy] = W.camera.worldToScreen(e.x, e.y - 12); return [r.left + sx * r.width / W.camera.width, r.top + sy * r.height / W.camera.height]; });
  const cx = Math.max(0, Math.min(1200 - size, Math.round(x - size / 2))), cy = Math.max(0, Math.min(800 - size, Math.round(y - size / 2)));
  await page.screenshot({ path: path.join(out, file), clip: { x: cx, y: cy, width: size, height: size } });
}
const claudeState = page => page.evaluate(() => { const e = window.hillinkWorld.scene.get('agent:claude'); return { moving: e.moving, anim: e.anim?.state ?? null, posture: e.posture ?? null, x: Math.round(e.x), y: Math.round(e.y) }; });

try {
  // 1. The stand-in, explicitly requested: Claude is drawn from the generated sheet.
  let p = await open('standin', '?theme=fantasy&art=px&assets=standin');
  await p.screenshot({ path: path.join(out, '01-fantasy-overview-standin.png') });
  await claudeShot(p, '02-claude-standin-idle.png');
  // Work: the simulator's "Claude starts coding" (Claude walks to the workshop and works there).
  await p.evaluate(() => window.hillinkWorld.sim.claudeCodes());
  report.pages.standin.frames = [];
  for (let i = 0; i < 70; i++) { // ~14 s: the walk, then the work loop
    await claudeShot(p, `frames/f${String(i).padStart(3, '0')}.png`, { k: 4, size: 240 });
    report.pages.standin.frames.push(await claudeState(p));
    await wait(80);
  }
  // Then the work loop once Claude has arrived (the sheet's work.hammer clip).
  await p.waitForFunction(() => !window.hillinkWorld.scene.get('agent:claude').moving, null, { timeout: 60000 }).catch(() => {});
  await wait(500);
  report.pages.standin.workFrames = [];
  fs.mkdirSync(path.join(out, 'frames-work'), { recursive: true });
  for (let i = 0; i < 24; i++) { await claudeShot(p, `frames-work/w${String(i).padStart(3, '0')}.png`, { k: 6, size: 240 }); report.pages.standin.workFrames.push(await claudeState(p)); await wait(60); }
  await claudeShot(p, '03-claude-standin-working.png');
  await p.screenshot({ path: path.join(out, '04-fantasy-standin-wide.png') });
  await p.close();
  // 2. Default policy: a candidate/stand-in is not shown without the flag; Claude falls back to the procedural dwarf.
  p = await open('default', '?theme=fantasy&art=px');
  await claudeShot(p, '05-claude-default-procedural-fallback.png');
  await p.close();
  // 3. Authored sprites off entirely (procedural debug view).
  p = await open('off', '?theme=fantasy&art=px&assets=off');
  await claudeShot(p, '06-claude-assets-off-procedural.png');
  await p.close();
  // 4. The 2x sheet (?charscale=2), if this checkout has one.
  p = await open('charscale2', '?theme=fantasy&art=px&assets=standin&charscale=2');
  await claudeShot(p, '07-claude-standin-charscale2.png');
  await p.close();
} finally {
  await browser.close(); srv.kill();
  fs.writeFileSync(path.join(out, 'shots-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ out, errors: report.errors, selected: Object.fromEntries(Object.entries(report.pages).map(([k, v]) => [k, v.authored.selected])) }, null, 1));
}
