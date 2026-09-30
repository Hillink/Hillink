// The World's physical laws (Pass 2): one unit, one reference person, and every size derived from it.
//
// Coordinates. There is exactly one logical space: the building plan in engine/iso.mjs.
//   x      along the building, left to right (world units)
//   z      depth into a room: 0 is the open cut-away front, GEOMETRY.depth the back wall (world units)
//   floor  storey index, 0 = ground
//   h      height above that floor (world units)
// projector().at(x, z, floor, h) turns a plan point into a projected world point, the camera turns that into
// screen pixels, and nothing else scales anything. Zoom, pan and the browser size change only the camera.
//
// Scale. One world unit has no fixed metre value: the reference is an adult agent, AGENT_HEIGHT units tall
// (read "1.0 person"). Every size below is a multiple of it, so a desk, a door or a car cannot drift out of
// proportion with the people who use it. The characters are stylized (big head, short legs), so furniture
// follows *their* body landmarks (hip, seat, elbow) rather than real-world centimetres.
//
// Adding an object: give it a type in SIZES. Its fixed dimensions come from here (building.mjs may not set
// them); only the dimensions listed in `free` may be authored per item, and heights in `range` must stay
// inside it. tests/spatial.test.mjs enforces this for every piece in the building.

export const AGENT_HEIGHT = 50;
const H = AGENT_HEIGHT;
const u = k => Math.round(k * H * 10) / 10; // k people -> world units

// The reference person. Body landmarks match render/figure.mjs, which reads them from here.
export const AGENT = {
  height: H,
  footprint: { w: u(0.28), d: u(0.2) }, // shoulders across, front to back: what the feet occupy on the floor
  hip: u(0.26), // standing leg length
  seat: u(0.3), // seat height the seated figure's hips rest on
  torso: u(0.3),
  reach: u(0.34), // how far in front of a surface a standing character stands to use it
  clearance: u(0.08), // gap kept between feet and a surface's front edge
  walkSpeed: u(0.9), // units per second, measured on the floor plane (never on screen)
  arriveDistance: u(0.35), // last stretch of a walk, taken at half speed
  sitSeconds: 0.48, standSeconds: 0.52,
};

// Architecture.
export const ARCH = {
  floorHeight: u(1.92), // floor to underside of the next slab: one storey
  slab: u(0.24),
  roomDepth: u(2), // front cut to back wall
  door: { h: u(1.24), minWidth: u(0.72) },
  entrance: { h: u(1.36), minWidth: u(0.8) },
  partitionWainscot: u(0.44), // solid lower band of a glass partition
  elevator: { w: u(1.16), d: u(0.96), h: u(1.3), speed: u(1.16) },
};

// The street, sized to the same people.
export const STREET_SCALE = {
  car: { length: u(2.4), width: u(0.96), height: u(0.8), body: u(0.46), wheel: u(0.14) },
  lane: u(1.8), // one lane, measured in z
  pavement: u(1.4),
  carSpeed: u(3.2), // units per second
  pedestrianSpeed: u(0.72),
};

// Furniture and fixtures, by type. w along x, d along z, h = overall height. seat / surface / back / arm are
// the landmarks characters and props line up with. `free` lists dimensions an item may author itself;
// `range` bounds natural objects (plants, trees) whose height varies.
export const SIZES = {
  desk: { w: u(0.96), d: u(0.36), h: u(0.46), surface: u(0.46) },
  officeChair: { w: u(0.28), d: u(0.26), h: u(0.58), seat: AGENT.seat },
  chair: { w: u(0.24), d: u(0.24), h: u(0.54), seat: AGENT.seat },
  couch: { w: u(1.6), d: u(0.44), h: u(0.54), seat: u(0.28), arm: u(0.38), back: u(0.14), seats: 2 },
  armchair: { w: u(0.56), d: u(0.44), h: u(0.52), seat: u(0.28), arm: u(0.38), back: u(0.12) },
  sideTable: { w: u(0.32), d: u(0.28), h: u(0.32), surface: u(0.32) },
  roundTable: { w: u(0.72), d: u(0.6), h: u(0.44), surface: u(0.44) },
  counter: { w: u(1.36), d: u(0.34), h: u(0.5), surface: u(0.5), free: ['w'] },
  coffeeMachine: { w: u(0.28), d: u(0.2), h: u(0.28) }, // sits on a counter surface
  fridge: { w: u(0.48), d: u(0.4), h: u(1.12) },
  vending: { w: u(0.5), d: u(0.44), h: u(1.12) },
  bench: { w: u(1.3), d: u(0.28), h: u(0.5), seat: u(0.28), back: u(0.08), seats: 2, free: ['w'] },
  parkBench: { w: u(0.9), d: u(0.26), h: u(0.46), seat: u(0.28), back: u(0.08), seats: 2, free: ['w'] },
  reception: { w: u(1.0), d: u(0.36), h: u(0.56), surface: u(0.56), free: ['w'] },
  serverRack: { w: u(0.4), d: u(0.4), h: u(1.16) },
  bookshelf: { w: u(0.64), d: u(0.24), h: u(1.12) },
  reviewConsole: { w: u(1.2), d: u(0.32), h: u(0.54), surface: u(0.54) },
  waterCooler: { w: u(0.28), d: u(0.28), h: u(0.8) },
  plant: { w: u(0.28), d: u(0.28), range: [u(0.7), u(1.0)] },
  tree: { w: u(0.48), d: u(0.48), range: [u(1.6), u(2.4)] },
  hedge: { h: u(0.32), free: ['w', 'd'] },
  planter: { h: u(0.32), free: ['w', 'd'] },
  lamp: { w: u(0.12), d: u(0.12), h: u(2.3) },
  monument: { h: u(0.8), free: ['w', 'd'] },
  bikeRack: { h: u(0.3), free: ['w', 'd'] },
  rug: { h: 0, free: ['w', 'd'] },
  mat: { h: 0, free: ['w', 'd'] },
  // Roof plant and signage: sized to the building, not to people.
  roofSign: { free: ['w', 'd', 'h'] },
  acUnit: { free: ['w', 'd', 'h'] },
  liftMotor: { free: ['w', 'd', 'h'] },
};

