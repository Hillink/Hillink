// Pass 5A: the World's compositional vocabulary. Every generated structure is an instance of one primitive. A
// future capability is built by composing these (a hangar is an outdoor-facility plus a building plus a
// transport-node), not by teaching the engine a new building. When something genuinely new is needed,
// definePrimitive() adds a word to the vocabulary at runtime; nothing else in the engine changes.
//
// Each primitive declares its layer (land, circulation, structure, space, anchor), the geometry it carries and
// whether people can stand in it (walkable). Validation is structural only: what it may contain and connect to.

const BASE = {
  // land
  terrain: { layer: 'land', geometry: 'grid' },
  district: { layer: 'land', geometry: 'rect', contains: ['parcel'] },
  parcel: { layer: 'land', geometry: 'rect', contains: ['building', 'outdoor-facility', 'courtyard', 'service-area'] },
  // circulation
  road: { layer: 'circulation', geometry: 'polyline', walkable: true, vehicles: true },
  path: { layer: 'circulation', geometry: 'polyline', walkable: true },
  hallway: { layer: 'circulation', geometry: 'rect', walkable: true },
  door: { layer: 'circulation', geometry: 'segment', walkable: true },
  staircase: { layer: 'circulation', geometry: 'rect', walkable: true, vertical: true },
  elevator: { layer: 'circulation', geometry: 'rect', walkable: true, vertical: true },
  'transport-node': { layer: 'circulation', geometry: 'point', walkable: true, vehicles: true },
  // structure
  building: { layer: 'structure', geometry: 'rect', contains: ['floor', 'wing'] },
  wing: { layer: 'structure', geometry: 'rect', contains: ['room', 'hallway'] },
  floor: { layer: 'structure', geometry: 'level', contains: ['room', 'hallway', 'staircase', 'door'] },
  // spaces (a room carries one or more space roles)
  room: { layer: 'space', geometry: 'rect', walkable: true },
  'workstation-area': { layer: 'space', geometry: 'rect', walkable: true, role: true },
  'public-area': { layer: 'space', geometry: 'rect', walkable: true, role: true },
  'secure-area': { layer: 'space', geometry: 'rect', walkable: true, role: true },
  'service-area': { layer: 'space', geometry: 'rect', walkable: true, role: true },
  courtyard: { layer: 'space', geometry: 'rect', walkable: true },
  'outdoor-facility': { layer: 'space', geometry: 'rect', walkable: true },
  // anchors: where the world can grow, and where scenery may go
  'vertical-expansion': { layer: 'anchor', geometry: 'rect' },
  'underground-expansion': { layer: 'anchor', geometry: 'rect' },
  'wing-anchor': { layer: 'anchor', geometry: 'rect' },
  'environment-anchor': { layer: 'anchor', geometry: 'point' },
};

const BUILT_IN = Object.freeze(Object.fromEntries(Object.entries(BASE).map(([k, v]) => [k, Object.freeze({ id: k, builtIn: true, ...v })])));

export const LAYERS = ['land', 'circulation', 'structure', 'space', 'anchor'];
const GEOMETRIES = ['rect', 'polyline', 'point', 'segment', 'level', 'grid'];

// The vocabulary of one world: the built-ins plus whatever that world has added (persisted with the world, so a
// reload knows every word its structures use).
export const primitive = (id, world = null) => BUILT_IN[id] ?? world?.primitives?.[id] ?? null;
export const primitives = (world = null) => [...Object.keys(BUILT_IN), ...Object.keys(world?.primitives ?? {})];

export function definePrimitive(world, id, spec) {
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(id)) throw Error(`invalid primitive id ${id}`);
  if (primitive(id, world)) throw Error(`primitive ${id} already exists`);
  if (!LAYERS.includes(spec?.layer)) throw Error(`primitive ${id} needs a layer (${LAYERS.join(', ')})`);
  if (!GEOMETRIES.includes(spec.geometry)) throw Error(`primitive ${id} needs a geometry (${GEOMETRIES.join(', ')})`);
  const p = { id, builtIn: false, layer: spec.layer, geometry: spec.geometry, ...(spec.walkable ? { walkable: true } : {}), ...(spec.vehicles ? { vehicles: true } : {}), ...(spec.contains ? { contains: [...spec.contains] } : {}) };
  world.primitives = { ...(world.primitives ?? {}), [id]: p };
  return p;
}
