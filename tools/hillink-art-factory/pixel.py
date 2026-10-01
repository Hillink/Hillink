"""Deterministic pixel pass: supersampled RGBA renders -> one Hillink character sheet (PNG) + metadata (JSON).

Per frame: box-downsample by the supersample factor (alpha-weighted colour), move the projected ground point onto the
cell's anchor (whole pixels), binary alpha. Across ALL frames, facings and clips: one palette (median cut), so a
colour never changes between directions. Then a 1 px outline in a fixed ink. No randomness; no clock.
Sheet layout: one row per (clip, facing), one column per frame. The JSON lists every frame's rectangle.
"""
import hashlib, json, os
import numpy as np
from PIL import Image

FACINGS = ['fr', 'fl', 'br', 'bl']


def _down(path, ss):
    a = np.asarray(Image.open(path).convert('RGBA')).astype(np.float64) / 255.0
    h, w = a.shape[0] // ss, a.shape[1] // ss
    blk = a[:h * ss, :w * ss].reshape(h, ss, w, ss, 4)
    alpha = blk[..., 3].mean(axis=(1, 3))
    wsum = blk[..., 3].sum(axis=(1, 3))[..., None]
    rgb = np.where(wsum > 0, (blk[..., :3] * blk[..., 3:4]).sum(axis=(1, 3)) / np.maximum(wsum, 1e-9), 0)
    return rgb, alpha


def _hex(c):
    return '#%02x%02x%02x' % tuple(int(v) for v in c)


def build(rendered, recipe, recipe_id, cfg, raw_dir, out_dir, scale=1):
    W, H = rendered['cell']
    AX, AY = rendered['anchor']
    ss = rendered['supersample']
    thr = cfg['pixel']['alphaThreshold']
    cells = []  # (clip, facing, index, rgb float HxWx3, mask HxW bool)
    for clip in recipe['clips']:
        for facing in FACINGS:
            for i, f in enumerate(rendered['frames'][clip][facing]):
                rgb, al = _down(os.path.join(raw_dir, f['file']), ss)
                gx, gy = f['ground'][0] / ss, f['ground'][1] / ss
                dx, dy = int(round(AX - gx)), int(round(AY - gy))
                c_rgb, c_m = np.zeros((H, W, 3)), np.zeros((H, W), bool)
                ys, xs = np.nonzero(al >= thr)
                ty, tx = ys + dy, xs + dx
                ok = (ty >= 0) & (ty < H) & (tx >= 0) & (tx < W)
                c_rgb[ty[ok], tx[ok]] = rgb[ys[ok], xs[ok]]
                c_m[ty[ok], tx[ok]] = True
                cells.append({'clip': clip, 'facing': facing, 'i': i, 'rgb': c_rgb, 'm': c_m, 'clipped': int((~ok).sum())})
    # One palette for the whole character (all frames): median cut over every opaque pixel, no dithering.
    allpx = np.concatenate([(c['rgb'][c['m']] * 255).round().astype(np.uint8) for c in cells])
    n = int(cfg['pixel']['colours'])
    q = Image.fromarray(allpx.reshape(1, -1, 3), 'RGB').quantize(colors=n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    used = sorted(set(np.asarray(q).reshape(-1).tolist()))
    pal = np.array(q.getpalette()[:max(used) * 3 + 3], np.float64).reshape(-1, 3)[used]
    ink = tuple(int(cfg['pixel']['outline'][k:k + 2], 16) for k in (1, 3, 5))
    rows = [(clip, facing) for clip in recipe['clips'] for facing in FACINGS]
    cols = max(int(c['frames']) for c in recipe['clips'].values())
    sheet = np.zeros((H * len(rows), W * cols, 4), np.uint8)
    clips_meta = {}
    for c in cells:
        o = np.zeros((H, W, 4), np.uint8)
        px = c['rgb'][c['m']] * 255
        idx = ((px[:, None, :] - pal[None]) ** 2).sum(-1).argmin(-1)
        o[c['m'], :3] = pal[idx].round().astype(np.uint8)
        o[c['m'], 3] = 255
        m = c['m']
        edge = np.zeros_like(m)
        edge[1:, :] |= m[:-1, :]; edge[:-1, :] |= m[1:, :]; edge[:, 1:] |= m[:, :-1]; edge[:, :-1] |= m[:, 1:]
        edge &= ~m
        o[edge] = (*ink, 255)
        r, col = rows.index((c['clip'], c['facing'])), c['i']
        sheet[r * H:(r + 1) * H, col * W:(col + 1) * W] = o
        cm = clips_meta.setdefault(c['clip'], {'fps': recipe['clips'][c['clip']]['fps'], 'loop': recipe['clips'][c['clip']].get('loop', True), 'frames': {f: [] for f in FACINGS}})
        cm['frames'][c['facing']].append([col * W, r * H])
    os.makedirs(out_dir, exist_ok=True)
    sheet_path, json_path = os.path.join(out_dir, 'sheet.png'), os.path.join(out_dir, 'sheet.json')
    Image.fromarray(sheet, 'RGBA').save(sheet_path, optimize=False, compress_level=9)
    digest = hashlib.sha256(open(sheet_path, 'rb').read()).hexdigest()
    meta = {
        'v': 1, 'kind': 'hillink.character-sheet', 'agent': recipe['agent'], 'theme': recipe['theme'],
        'status': recipe['status'], 'standIn': bool(recipe.get('standIn')), 'scale': scale,
        'cell': [W, H], 'anchor': [AX, AY], 'facings': FACINGS, 'clips': clips_meta,
        'sheet': {'file': 'sheet.png', 'w': int(sheet.shape[1]), 'h': int(sheet.shape[0]), 'sha256': digest},
        'palette': [_hex(c) for c in pal] + [_hex(ink)],
        'source': {'recipe': recipe_id, 'input': recipe['input'], 'blender': rendered['blender'], 'engine': rendered['engine'], 'supersample': ss,
                   'artHeight': rendered['artHeight'], 'camera': cfg['camera'], 'clippedPixels': sum(c['clipped'] for c in cells)},
    }
    json.dump(meta, open(json_path, 'w'), indent=1, sort_keys=True)
    return {'sheet': sheet_path, 'json': json_path, 'sheetSha256': digest}


def contact_sheet(raw_dir, rendered, out_path, bg=(70, 96, 70, 255)):
    """Evidence only: every raw (supersampled) render on one image."""
    files = [f['file'] for clip in rendered['frames'].values() for fac in clip.values() for f in fac]
    ims = [Image.open(os.path.join(raw_dir, f)).convert('RGBA') for f in files]
    w, h = ims[0].size
    cols = 16
    out = Image.new('RGBA', (w * cols, h * ((len(ims) + cols - 1) // cols)), bg)
    for k, im in enumerate(ims):
        out.alpha_composite(im, ((k % cols) * w, (k // cols) * h))
    out.save(out_path)
