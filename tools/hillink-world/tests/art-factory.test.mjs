// Art Factory Step 1: authored character sheets in the pixel renderer. A sheet is validated data; the procedural
// character stays the fallback; generated sheets on disk (tools/hillink-world/assets/characters/) must load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateSheetMeta, sheetAllowed, framesFromRGBA, createAuthoredSprites, clipFor, loadAuthoredSprites, SHEET_FACINGS } from '../render/px/authored.mjs';
import { encodePNG, decodePNG } from '../render/px/png.mjs';
import { PixelBuffer, rgba } from '../render/px/buffer.mjs';
import { createWorld } from '../procgen/world.mjs';
import { renderScenario } from '../scripts/px-harness.mjs';
import { createServer, characterSheets } from '../serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CELL = [8, 10], ANCHOR = [4, 8];
// A tiny synthetic sheet: idle (2 frames) and walk (3 frames) per facing; every frame a filled 4x6 block on the anchor.
function synthetic({ status = 'candidate', standIn = true, scale = 1 } = {}) {
  const clips = { idle: 2, walk: 3 }, rows = Object.keys(clips).length * 4, cols = 3, w = CELL[0] * cols, h = CELL[1] * rows;
  const px = new PixelBuffer(w, h), meta = { v: 1, kind: 'hillink.character-sheet', agent: 'claude', theme: 'fantasy', status, standIn, scale, cell: CELL, anchor: ANCHOR, facings: SHEET_FACINGS, clips: {}, palette: ['#c08040'], sheet: { file: 'sheet.png', w, h, sha256: '' }, source: { recipe: 'synthetic' } };
  let r = 0;
  for (const [name, n] of Object.entries(clips)) {
    meta.clips[name] = { fps: 4, loop: true, frames: {} };
    for (const f of SHEET_FACINGS) {
      meta.clips[name].frames[f] = [];
      for (let i = 0; i < n; i++) { const x0 = i * CELL[0], y0 = r * CELL[1]; px.rect(x0 + 2, y0 + 3, 4, 6, rgba(192, 128 + i * 20, 64 + r)); meta.clips[name].frames[f].push([x0, y0]); }
      r++;
    }
  }
  const png = encodePNG(px, 1, 0);
  meta.sheet.sha256 = crypto.createHash('sha256').update(png).digest('hex');
  return { meta, png };
}

test('art factory: PNG decoder reads what the encoder writes (binary alpha kept)', () => {
  const b = new PixelBuffer(5, 3); b.set(1, 1, rgba(10, 20, 30)); b.set(4, 2, rgba(200, 100, 50));
  const d = decodePNG(encodePNG(b, 1, 0));
  assert.equal(d.width, 5); assert.equal(d.height, 3);
  assert.deepEqual([...d.data.subarray((1 * 5 + 1) * 4, (1 * 5 + 1) * 4 + 4)], [10, 20, 30, 255]);
  assert.equal(d.data[3], 0, 'transparent stays transparent');
  assert.throws(() => decodePNG(Buffer.from('not a png')), /not a PNG/);
});

test('art factory: sheet metadata is validated field by field; nothing executable survives', () => {
  const { meta } = synthetic();
  const v = validateSheetMeta({ ...meta, onload: 'alert(1)', script: '<script>' });
  assert.equal(v.onload, undefined); assert.equal(v.script, undefined);
  assert.deepEqual(Object.keys(v).sort(), ['agent', 'anchor', 'cell', 'clips', 'scale', 'sheet', 'source', 'standIn', 'status', 'theme']);
  const bad = [
    [{ kind: 'other' }, /v1 hillink/], [{ agent: '../x' }, /plain ids/], [{ status: 'approved' }, /stand-in can never be approved/],
    [{ anchor: [99, 1] }, /anchor/], [{ facings: ['fr'] }, /facings/], [{ sheet: { ...meta.sheet, sha256: 'x' } }, /sha256/],
    [{ clips: { walk: meta.clips.walk } }, /idle clip is required/],
    [{ clips: { ...meta.clips, walk: { ...meta.clips.walk, frames: { ...meta.clips.walk.frames, bl: [[0, 0]] } } } }, /frame count/],
    [{ clips: { ...meta.clips, idle: { ...meta.clips.idle, frames: { ...meta.clips.idle.frames, fr: [[9999, 0], [0, 0]] } } } }, /outside the sheet/],
    [{ clips: { ...meta.clips, 'x();': meta.clips.idle } }, /clip name/],
  ];
  for (const [patch, re] of bad) assert.throws(() => validateSheetMeta({ ...meta, ...patch }), re, JSON.stringify(patch).slice(0, 60));
  assert.throws(() => validateSheetMeta(meta, { expectScale: 2 }), /requested 2/, 'a 1x sheet is not used for 2x presentation');
});

