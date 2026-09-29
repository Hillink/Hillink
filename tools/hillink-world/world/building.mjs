// Hillink HQ, first vertical slice (Kyle's redesign directive, 2026-09-29): Break Room, Lobby hallway,
// central glass elevator, Engineering, and a small street-side plaza. Pure data, no drawing.
//
// Plan coordinates: x runs along the building (left to right), z is depth into a room (0 = the open
// cut-away front, `depth` = the back wall), `floor` counts levels from the ground. The projection in
// engine/iso.mjs turns (x, z, floor, height) into world units. Every object below is independent:
// rooms, walls, doors, furniture and interaction points are separate records the renderer and the
// navigation both read, so nothing depends on a painted image.

export const GEOMETRY = { skx: 0.5, sky: 0.4, depth: 100, height: 118, slab: 14, base: 560 };

export const FLOORS = [
  { floor: 0, name: 'Ground floor' },
  { floor: 1, name: 'Level 1' },
  { floor: 2, name: 'Roof', roof: true },
];

// Rooms are semantic places. `id` is the location id World behavior uses; `aliases` below map the
// places this slice has not built yet onto the rooms that stand in for them.
export const ROOMS = [
  { id: 'lounge', name: 'Break Room', represents: 'Idle agents between tasks, and team meetings', floor: 0, x0: 0, x1: 380, floorMat: 'wood', wall: 'lounge' },
  { id: 'queue', name: 'Lobby', represents: 'Entrance, elevator and the task board of queued work', floor: 0, x0: 400, x1: 660, floorMat: 'tile', wall: 'hall' },
  { id: 'development', name: 'Engineering', represents: 'Claude and Codex engineering work, reviews and tests', floor: 1, x0: 0, x1: 380, floorMat: 'carpet', wall: 'eng' },
  { id: 'hall', name: 'Level 1 Hallway', represents: 'Corridor between the elevator and Engineering', floor: 1, x0: 400, x1: 660, floorMat: 'tile', wall: 'hall' },
  { id: 'roof', name: 'Rooftop', represents: 'Builds and releases: the next floor under construction', floor: 2, x0: 0, x1: 660, roof: true },
  { id: 'plaza', name: 'Plaza', represents: 'Outside the front door', floor: 0, x0: 668, x1: 960, z0: -40, z1: 100, exterior: true },
];

// Semantic places not built in this slice, and the built room that stands in for each (proposed by Claude).
export const ALIASES = { command: 'queue', comms: 'lounge', archive: 'development', testing: 'development', servers: 'development', operations: 'queue', deploy: 'roof' };

// Walls. Partitions separate rooms and carry doorways; the back and outer walls enclose each floor.
// door: [z from, z to] opening, doorH: its height.
export const WALLS = [
  { id: 'part0', floor: 0, x0: 380, x1: 400, z0: 0, z1: 100, door: [8, 46], doorH: 78, kind: 'partition' },
  { id: 'part1', floor: 1, x0: 380, x1: 400, z0: 0, z1: 100, door: [8, 46], doorH: 78, kind: 'partition' },
  { id: 'east0', floor: 0, x0: 660, x1: 668, z0: 0, z1: 100, door: [12, 54], doorH: 84, kind: 'facade' },
  { id: 'east1', floor: 1, x0: 660, x1: 668, z0: 0, z1: 100, kind: 'facade' },
];

// The central glass elevator: one shaft, one car, a stop on every occupied floor.
export const ELEVATOR = { id: 'tower', x0: 500, x1: 570, z0: 42, z1: 100, car: { x: 535, z: 71, w: 58, d: 48, h: 74 }, floors: [0, 1], door: 'front' };