const DIMS = ['w', 'd', 'h'];
// Fill an item's fixed dimensions from its type. Authored values for fixed dimensions are an error, so a
// piece can never quietly be a different size from every other piece of its kind.
export function sized(item) {
  const s = SIZES[item.type];
  if (!s) throw Error(`scale: no SIZES entry for type "${item.type}" (${item.id})`);
  const out = { ...item };
  for (const k of DIMS) {
    const free = s.free?.includes(k) || (k === 'h' && s.range);
    if (free) { if (out[k] == null && s[k] != null) out[k] = s[k]; continue; }
    if (s[k] == null) continue;
    if (item[k] != null && item[k] !== s[k]) throw Error(`scale: ${item.id} sets ${k}=${item[k]}; a ${item.type} is ${s[k]}`);
    out[k] = s[k];
  }
  if (s.range && (out.h < s.range[0] || out.h > s.range[1])) throw Error(`scale: ${item.id} is ${out.h} tall; a ${item.type} is ${s.range[0]} to ${s.range[1]}`);
  return out;
}

// Anchors: where a character's feet go to use an object, derived from the object itself, never hand-placed.
//   seat   on the seat, facing the way the seat faces (chairs, couch and bench places)
//   stand  on the floor in front of the object's front face, facing it
// An anchor is { x, z, pose, facing, of } in plan units; `of` names the object so tests and depth can use it.
const FRONT_FACE = { front: [0, -1], back: [0, 1], left: [-1, 0], right: [1, 0] }; // outward normal of each facing
const OPPOSITE = { front: 'back', back: 'front', left: 'right', right: 'left' };
export function anchor(item, kind = 'seat', { index = 0, offset = 0 } = {}) {
  const s = SIZES[item.type] ?? {};
  if (kind === 'seat') {
    if (!s.seat) throw Error(`scale: ${item.id} (${item.type}) has no seat`);
    // A multi-place seat splits its width (inside the arms) into equal places.
    const places = s.seats ?? 1, arm = s.arm ? u(0.14) : 0, inner = item.w - 2 * arm;
    const x = places > 1 ? item.x - inner / 2 + inner * (index + 0.5) / places : item.x;
    // The hips go to the middle of the cushion, which sits in front of the backrest: half a backrest forward
    // of the item's centre, toward the way the seat faces.
    const n = FRONT_FACE[item.facing ?? 'front'], k = (s.back ?? 0) / 2;
    return { x: x + n[0] * k, z: item.z + n[1] * k, pose: 'sit', facing: item.facing ?? 'front', of: item.id, h: s.seat };
  }
  // Standing at the object's front face.
  const n = FRONT_FACE[item.facing ?? 'front'], halfDepth = n[1] ? item.d / 2 : item.w / 2;
  const out = halfDepth + AGENT.clearance + AGENT.footprint.d / 2;
  const along = n[1] ? [1, 0] : [0, 1];
  return { x: item.x + n[0] * out + along[0] * offset, z: item.z + n[1] * out + along[1] * offset, pose: 'stand', facing: OPPOSITE[item.facing ?? 'front'], of: item.id };
}
