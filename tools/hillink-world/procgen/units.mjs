// Pass 5A: canonical scale. The generator works in metres on a 0.5 m grid. Metres are not a second scale: they are
// derived from world/scale.mjs, whose reference person (AGENT_HEIGHT units) is 1.75 m tall. Every door, room,
// storey, road and vehicle below is either read from scale.mjs or computed from the person, so a generated building
// renders at exactly the size the existing characters, doors and furniture were built for.
import { AGENT, ARCH, STREET_SCALE, AGENT_HEIGHT } from '../world/scale.mjs';

export const PERSON_METRES = 1.75;
export const UNITS_PER_METRE = AGENT_HEIGHT / PERSON_METRES;
export const GRID = 0.5; // every generated plan coordinate is a multiple of this

const r2 = v => Math.round(v * 100) / 100;
export const toMetres = units => r2(units / UNITS_PER_METRE);
export const toUnits = metres => Math.round(metres * UNITS_PER_METRE * 10) / 10;
export const snap = v => Math.round(v / GRID) * GRID;
export const snapUp = v => Math.ceil(v / GRID - 1e-9) * GRID;

const person = {
  height: toMetres(AGENT.height),
  footprint: { w: toMetres(AGENT.footprint.w), d: toMetres(AGENT.footprint.d) },
  clearance: toMetres(AGENT.clearance),
  walkSpeed: toMetres(AGENT.walkSpeed), // metres per second
};
const door = { width: toMetres(ARCH.door.minWidth), height: toMetres(ARCH.door.h) };
const entrance = { width: toMetres(ARCH.entrance.minWidth), height: toMetres(ARCH.entrance.h) };
const vehicle = { length: toMetres(STREET_SCALE.car.length), width: toMetres(STREET_SCALE.car.width), height: toMetres(STREET_SCALE.car.height) };
const lane = toMetres(STREET_SCALE.lane);

export const DIMS = Object.freeze({
  person,
  door,
  entrance,
  // One storey: floor to the next floor (clear height plus slab).
  storey: toMetres(ARCH.floorHeight + ARCH.slab),
  clearHeight: toMetres(ARCH.floorHeight),
  // Two people pass in a corridor, and a door leaf plus frame fits in its side wall.
  corridor: snapUp(Math.max(2 * person.footprint.w + 4 * person.clearance, door.width + 2 * 0.25)),
  // Smallest usable room: a door, a person turning, furniture on one wall.
  room: { minSide: snapUp(Math.max(door.width + 1, 5 * person.footprint.w)), minArea: 6 },
  stairCore: { w: snapUp(door.width + 0.5), d: 4 }, // a straight flight rising one storey, plus landings
  // Pass 5B: an elevator shaft beside the stair (the car from world/scale.mjs ARCH.elevator plus running clearance).
  liftShaft: { w: snapUp(toMetres(ARCH.elevator.w) + 0.4), d: snapUp(toMetres(ARCH.elevator.d) + 0.4) },
  vehicle,
  road: { lane, width: snapUp(2 * lane), shoulder: 0.5 },
  path: { width: snapUp(2 * person.footprint.w + 0.5) },
  setback: 3, // building to parcel edge
  parcel: { min: 24, max: 48 },
});

// The check tests/pass5a.test.mjs runs: a person fits every opening and passage, a car fits its lane, and the
// metre dimensions convert back to the render units scale.mjs defines.
export function scaleReport() {
  const d = DIMS, p = d.person;
  return {
    personThroughDoor: p.height < d.door.height && p.footprint.w < d.door.width,
    personThroughEntrance: p.height < d.entrance.height && p.footprint.w < d.entrance.width,
    twoPassInCorridor: 2 * p.footprint.w < d.corridor,
    doorFitsStorey: d.door.height < d.clearHeight,
    carFitsLane: d.vehicle.width < d.road.lane,
    pathFitsTwo: 2 * p.footprint.w <= d.path.width,
    roomFitsDoorAndPerson: d.room.minSide >= d.door.width + p.footprint.w,
    roundTrip: Math.abs(toUnits(d.door.height) - ARCH.door.h) < 1 && Math.abs(toUnits(d.clearHeight) - ARCH.floorHeight) < 1 && Math.abs(toUnits(p.height) - AGENT.height) < 1,
  };
}