// Furniture and fixtures. (x, z) is the footprint centre, w along x, d along z, h tall.
// solid: characters route around it. facing: which way the object's front points.
export const FURNITURE = [
  // Break Room
  { id: 'rug', type: 'rug', floor: 0, x: 92, z: 56, w: 124, d: 30, h: 0 },
  { id: 'couch', type: 'couch', floor: 0, x: 90, z: 88, w: 100, d: 20, h: 30, facing: 'front', solid: true },
  { id: 'sideTable', type: 'sideTable', floor: 0, x: 24, z: 90, w: 20, d: 14, h: 20, solid: true },
  { id: 'armchair', type: 'armchair', floor: 0, x: 176, z: 85, w: 30, d: 20, h: 28, facing: 'front', solid: true },
  { id: 'plant0', type: 'plant', floor: 0, x: 270, z: 91, w: 14, d: 14, h: 40, solid: true },
  { id: 'counter', type: 'counter', floor: 0, x: 314, z: 92, w: 68, d: 16, h: 34, solid: true },
  { id: 'coffee', type: 'coffeeMachine', floor: 0, x: 296, z: 94, w: 14, d: 10, h: 18, on: 'counter' },
  { id: 'fridge', type: 'fridge', floor: 0, x: 364, z: 91, w: 24, d: 18, h: 78, solid: true },
  { id: 'table', type: 'roundTable', floor: 0, x: 215, z: 34, w: 34, d: 30, h: 24, solid: true },
  { id: 'chairT1', type: 'chair', floor: 0, x: 180, z: 34, w: 6, d: 12, h: 30, facing: 'right' },
  { id: 'chairT2', type: 'chair', floor: 0, x: 250, z: 34, w: 6, d: 12, h: 30, facing: 'left' },
  { id: 'chairT3', type: 'chair', floor: 0, x: 215, z: 59, w: 12, d: 5, h: 30, facing: 'front' },
  { id: 'chairT4', type: 'chair', floor: 0, x: 215, z: 7, w: 12, d: 5, h: 30, facing: 'back' },
  { id: 'vending', type: 'vending', floor: 0, x: 18, z: 30, w: 24, d: 20, h: 72, facing: 'right', solid: true },
  // Lobby
  { id: 'bench', type: 'bench', floor: 0, x: 452, z: 86, w: 70, d: 14, h: 18, facing: 'front', solid: true },
  { id: 'reception', type: 'reception', floor: 0, x: 612, z: 70, w: 50, d: 18, h: 30, facing: 'front', solid: true, system: 'platform' },
  { id: 'plant1', type: 'plant', floor: 0, x: 648, z: 92, w: 14, d: 14, h: 46, solid: true },
  { id: 'mat', type: 'mat', floor: 0, x: 646, z: 33, w: 18, d: 40, h: 0 },
  // Engineering: two rows of workstations facing the back wall, a review console, a bookshelf and the server rack.
  ...[['desk1', 76, 88], ['desk2', 156, 88], ['desk3', 236, 88], ['desk4', 40, 40], ['desk5', 116, 40], ['desk6', 192, 40]].flatMap(([id, x, z]) => [
    { id, type: 'desk', floor: 1, x, z, w: 50, d: 16, h: 26, facing: 'front', solid: true, station: id },
    { id: `${id}:chair`, type: 'officeChair', floor: 1, x, z: z - 24, w: 12, d: 4, h: 30, facing: 'back' },
  ]),
  { id: 'rack', type: 'serverRack', floor: 1, x: 14, z: 88, w: 20, d: 20, h: 74, facing: 'right', solid: true, system: 'database' },
  { id: 'shelf', type: 'bookshelf', floor: 1, x: 282, z: 93, w: 32, d: 12, h: 62, facing: 'front', solid: true },
  { id: 'console', type: 'reviewConsole', floor: 1, x: 330, z: 90, w: 60, d: 16, h: 30, facing: 'front', solid: true, system: 'tests' },
  { id: 'plant2', type: 'plant', floor: 1, x: 364, z: 92, w: 14, d: 14, h: 44, solid: true },
  // Level 1 hallway
  { id: 'cooler', type: 'waterCooler', floor: 1, x: 612, z: 90, w: 14, d: 14, h: 44, solid: true },
  { id: 'plant3', type: 'plant', floor: 1, x: 646, z: 90, w: 14, d: 14, h: 46, solid: true },
  { id: 'hallBench', type: 'bench', floor: 1, x: 452, z: 88, w: 60, d: 12, h: 18, facing: 'front', solid: true },
  // Roof
  { id: 'sign', type: 'roofSign', floor: 2, x: 180, z: 60, w: 280, d: 8, h: 44 },
  { id: 'ac1', type: 'acUnit', floor: 2, x: 40, z: 30, w: 34, d: 24, h: 22 },
  // (Pass 2) The always-on crane and scaffold are gone: a construction site exists only while a real pass is
  // being built, where its plan puts it (render/construction.mjs).
  { id: 'liftMotor', type: 'liftMotor', floor: 2, x: 535, z: 71, w: 70, d: 58, h: 26 },
  // Plaza and street (exterior)
  { id: 'tree1', type: 'tree', floor: 0, x: 812, z: 74, w: 24, d: 24, h: 96, solid: true },
  { id: 'tree2', type: 'tree', floor: 0, x: -70, z: 60, w: 24, d: 24, h: 84, solid: true },
  { id: 'hedge', type: 'hedge', floor: 0, x: -60, z: 16, w: 90, d: 14, h: 16, solid: true },
  { id: 'benchOut', type: 'parkBench', floor: 0, x: 925, z: 40, w: 44, d: 12, h: 16, facing: 'front', solid: true },
  { id: 'lamp1', type: 'lamp', floor: 0, x: 700, z: -24, w: 6, d: 6, h: 90 },
  { id: 'lamp2', type: 'lamp', floor: 0, x: 916, z: -24, w: 6, d: 6, h: 90 },
  { id: 'planter', type: 'planter', floor: 0, x: 880, z: 30, w: 40, d: 16, h: 16, solid: true },
  { id: 'monument', type: 'monument', floor: 0, x: 930, z: 84, w: 40, d: 10, h: 40, solid: true },
  { id: 'bikes', type: 'bikeRack', floor: 0, x: 870, z: 88, w: 34, d: 8, h: 14, solid: true },
];

