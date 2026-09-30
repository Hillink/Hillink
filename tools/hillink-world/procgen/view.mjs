// Pass 5B: the view frame. The cutaway World is seen from one side, and that side is chosen once, canonically:
// the camera faces the founding building's entrance. In view metres, x runs left to right across the screen and z
// runs away from the camera (0 at the origin, growing into the picture). Furniture facing ('front' = toward the
// camera) is expressed in this frame, so the renderer, the navigation and the furnishing all agree on what the
// open, cut-away side of every room is.
const AXES = {
  // front: the founding building's entrance side. depth: unit vector pointing away from the camera; right: screen right.
  s: { depth: [0, -1], right: [1, 0] },
  n: { depth: [0, 1], right: [-1, 0] },
  e: { depth: [-1, 0], right: [0, -1] },
  w: { depth: [1, 0], right: [0, 1] },
};

export function viewOf(world) {
  const founding = Object.values(world.buildings).find(b => Object.values(world.capabilities).some(c => c.option === 'founding' && c.placement?.buildingId === b.id)) ?? Object.values(world.buildings)[0];
  const front = founding?.front ?? 's', a = AXES[front];
  // Origin: the founding building's front-left corner as the camera sees it, so its plan starts near (0, 0).
  const fp = founding?.footprint ?? { x: 0, y: 0, w: 0, h: 0 };
  const corners = [[fp.x, fp.y], [fp.x + fp.w, fp.y], [fp.x, fp.y + fp.h], [fp.x + fp.w, fp.y + fp.h]];
  const dot = (p, v) => p[0] * v[0] + p[1] * v[1];
  const ox = Math.min(...corners.map(p => dot(p, a.right))), oz = Math.min(...corners.map(p => dot(p, a.depth)));
  const r3 = v => Math.round(v * 1000) / 1000;
  const toView = (X, Y) => ({ x: r3(dot([X, Y], a.right) - ox), z: r3(dot([X, Y], a.depth) - oz) });
  const rectToView = r => {
    const p = [toView(r.x, r.y), toView(r.x + r.w, r.y), toView(r.x, r.y + r.h), toView(r.x + r.w, r.y + r.h)];
    const x0 = Math.min(...p.map(q => q.x)), z0 = Math.min(...p.map(q => q.z));
    return { x0, z0, x1: Math.max(...p.map(q => q.x)), z1: Math.max(...p.map(q => q.z)) };
  };
  const fromView = (x, z) => {
    // Invert the rotation: world = x*right + z*depth (+ origin terms).
    const vx = x + ox, vz = z + oz;
    return { x: r3(vx * a.right[0] + vz * a.depth[0]), y: r3(vx * a.right[1] + vz * a.depth[1]) };
  };
  return { front, axes: a, toView, rectToView, fromView };
}