test('art factory: approved art is the default; candidates and stand-ins only with ?assets=standin', () => {
  const cand = validateSheetMeta(synthetic().meta), appr = validateSheetMeta(synthetic({ status: 'approved', standIn: false }).meta);
  assert.equal(sheetAllowed(cand).ok, false);
  assert.match(sheetAllowed(cand).reason, /stand-in candidate/);
  assert.equal(sheetAllowed(cand, { allowCandidates: true }).ok, true);
  assert.equal(sheetAllowed(appr).ok, true);
});

test('art factory: frames, anchor and clip timing come from the sheet; other agents stay procedural', () => {
  const { meta, png } = synthetic(), m = validateSheetMeta(meta), img = decodePNG(png);
  const frames = framesFromRGBA(m, img.data, img.width, img.height), reg = createAuthoredSprites();
  reg.add(m, frames, 'test');
  const sp = reg.provider({ lookKey: 'claude:fantasy', facing: 'bl', clip: 'idle', clipTime: 0 });
  assert.deepEqual(sp.foot, ANCHOR); assert.equal(sp.buf.w, CELL[0]); assert.equal(sp.top, 3);
  // The bottom opaque row is the anchor row: feet on the ground point.
  const rows = [...Array(CELL[1]).keys()].filter(y => [...Array(CELL[0]).keys()].some(x => sp.buf.data[y * CELL[0] + x]));
  assert.equal(rows.at(-1), ANCHOR[1]);
  // 4 fps: frame 1 at 0.3 s, looping back to 0 at 0.5 s; walk has 3 frames.
  assert.equal(reg.provider({ lookKey: 'claude:fantasy', facing: 'fr', clip: 'idle', clipTime: 0.3 }), frames.idle.fr[1]);
  assert.equal(reg.provider({ lookKey: 'claude:fantasy', facing: 'fr', clip: 'idle', clipTime: 0.5 }), frames.idle.fr[0]);
  assert.equal(reg.provider({ lookKey: 'claude:fantasy', facing: 'fr', clip: 'walk', clipTime: 0.55 }), frames.walk.fr[2]);
  // Clips the sheet does not have map onto ones it does; unknown agents get null (procedural fallback).
  assert.equal(clipFor(frames, 'sit.idle'), 'idle'); assert.equal(clipFor(frames, 'work.hammer'), 'idle');
  assert.equal(clipFor({ ...frames, 'work.hammer': [] }, 'sit.work'), 'work.hammer');
  assert.equal(reg.provider({ lookKey: 'codex:fantasy', facing: 'fr', clip: 'idle', clipTime: 0 }), null);
  // Partial transparency is refused (the factory's output is binary).
  const soft = Uint8Array.from(img.data); soft[(3 * img.width + 3) * 4 + 3] = 128;
  assert.throws(() => framesFromRGBA(m, soft, img.width, img.height), /binary/);
});

test('art factory: the stage draws the authored sprite and falls back to the procedural one', () => {
  const world = createWorld({ seed: 'hillink' }), { meta, png } = synthetic(), m = validateSheetMeta(meta), img = decodePNG(png);
  const reg = createAuthoredSprites(); reg.add(m, framesFromRGBA(m, img.data, img.width, img.height));
  const plain = renderScenario(world, 'fantasy'), none = renderScenario(world, 'fantasy', { sprites: () => null });
  assert.deepEqual([...none.out.data], [...plain.out.data], 'a provider that returns null changes nothing (procedural fallback)');
  const asked = [];
  const authored = renderScenario(world, 'fantasy', { sprites: a => { asked.push(a.lookKey); return reg.provider({ ...a, clipTime: 0 }); } });
  assert.ok(asked.includes('claude:fantasy'), 'the stage asks the provider for Claude');
  assert.notDeepEqual([...authored.out.data], [...plain.out.data], 'Claude is drawn from the sheet');
  const colours = new Set(authored.out.data);
  assert.ok(colours.has(rgba(192, 128, 64)) || [...colours].some(c => (c & 255) > 0 && ((c >>> 8) & 255) > 0), 'sheet pixels reach the frame');
});