// Wall-mounted pieces (drawn on the back wall; not obstacles).
export const WALL_DECOR = [
  { id: 'window0', type: 'window', floor: 0, x0: 202, x1: 266, h0: 26, h1: 70 },
  { id: 'poster0', type: 'poster', floor: 0, x0: 60, x1: 118, h0: 36, h1: 64, text: 'HILLINK' },
  { id: 'clock0', type: 'clock', floor: 0, x0: 318, x1: 334, h0: 54, h1: 68 },
  { id: 'taskBoard', type: 'taskBoard', floor: 0, x0: 410, x1: 494, h0: 22, h1: 70 },
  { id: 'lobbyScreen', type: 'statusScreen', floor: 0, x0: 590, x1: 640, h0: 40, h1: 66 },
  { id: 'codeWall', type: 'codeWall', floor: 1, x0: 86, x1: 188, h0: 30, h1: 70 },
  { id: 'window1', type: 'window', floor: 1, x0: 196, x1: 244, h0: 26, h1: 70 },
  { id: 'whiteboard', type: 'whiteboard', floor: 1, x0: 414, x1: 490, h0: 28, h1: 64 },
  { id: 'window2', type: 'window', floor: 1, x0: 584, x1: 640, h0: 26, h1: 70 },
  { id: 'logo1', type: 'logo', floor: 1, x0: 290, x1: 372, h0: 50, h1: 70 },
];

