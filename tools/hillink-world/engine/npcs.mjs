// Pass 5C: ambient people. Background visitors and staff who make the building feel inhabited: they arrive, walk to
// a public spot (a lobby seat, the break room, the coffee point, a spot outside), stay a while, sit if it is a seat,
// then go somewhere else, and eventually leave. Deterministic (every choice is a hash of the NPC and its trip number),
// no model calls, and staggered so nobody moves in lockstep.
//
// Truth rule: an ambient person is never an agent and never implies an operational fact. They only use public
// spots whose use is resting or waiting (never a desk, console, printer, rack or construction site), they are not in
// the roster, and they never count toward a room being "in use" (engine/world-view.mjs roomActivity reads agents
// only). They move with the same locomotion and routes as agents, so they also never cross a wall.
import { hash } from './ambience.mjs';

export const PUBLIC_USES = new Set(['wait', 'relax', 'coffee', 'snack', 'look', 'table', 'lean']);
const PUBLIC_ROOMS = new Set(['queue', 'lounge', 'plaza']);
export const NPC_LOOKS = [
  { shirt: '#8a9bb0', pants: '#3b4150', hair: '#2b2118', skin: '#e8b98f' },
  { shirt: '#b08a6a', pants: '#2f3440', hair: '#6b4a2b', skin: '#c98e62', hat: 'cap', hatColor: '#3d4a5c' },
  { shirt: '#7d9a86', pants: '#3a3a46', hair: '#141414', skin: '#8d5a3b' },
  { shirt: '#a07fa8', pants: '#34303c', hair: '#c9b27a', skin: '#f2cda8', glasses: true },
  { shirt: '#c6c9ce', pants: '#44505e', hair: '#3b2a20', skin: '#d9a57a', vest: '#ff9f1a' },
];
const FANTASY_LOOKS = [
  { shirt: '#6f7f5b', pants: '#3a2f22', hair: '#3b2a20', skin: '#e8b98f', hat: 'hood', hatColor: '#566645' },
  { shirt: '#8a6a44', pants: '#3a2f22', hair: '#c9b27a', skin: '#f2cda8' },
  { shirt: '#5b6b8a', pants: '#2f2a24', hair: '#141414', skin: '#8d5a3b', robe: true },
];

// Where ambient people may go: public stations (resting or waiting uses, in the lobby, break room or outside).
export function publicSpots(layout) {
  return Object.values(layout.stationInfo).filter(s => PUBLIC_USES.has(s.use) && PUBLIC_ROOMS.has(s.room)).map(s => ({ key: `${s.room}:${s.id}`, room: s.room, point: s.point, pose: s.pose, facing: s.facing, use: s.use }));
}

// The plan of ambient person i: when they arrive, and their n-th destination and stay (deterministic).
export function npcPlan(i, seed = 0) {
  return {
    arriveAt: 4000 + i * 9000 + hash(i * 4.1 + seed) * 6000,
    pick: (n, count) => Math.floor(hash(i * 13.7 + n * 3.9 + seed) * count),
    stayMs: n => 7000 + hash(i * 2.3 + n * 5.1 + seed) * 16000,
    tripsBeforeLeaving: 3 + Math.floor(hash(i * 6.6 + seed) * 4),
  };
}

export function lookOfNpc(i, skinId = 'real') {
  const set = skinId === 'fantasy' ? FANTASY_LOOKS : NPC_LOOKS;
  return set[i % set.length];
}