test('art factory: the browser loader validates, checks the sha256 and logs what it selected', async () => {
  const { meta, png } = synthetic(), files = { '/assets/characters/index.json': { sheets: [{ agent: 'claude', theme: 'fantasy', scale: 1 }, { agent: 'codex', theme: 'fantasy', scale: 2 }] }, '/assets/characters/claude/fantasy/x1/sheet.json': meta, '/assets/characters/claude/fantasy/x1/sheet.png': png };
  const fetchImpl = async url => ({ json: async () => files[url], arrayBuffer: async () => files[url].buffer.slice(files[url].byteOffset, files[url].byteOffset + files[url].length) });
  const sha256 = async b => crypto.createHash('sha256').update(b).digest('hex'), decode = async b => decodePNG(b);
  const strict = await loadAuthoredSprites(createAuthoredSprites(), { fetchImpl, decode, sha256 });
  assert.deepEqual(strict.keys(), [], 'a stand-in is not shown by default');
  assert.match(strict.log[0].reason, /assets=standin/);
  const preview = await loadAuthoredSprites(createAuthoredSprites(), { fetchImpl, decode, sha256, allowCandidates: true });
  assert.deepEqual(preview.keys(), ['claude:fantasy']);
  assert.equal(preview.log[0].selected, true);
  files['/assets/characters/claude/fantasy/x1/sheet.png'] = Buffer.concat([png, Buffer.from([0])]);
  const tampered = await loadAuthoredSprites(createAuthoredSprites(), { fetchImpl, decode, sha256, allowCandidates: true });
  assert.deepEqual(tampered.keys(), []); assert.match(tampered.log[0].reason, /sha256/);
});

test('art factory: the World server lists and serves only sheet files', async () => {
  const server = createServer({ hq: null });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const idx = await (await fetch(`${base}/assets/characters/index.json`)).json();
    assert.deepEqual(idx.sheets, characterSheets());
    for (const p of ['/assets/characters/claude/fantasy/x1/factory.py', '/assets/characters/../serve.mjs', '/assets/characters/claude/fantasy/x9/sheet.json', '/assets/characters/Claude/fantasy/x1/sheet.json']) assert.equal((await fetch(`${base}${p}`)).status, 404, p);
    for (const s of idx.sheets) {
      const r = await fetch(`${base}/assets/characters/${s.agent}/${s.theme}/x${s.scale}/sheet.png`);
      assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/png');
    }
  } finally { server.close(); }
});

// Every generated sheet in the repository loads through the World's own loader rules. HQ's Art Factory runs these
// tests in the asset worktree before committing, with HILLINK_WORLD_ASSET_CHECK naming the folder it produced.
test('art factory: generated sheets on disk are valid, untampered and anchored', () => {
  const sheets = characterSheets(), want = process.env.HILLINK_WORLD_ASSET_CHECK;
  if (want) assert.ok(sheets.some(s => want.endsWith(`assets/characters/${s.agent}/${s.theme}/x${s.scale}`)), `${want} is listed`);
  for (const s of sheets) {
    const dir = path.join(root, 'assets', 'characters', s.agent, s.theme, `x${s.scale}`);
    const m = validateSheetMeta(JSON.parse(fs.readFileSync(path.join(dir, 'sheet.json'), 'utf8')), { expectScale: s.scale });
    const png = fs.readFileSync(path.join(dir, 'sheet.png'));
    assert.equal(crypto.createHash('sha256').update(png).digest('hex'), m.sheet.sha256, `${dir}: sha256`);
    if (m.standIn) assert.equal(m.status, 'candidate', 'a stand-in is never approved');
    const img = decodePNG(png), frames = framesFromRGBA(m, img.data, img.width, img.height);
    for (const [clip, byFacing] of Object.entries(frames)) for (const f of SHEET_FACINGS) for (const fr of byFacing[f]) {
      const b = fr.buf, rows = [];
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.data[y * b.w + x]) { rows.push(y); break; }
      assert.ok(rows.length, `${clip}/${f}: frame has pixels`);
      assert.ok(Math.abs(rows.at(-1) - m.anchor[1]) <= 7 * m.scale, `${clip}/${f}: feet near the anchor (${rows.at(-1)} vs ${m.anchor[1]})`);
    }
  }
});