// Interaction points: where a character stands or sits, which way it faces, and what it is for.
// via: the navigation node it is reached from (walking between the two never crosses furniture).
export const POINTS = [
  // Break Room: idle spots and the meeting table.
  { id: 'couchSeat1', room: 'lounge', x: 72, z: 76, pose: 'sit', facing: 'front', use: 'relax', via: 'b72' },
  { id: 'couchSeat2', room: 'lounge', x: 108, z: 76, pose: 'sit', facing: 'front', use: 'relax', via: 'b108' },
  { id: 'chair', room: 'lounge', x: 176, z: 73, pose: 'sit', facing: 'front', use: 'relax', via: 'b176' },
  { id: 'window', room: 'lounge', x: 234, z: 84, pose: 'stand', facing: 'back', use: 'look', via: 'b234' },
  { id: 'coffeeMachine', room: 'lounge', x: 296, z: 78, pose: 'stand', facing: 'back', use: 'coffee', via: 'b296' },
  { id: 'counter', room: 'lounge', x: 334, z: 78, pose: 'stand', facing: 'back', use: 'snack', via: 'b334' },
  { id: 'tableSeat1', room: 'lounge', x: 186, z: 34, pose: 'sit', facing: 'right', use: 'table', via: 'b186' },
  { id: 'tableSeat2', room: 'lounge', x: 244, z: 34, pose: 'sit', facing: 'left', use: 'table', via: 'b244' },
  { id: 'tableSeat3', room: 'lounge', x: 215, z: 54, pose: 'sit', facing: 'front', use: 'table', via: 'b215' },
  { id: 'tableSeat4', room: 'lounge', x: 215, z: 11, pose: 'sit', facing: 'back', use: 'table', via: 'bf150' },
  { id: 'vendingSpot', room: 'lounge', x: 42, z: 30, pose: 'stand', facing: 'left', use: 'snack', via: 'bl42' },
  { id: 'door', room: 'lounge', x: 352, z: 30, pose: 'stand', facing: 'right', use: 'lean', via: 'bdoor' },
  // Lobby: the waiting bench and standing spots by reception.
  { id: 'wait1', room: 'queue', x: 436, z: 76, pose: 'sit', facing: 'front', use: 'wait', via: 'lL' },
  { id: 'wait2', room: 'queue', x: 468, z: 76, pose: 'sit', facing: 'front', use: 'wait', via: 'lL' },
  { id: 'wait3', room: 'queue', x: 596, z: 46, pose: 'stand', facing: 'back', use: 'wait', via: 'lR' },
  { id: 'wait4', room: 'queue', x: 628, z: 46, pose: 'stand', facing: 'back', use: 'wait', via: 'lR' },
  // Engineering: six workstations, the review console, the bookshelf.
  { id: 'desk1', room: 'development', x: 76, z: 70, pose: 'sit', facing: 'back', use: 'work', desk: 'desk1', via: 'ea76' },
  { id: 'desk2', room: 'development', x: 156, z: 70, pose: 'sit', facing: 'back', use: 'work', desk: 'desk2', via: 'ea156' },
  { id: 'desk3', room: 'development', x: 236, z: 70, pose: 'sit', facing: 'back', use: 'work', desk: 'desk3', via: 'ea236' },
  { id: 'desk4', room: 'development', x: 40, z: 22, pose: 'sit', facing: 'back', use: 'work', desk: 'desk4', via: 'ef40' },
  { id: 'desk5', room: 'development', x: 116, z: 22, pose: 'sit', facing: 'back', use: 'work', desk: 'desk5', via: 'ef116' },
  { id: 'desk6', room: 'development', x: 192, z: 22, pose: 'sit', facing: 'back', use: 'work', desk: 'desk6', via: 'ef192' },
  // Review spots sit left of x 320 so the partition's cut end (x 380 to 400) never hides the reviewer (Pass 2).
  { id: 'review', room: 'development', x: 312, z: 70, pose: 'stand', facing: 'back', use: 'inspect', desk: 'console', via: 'erv' },
  { id: 'review2', room: 'development', x: 290, z: 64, pose: 'stand', facing: 'back', use: 'inspect', desk: 'console', via: 'erv' },
  { id: 'rig', room: 'development', x: 334, z: 56, pose: 'stand', facing: 'back', use: 'inspect', desk: 'console', via: 'erv' },
  { id: 'shelf', room: 'development', x: 282, z: 76, pose: 'stand', facing: 'back', use: 'read', via: 'ea276' },
  // Plaza: where builders stand to work on a construction site east of the entrance (Pass 2's annex).
  { id: 'site1', room: 'plaza', x: 716, z: 26, pose: 'stand', facing: 'back', use: 'build', via: 'p2' },
  { id: 'site2', room: 'plaza', x: 770, z: 26, pose: 'stand', facing: 'back', use: 'inspect', via: 'p2' },
];

