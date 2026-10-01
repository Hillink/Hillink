// Art Factory Step 1: authored character sprites for the pixel renderer (art 'px'). A sheet is DATA produced by
// tools/hillink-art-factory (sheet.png + sheet.json), never code: the JSON is validated field by field, the PNG is
// checked against the sha256 the JSON records, and frames are cut only at rectangles the JSON lists inside the image.
//
// Selection policy: a sheet whose status is 'approved' is used by default; a 'candidate' (and every stand-in, which
// can never be approved) is used only when the page asks for it (?assets=standin). Anything missing, invalid or not
// allowed falls back to the procedural character (render/px/character.mjs), which stays the fallback and debug view.
// Scale: a sheet is drawn at its own pixels. ?charscale=N asks for the x<N> sheet, so 1x and 2x presentation can be
// compared without rebuilding anything.
import { PixelBuffer } from './buffer.mjs';

export const SHEET_KIND = 'hillink.character-sheet';
export const SHEET_FACINGS = ['fr', 'fl', 'br', 'bl'];
const ID = /^[a-z0-9-]{1,40}$/, CLIP = /^[a-z]+(\.[a-z]+)?$/, HEXC = /^#[0-9a-f]{6}$/;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// Throws on anything that is not a well-formed v1 sheet; returns a clean copy (only the fields the World reads).
export function validateSheetMeta(meta, { expectScale = null } = {}) {
  const fail = why => { throw Error(`Invalid character sheet: ${why}`); };
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) fail('not an object');
  if (meta.v !== 1 || meta.kind !== SHEET_KIND) fail('not a v1 hillink.character-sheet');
  if (!ID.test(meta.agent ?? '') || !ID.test(meta.theme ?? '')) fail('agent/theme must be plain ids');
  if (!['candidate', 'approved'].includes(meta.status)) fail('status must be candidate or approved');
  if (meta.standIn === true && meta.status !== 'candidate') fail('a stand-in can never be approved art');
  if (!int(meta.scale, 1, 4) || (expectScale != null && meta.scale !== expectScale)) fail(`scale ${meta.scale} is not the requested ${expectScale}`);
  const [w, h] = meta.cell ?? [], [ax, ay] = meta.anchor ?? [];
  if (!int(w, 4, 256) || !int(h, 4, 256)) fail('cell size');
  if (!int(ax, 0, w - 1) || !int(ay, 0, h - 1)) fail('anchor must lie inside the cell');
  if (JSON.stringify(meta.facings) !== JSON.stringify(SHEET_FACINGS)) fail('facings must be fr, fl, br, bl');
  const s = meta.sheet ?? {};
  if (s.file !== 'sheet.png' || !int(s.w, 1, 8192) || !int(s.h, 1, 8192) || !/^[0-9a-f]{64}$/.test(s.sha256 ?? '')) fail('sheet file, size or sha256');
  if (!meta.clips || typeof meta.clips !== 'object' || Array.isArray(meta.clips)) fail('clips');
  const clips = {};
  for (const [name, c] of Object.entries(meta.clips)) {
    if (!CLIP.test(name)) fail(`clip name ${String(name).slice(0, 30)}`);
    if (!(typeof c?.fps === 'number' && c.fps > 0 && c.fps <= 30) || typeof c.loop !== 'boolean') fail(`clip ${name} fps/loop`);
    const frames = {};
    let n = null;
    for (const f of SHEET_FACINGS) {
      const list = c.frames?.[f];
      if (!Array.isArray(list) || !list.length || list.length > 64) fail(`clip ${name} facing ${f}`);
      if (n != null && list.length !== n) fail(`clip ${name}: facings differ in frame count`);
      n = list.length;
      frames[f] = list.map(r => { if (!Array.isArray(r) || !int(r[0], 0, s.w - w) || !int(r[1], 0, s.h - h)) fail(`clip ${name} frame rectangle outside the sheet`); return [r[0], r[1]]; });
    }
    clips[name] = { fps: c.fps, loop: c.loop, frames };
  }
  if (!clips.idle) fail('an idle clip is required');
  if (Array.isArray(meta.palette) && meta.palette.some(p => !HEXC.test(p))) fail('palette');
  return { agent: meta.agent, theme: meta.theme, status: meta.status, standIn: meta.standIn === true, scale: meta.scale, cell: [w, h], anchor: [ax, ay], clips, sheet: { w: s.w, h: s.h, sha256: s.sha256 }, source: { recipe: String(meta.source?.recipe ?? '').slice(0, 40) } };
}

// Whether the page may show this sheet. Approved art is the default; candidates and stand-ins need ?assets=standin.
export function sheetAllowed(meta, { allowCandidates = false } = {}) {
  if (meta.status === 'approved' && !meta.standIn) return { ok: true, reason: 'approved' };
  return allowCandidates ? { ok: true, reason: `${meta.standIn ? 'stand-in ' : ''}candidate shown because ?assets=standin` } : { ok: false, reason: `${meta.standIn ? 'stand-in ' : ''}candidate (add ?assets=standin to preview it)` };
}

