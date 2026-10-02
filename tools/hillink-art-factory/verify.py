"""Hillink Art Factory: deterministic checks on a generated character sheet. No Blender needed.

  python verify.py <dir containing sheet.json + sheet.png> [--expect-scale N]

Prints one line `HQ-ART-VERIFY <json>` and exits 0 only when every check passes:
  meta      the JSON is a hillink.character-sheet v1 with the fields the World loader reads
  sha       sheet.png matches the sha256 recorded in the JSON
  size      sheet size = cell x (rows, cols) and every frame rectangle lies inside it
  facings   every clip has all four facings with the same frame count
  alpha     binary transparency: every pixel is alpha 0 or 255, and every frame has opaque pixels
  palette   every opaque pixel is a palette colour (one palette shared by all frames)
  anchor    per clip and facing, the median lowest opaque row sits -1..4*scale px from the anchor row (the anchor is
            the centre of the soles; toes nearer the camera and the 1 px outline project a little lower); a single
            frame may step up to 7*scale px off it (a stride towards the camera); the opaque columns straddle the
            anchor x
  height    the character's on-screen height stays within 25% of the body plan's art height in idle frames
  edges     no opaque pixel touches the cell border (nothing was cut off)
"""
import argparse, hashlib, json, os, sys
import numpy as np
from PIL import Image

FACINGS = ['fr', 'fl', 'br', 'bl']


def check(d, expect_scale=None):
    out = {}
    meta = json.load(open(os.path.join(d, 'sheet.json')))
    ok_meta = (meta.get('v') == 1 and meta.get('kind') == 'hillink.character-sheet' and meta.get('facings') == FACINGS
               and isinstance(meta.get('clips'), dict) and meta.get('status') in ('candidate', 'approved')
               and (expect_scale is None or meta.get('scale') == expect_scale))
    out['meta'] = ok_meta
    raw = open(os.path.join(d, meta['sheet']['file']), 'rb').read()
    out['sha'] = hashlib.sha256(raw).hexdigest() == meta['sheet']['sha256']
    img = np.asarray(Image.open(os.path.join(d, meta['sheet']['file'])).convert('RGBA'))
    W, H = meta['cell']
    AX, AY = meta['anchor']
    s = meta['scale']
    out['size'] = img.shape[1] == meta['sheet']['w'] and img.shape[0] == meta['sheet']['h']
    a = img[..., 3]
    out['alpha'] = bool(np.isin(a, (0, 255)).all())
    pal = {tuple(int(c[k:k + 2], 16) for k in (1, 3, 5)) for c in meta['palette']}
    opaque = img[a == 255][:, :3]
    out['palette'] = all(tuple(p) in pal for p in np.unique(opaque, axis=0).tolist())
    facings_ok, anchor_ok, edges_ok, frames_ok, rects_ok = True, True, True, True, True
    idle_heights, details = [], []
    for clip, c in meta['clips'].items():
        bottoms = {}
        counts = {f: len(c['frames'].get(f, [])) for f in FACINGS}
        if len(set(counts.values())) != 1 or 0 in counts.values():
            facings_ok = False
        for f in FACINGS:
            for (x, y) in c['frames'].get(f, []):
                if x < 0 or y < 0 or x + W > img.shape[1] or y + H > img.shape[0]:
                    rects_ok = False
                    continue
                m = a[y:y + H, x:x + W] == 255
                if not m.any():
                    frames_ok = False
                    continue
                ys, xs = np.nonzero(m)
                bottom = int(ys.max())
                bottoms.setdefault(f, []).append(bottom)
                if abs(bottom - AY) > 7 * s or not (xs.min() <= AX <= xs.max()):
                    anchor_ok = False
                    details.append(f'{clip}/{f} bottom={bottom} x={xs.min()}..{xs.max()}')
                if m[0].any() or m[-1].any() or m[:, 0].any() or m[:, -1].any():
                    edges_ok = False
                if clip == 'idle':
                    idle_heights.append(int(ys.max() - ys.min() + 1))
        for f, b in bottoms.items():
            if not (-s <= float(np.median(b)) - AY <= 4 * s):
                anchor_ok = False
                details.append(f'{clip}/{f} median bottom={np.median(b)}')
    out['facings'] = facings_ok
    out['frames'] = frames_ok and rects_ok
    out['anchor'] = anchor_ok
    out['edges'] = edges_ok
    art_h = meta.get('source', {}).get('artHeight')
    out['height'] = bool(idle_heights) and bool(art_h) and all(abs(h - art_h) <= 0.25 * art_h for h in idle_heights)
    report = {'dir': os.path.abspath(d), 'ok': all(out.values()), 'checks': out, 'cell': [W, H], 'anchor': [AX, AY], 'scale': s,
              'artHeight': art_h, 'idleHeights': sorted(set(idle_heights)), 'colours': len(meta['palette']),
              'clips': {k: len(v['frames']['fr']) for k, v in meta['clips'].items()}, 'sheetSha256': meta['sheet']['sha256'], 'problems': details[:8]}
    return report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dir')
    ap.add_argument('--expect-scale', type=int, default=None)
    a = ap.parse_args()
    r = check(a.dir, a.expect_scale)
    print('HQ-ART-VERIFY ' + json.dumps(r, sort_keys=True))
    sys.exit(0 if r['ok'] else 1)


if __name__ == '__main__':
    main()