// Navigation graph: walkable nodes per floor and the edges between them (all edges stay on floor
// and clear of solid furniture; tests check it). Elevator stops are nodes listed in `lift`.
export const NAV = {
  nodes: {
    // Break Room: back aisle (z 62), left column and front aisle, and the doorway.
    b40: [0, 40, 62], b72: [0, 72, 62], b108: [0, 108, 62], b150: [0, 150, 62], b176: [0, 176, 62], b186: [0, 186, 62], b215: [0, 215, 64], b234: [0, 234, 64], b244: [0, 244, 62], b296: [0, 296, 62], b334: [0, 334, 62], bdoor: [0, 356, 44],
    bf150: [0, 150, 11], bl42: [0, 60, 36], bf300: [0, 300, 12],
    d0w: [0, 370, 27], d0e: [0, 410, 27],
    // Lobby.
    lL: [0, 452, 30], lift0: [0, 535, 22], lR: [0, 604, 28], ent: [0, 654, 33],
    // Plaza (outside the entrance).
    p1: [0, 690, 33], p2: [0, 740, 2], p3: [0, 850, 2],
    // Engineering: back aisle (z 55), front aisle (z 6), side columns, review corner, doorway.
    ea12: [1, 12, 55], ea76: [1, 76, 55], ea156: [1, 156, 55], ea236: [1, 236, 55], ea276: [1, 276, 55],
    ef6: [1, 6, 6], ef40: [1, 40, 6], ef116: [1, 116, 6], ef192: [1, 192, 6], ef276: [1, 276, 6],
    erv: [1, 330, 46], d1w: [1, 370, 27], d1e: [1, 410, 27],
    // Level 1 hallway.
    hL: [1, 452, 30], lift1: [1, 535, 22], hR: [1, 604, 30],
  },
  edges: [
    ['b40', 'b72'], ['b72', 'b108'], ['b108', 'b150'], ['b150', 'b176'], ['b176', 'b186'], ['b186', 'b215'], ['b215', 'b234'], ['b234', 'b244'], ['b244', 'b296'], ['b296', 'b334'], ['b334', 'bdoor'],
    ['b150', 'bf150'], ['bf150', 'tableSeat4'], ['tableSeat4', 'bf300'], ['bf300', 'bdoor'], ['b40', 'bl42'], ['bl42', 'bf150'],
    ['bdoor', 'd0w'], ['d0w', 'd0e'], ['d0e', 'lL'], ['lL', 'lift0'], ['lift0', 'lR'], ['lR', 'ent'], ['ent', 'p1'], ['p1', 'p2'], ['p2', 'p3'],
    ['ea12', 'ea76'], ['ea76', 'ea156'], ['ea156', 'ea236'], ['ea236', 'ea276'], ['ea12', 'ef6'], ['ef6', 'ef40'], ['ef40', 'ef116'], ['ef116', 'ef192'], ['ef192', 'ef276'], ['ef276', 'ea276'],
    ['ea276', 'erv'], ['erv', 'd1w'], ['ef276', 'd1w'], ['d1w', 'd1e'], ['d1e', 'hL'], ['hL', 'lift1'], ['lift1', 'hR'],
    ['lift0', 'lift1'],
  ],
  lift: { tower: ['lift0', 'lift1'] },
};

// Where World behavior sends each activity in this building (brief: rooms react only to real work).
export const PLACES = {
  coding: { location: 'development', stations: ['desk5', 'desk6', 'desk4', 'desk2', 'desk3', 'desk1'] },
  thinking: { location: 'development', stations: ['desk5', 'desk6', 'desk4', 'desk2', 'desk3', 'desk1'] },
  reviewing: { location: 'development', stations: ['review', 'review2', 'rig'] },
  testing: { location: 'development', stations: ['rig', 'review2', 'review'] },
  researching: { location: 'development', stations: ['shelf', 'desk2', 'desk3'] },
  communicating: { location: 'lounge', stations: ['tableSeat1', 'tableSeat2', 'tableSeat3', 'tableSeat4', 'couchSeat1', 'couchSeat2'] },
  waiting: { location: 'queue', stations: ['wait1', 'wait2', 'wait3', 'wait4'] },
  idle: { location: 'lounge', stations: ['couchSeat1', 'coffeeMachine', 'chair', 'window', 'tableSeat3', 'counter', 'couchSeat2', 'vendingSpot', 'door', 'tableSeat1', 'tableSeat2'] },
  offline: { location: 'lounge', stations: ['couchSeat2', 'couchSeat1', 'chair', 'tableSeat4', 'tableSeat2', 'tableSeat1', 'vendingSpot', 'door'] },
};

// Ambient life outside (not Hillink data): cars on the street, a couple of pedestrians on the pavement.
export const STREET = {
  road: { z0: -92, z1: -44, x0: -240, x1: 1040 },
  pavement: { z0: -44, z1: 0 },
  lanes: [{ z: -58, dir: 1, speed: 70, every: 9, chance: 0.7 }, { z: -80, dir: -1, speed: 62, every: 11, chance: 0.65 }],
  walkers: [{ z: -16, x0: -200, x1: 1000, speed: 22, pause: 4 }, { z: -30, x0: 980, x1: -160, speed: 18, pause: 6 }],
};