// RGBA bytes (row-major, width meta.sheet.w) -> PixelBuffers per clip and facing. Transparency must be binary.
export function framesFromRGBA(meta, rgba, w, h) {
  if (w !== meta.sheet.w || h !== meta.sheet.h || rgba.length !== w * h * 4) throw Error('sheet image size does not match its metadata');
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 0 && rgba[i] !== 255) throw Error('sheet transparency is not binary');
  const [cw, ch] = meta.cell, out = {};
  for (const [name, c] of Object.entries(meta.clips)) {
    out[name] = {};
    for (const f of SHEET_FACINGS) out[name][f] = c.frames[f].map(([x0, y0]) => {
      const b = new PixelBuffer(cw, ch);
      let top = ch;
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const o = ((y0 + y) * w + x0 + x) * 4;
        if (rgba[o + 3] === 255) { b.data[y * cw + x] = ((255 << 24) | (rgba[o + 2] << 16) | (rgba[o + 1] << 8) | rgba[o]) >>> 0; if (y < top) top = y; }
      }
      return { buf: b, foot: [...meta.anchor], top, light: [] };
    });
  }
  return out;
}

// The procedural clip names the World asks for -> the clip an authored sheet provides.
export function clipFor(sheetClips, clip) {
  if (sheetClips[clip]) return clip;
  if (/^sit\.work|^work\./.test(clip)) { const w = Object.keys(sheetClips).find(k => k.startsWith('work.')); if (w) return w; }
  if (clip === 'walk' && sheetClips.walk) return 'walk';
  return 'idle';
}

// The registry the stage asks: provider(actor) returns an authored sprite or null (null = procedural fallback).
export function createAuthoredSprites() {
  const sheets = new Map(); // lookKey "<agent>:<theme>" -> { meta, frames }
  const log = [];
  return {
    log,
    add(meta, frames, why = '') { sheets.set(`${meta.agent}:${meta.theme}`, { meta, frames }); log.push({ at: Date.now(), agent: meta.agent, theme: meta.theme, scale: meta.scale, status: meta.status, standIn: meta.standIn, selected: true, reason: why }); },
    reject(entry, reason) { log.push({ at: Date.now(), ...entry, selected: false, reason: String(reason).slice(0, 200) }); },
    has: lookKey => sheets.has(lookKey),
    keys: () => [...sheets.keys()],
    provider(actor) {
      const s = sheets.get(actor.lookKey); if (!s) return null;
      const name = clipFor(s.frames, actor.clip ?? 'idle'), c = s.meta.clips[name], list = s.frames[name]?.[actor.facing] ?? s.frames[name]?.fr;
      if (!list?.length) return null;
      const t = Math.max(0, actor.clipTime ?? 0), i = Math.floor(t * c.fps);
      return list[c.loop ? i % list.length : Math.min(i, list.length - 1)];
    },
  };
}

// Browser loader: the asset index from the World server, then each allowed sheet. Every failure is logged and leaves
// that agent on the procedural character.
export async function loadAuthoredSprites(registry, { fetchImpl = fetch, decode, allowCandidates = false, scale = 1, sha256 } = {}) {
  let index = [];
  try { index = (await (await fetchImpl('/assets/characters/index.json')).json()).sheets ?? []; } catch (error) { registry.reject({ agent: null, theme: null, scale }, `asset index unavailable: ${error.message}`); return registry; }
  for (const e of index) {
    if (!ID.test(e?.agent ?? '') || !ID.test(e?.theme ?? '') || e.scale !== scale) continue;
    const base = `/assets/characters/${e.agent}/${e.theme}/x${scale}`;
    try {
      const meta = validateSheetMeta(await (await fetchImpl(`${base}/sheet.json`)).json(), { expectScale: scale });
      if (meta.agent !== e.agent || meta.theme !== e.theme) throw Error('sheet agent/theme do not match its folder');
      const allowed = sheetAllowed(meta, { allowCandidates });
      if (!allowed.ok) { registry.reject({ agent: e.agent, theme: e.theme, scale, status: meta.status, standIn: meta.standIn }, allowed.reason); continue; }
      const bytes = new Uint8Array(await (await fetchImpl(`${base}/sheet.png`)).arrayBuffer());
      if (sha256 && (await sha256(bytes)) !== meta.sheet.sha256) throw Error('sheet.png does not match the sha256 in sheet.json');
      const img = await decode(bytes);
      registry.add(meta, framesFromRGBA(meta, img.data, img.width, img.height), allowed.reason);
    } catch (error) { registry.reject({ agent: e.agent, theme: e.theme, scale }, error.message); }
  }
  return registry;
}
