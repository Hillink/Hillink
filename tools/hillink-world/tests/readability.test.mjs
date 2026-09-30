// Pass 2, P2: readable framing and labels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../engine/camera.mjs';
import { loadTheme } from '../themes/index.mjs';
import { placeLabel } from '../render/iso-skin.mjs';

const theme = loadTheme('real'), L = theme.layout;
function camera(insets) {
  const c = new Camera({ bounds: L.bounds, minZoom: theme.camera.minZoom, maxZoom: theme.camera.maxZoom });
  c.home = L.home; c.resize(1400, 860); c.insets = insets; return c;
}
const free = (c, [sx, sy], m = 0) => sx >= c.insets.left - m && sx <= c.width - c.insets.right + m && sy >= c.insets.top - m && sy <= c.height - c.insets.bottom + m;

test('framing: a focused agent lands in the free area, never under the right-hand panel', () => {
  const c = camera({ top: 50, right: 330, bottom: 110, left: 0 });
  for (const key of ['development:review', 'development:rig', 'plaza:site1', 'lounge:couchSeat1']) {
    const info = L.stationInfo[key]; if (!info) continue;
    c.focusPoint(info.point[0], info.point[1] - 25, { zoom: theme.camera.maxZoom * 0.6, duration: 0 });
    const p = c.worldToScreen(info.point[0], info.point[1] - 25);
    assert.ok(free(c, p), `${key} at ${p.map(Math.round)} is inside the free area`);
    assert.ok(p[0] < c.width - c.insets.right - 40, `${key} is clear of the panel`);
  }
});

test('framing: the overview frames the building and the plaza, larger than the whole street', () => {
  const c = camera({ top: 50, right: 330, bottom: 110, left: 0 });
  c.overview({ duration: 0 });
  const h = L.home;
  for (const p of [[h.x, h.y], [h.x + h.w, h.y], [h.x, h.y + h.h], [h.x + h.w, h.y + h.h]]) assert.ok(free(c, c.worldToScreen(...p), 2), 'building corners visible');
  const zHome = c.zoom; c.focusRect(L.bounds, { padding: 24, maxZoom: 10, duration: 0 });
  assert.ok(zHome > c.zoom, 'the building fills more of the view than the full street would');
  // The construction site on the plaza is part of the home framing.
  const [sx] = L.P.at(796, 40, 0, 0);
  assert.ok(sx <= h.x + h.w);
});

test('framing: review spots are clear of the partition cut end', () => {
  for (const id of ['review', 'review2', 'rig']) {
    const info = L.stationInfo[`development:${id}`];
    const [cutX] = L.P.at(380, 0, 1, 0);
    assert.ok(info.point[0] + 8 < cutX, `${id} at screen x ${Math.round(info.point[0])} is left of the partition (${Math.round(cutX)})`);
  }
});

test('labels: overlapping labels step up instead of disappearing', () => {
  const claimed = [];
  const claim = (x, y, w, h, force) => {
    const r = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
    if (!force && claimed.some(c => r[0] < c[2] && r[2] > c[0] && r[1] < c[3] && r[3] > c[1])) return false;
    claimed.push(r); return true;
  };
  const ys = [0, 1, 2].map(i => placeLabel(claim, 100 + i * 4, 50, 60, 12));
  assert.equal(new Set(ys).size, 3, 'three agents standing together get three label rows');
  for (let i = 0; i < claimed.length; i++) for (let j = i + 1; j < claimed.length; j++) {
    const a = claimed[i], b = claimed[j];
    assert.ok(!(a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]), 'no two labels overlap');
  }
});
