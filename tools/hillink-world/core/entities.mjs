// Pass 5E: World entity kinds. Every thing the World puts in a scene is an entity of a kind, and a kind is data: its
// scene layer, whether it can be selected, and whether it MIRRORS canonical truth (agents, tasks, systems, meetings,
// construction) or is cosmetic (ambient staff, pedestrians, occluders). A cosmetic entity can never be read as a fact.
//
// New kinds register here (defineEntityKind) and are spawned through spawnEntity, so adding one (a temporary
// subagent, a visitor, a portal, a vehicle) needs no change to the views. Renderers draw the kinds they know and skip
// the rest, so an older renderer never fails on a newer kind. Planned kinds are listed only as documentation: none is
// implemented ahead of a feature that needs it.
import { LAYERS } from '../engine/scene.mjs';

export const ENTITY_KINDS = {
  room: { layer: 'room', selectable: true, canonical: true, from: 'layout location' },
  agent: { layer: 'agent', selectable: true, canonical: true, from: 'world.agents (registry, core/agents.mjs)', anchor: 'feet' },
  task: { layer: 'task', selectable: true, canonical: true, from: 'world.tasks' },
  system: { layer: 'system', selectable: true, canonical: true, from: 'world.systems' },
  issue: { layer: 'effect', selectable: true, canonical: true, from: 'world.issues' },
  meeting: { layer: 'effect', selectable: true, canonical: true, from: 'world.meetings' },
  pass: { layer: 'furniture', selectable: true, canonical: true, from: 'world.passes (construction evidence)' },
  liftBack: { layer: 'agent', selectable: false, canonical: false, from: 'layout lift' }, liftFront: { layer: 'agent', selectable: false, canonical: false, from: 'layout lift' },
  npc: { layer: 'agent', selectable: false, canonical: false, from: 'theme scenery (pedestrians)' },
  ambient: { layer: 'agent', selectable: false, canonical: false, from: 'ambient staff (engine/npcs.mjs)' },
  occluder: { layer: 'agent', selectable: false, canonical: false, from: 'theme scenery' },
};
// Planned (documentation only): subagent, worker, visitor, vehicle, equipment, creature, security, portal, integration.
export const PLANNED_KINDS = ['subagent', 'worker', 'visitor', 'vehicle', 'equipment', 'creature', 'security', 'portal', 'integration'];

export function defineEntityKind(kind, d) {
  if (!/^[a-z][\w-]{0,39}$/i.test(kind)) throw Error(`invalid entity kind ${kind}`);
  ENTITY_KINDS[kind] = { layer: 'effect', selectable: false, canonical: false, ...d };
  return ENTITY_KINDS[kind];
}
export const entityKind = kind => ENTITY_KINDS[kind] ?? null;

// Add an entity of a registered kind to a scene: its layer and selectability come from the kind.
export function spawnEntity(scene, kind, props) {
  const k = ENTITY_KINDS[kind]; if (!k) throw Error(`unknown entity kind ${kind}: register it with defineEntityKind`);
  return scene.add({ selectable: k.selectable, ...(k.anchor ? { anchor: k.anchor } : {}), ...props, kind, layer: LAYERS[k.layer] ?? LAYERS.effect });
}
