# Pass 5A: procedural World architecture

Status: **built by Claude** on branch `claude/world-pass5a` (Kyle's Pass 5A brief in issue #12). Codex review is requested. This pass builds the generator, not the metropolis: the seed world is one small building on mostly undeveloped land.

> Build the machine, not the metropolis. The World is not a map; it is a generator.

Code: `tools/hillink-world/procgen/` (pure ESM, no dependencies, runs in Node and the browser). Tests: `tools/hillink-world/tests/pass5a.test.mjs`. Evidence: `docs/world/evidence/pass5a/` (regenerate with `node tools/hillink-world/procgen/evidence.mjs`). Inspector: `npm run world`, then open http://127.0.0.1:4320/site.html.

## 1. One canonical world, two representations

```
 HQ journal ─► activity feed (HQ contract v1) ─► contract.mjs ─┐   (only source: 'hq' may change operational facts)
                                                               ▼
 seed + founding capabilities ─► world.mjs  CANONICAL WORLD ◄── planner.mjs (where does a capability go?)
                                  land, circulation, structures, spaces, capabilities + placements,
                                  operational state (agents, tasks, objectives), anchors, history
                                        │ read only
                         ┌──────────────┴──────────────┐
                 themes.mjs 'real'              themes.mjs 'fantasy'        (labels, archetypes, materials)
                         └──────► renderers (svg.mjs plan view now; the iso renderer in 5B) ◄── camera.mjs frames
```

- `world.mjs` owns the one model: `districts`, `parcels`, `roads`, `paths`, `buildings` (levels, wings, a reserved stair core), `spaces` (rooms, hallways, stairs, outdoor facilities), `doors`, `points` (transport nodes), `anchors`, `environment` (scenery anchors), `capabilities` (spec, placement, construction status, prerequisites), `ops` (agents, tasks, objectives from HQ) and `history`.
- A theme is a pure function `represent(world, theme)`. It returns labels keyed by canonical ids and carries no geometry, so it cannot move or duplicate anything. Tests deep-freeze the world and render both themes.
- Mapping goes from specific to general: capability kind, then its traits, then its space role, then the primitive. So a kind neither theme has heard of still gets a fitting look.

| Canonical | Real | Fantasy |
|---|---|---|
| engineering | engineering workshop | forge workshop |
| meeting-space | meeting room | council chamber |
| compute-infrastructure | server room | arcane engine chamber |
| command | operations room | war room |
| review | review and test bench | assay chamber |
| founding building | startup office and workshop | outpost keep |
| road / path | road / footpath | dirt road / dirt path |
| unknown `drone-lab` (traits machines, flight) | hangar (drone lab) | aerie (drone lab) |

## 2. Procedural generation (deterministic, constraint driven)

All randomness comes from named streams: `rng(seed, 'terrain' | 'origin' | 'parcels' | 'building', id …)`. Each decision draws from its own stream, so adding a capability never shifts an earlier choice.

1. **Terrain** (`terrain.mjs`): value-noise heightfield, 512 m map on 4 m cells by default (any size, e.g. 2048 m). Water sits below the 7th percentile. Slope is computed per cell, and a cell is buildable when it is dry with slope ≤ 0.09. The terrain is regenerated from the seed and checked against a stored fingerprint.
2. **Origin and district** (`site.mjs`): the flattest dry land near the middle. A 144 m district is reserved there and split by seeded binary cuts into parcels 24–48 m on a side. Parcels stay vacant until needed.
3. **Access road**: routed by A* from the nearest map edge across a cost field (slope, water as expensive bridges, never through buildings or developed parcels). It ends on the parcel's edge, and that side becomes the building's front.
4. **Building** (`building.mjs`): designed in its own frame from the program.
   - Layout: an entry hall with a reserved stair core, a corridor spine, then left and right bands of rooms.
   - Room sizing: each room is sized from its capability's area (never under 2.5 m a side).
   - Ordering: public spaces nearest the entrance, then staff, then secure; a capability is put across the corridor from the one it wants to be near.
   - Leftover length becomes a vacant service room.
   - Seeded choices: band widths, order among equals, stair side and ties.
   - Large spaces widen their band.
5. **Doors**: every room gets a door on its corridor wall. The hall and corridor share an opening, and the entrance sits on the facade on the corridor's axis.
6. **Path**: runs from the road's end along the parcel front to the entrance.
7. **Anchors**: every building gets these growth anchors:
   - vertical expansion: the stair core, with the storeys left to add
   - underground expansion: basement levels allowed by the water table
   - rear wing anchor: its depth to the parcel's buildable edge
8. **Environment**: Poisson-style scenery anchors across the wilderness, clear of water, roads and developed land. They are anchors, not objects: a theme decides whether each is an oak or an ancient oak, a boulder or a standing stone.

## 3. Primitives (`primitives.mjs`)

These are the built-in words:
- land: terrain, district, parcel
- circulation: road, path, hallway, door, staircase, transport-node
- structure: building, wing, floor
- space roles: room, workstation-area, public-area, secure-area, service-area, courtyard, outdoor-facility
- anchors: vertical-expansion, underground-expansion, wing-anchor, environment-anchor

Every generated entity uses one of them (tested).

`addPrimitive(world, id, { layer, geometry })` adds a word when something is genuinely new. It is recorded in the world's vocabulary and history, persisted and replayed, and themes dress it with a fallback label.

## 4. Spatial planner (`planner.mjs`)

`planCapability(world, spec)` answers "where should this capability physically exist?".

**Requirements, not names.** A capability is described by what it needs, never by its name:
- `area` (m²)
- `access`: public, staff or secure
- `shareable`
- `adjacent`: kinds it wants to be near
- `level`: ground, any or below
- `outdoor`
- `vehicles`
- `traits`

**Options.** It scores every option, each either feasible with a cost or rejected with a reason:

| Option | Test |
|---|---|
| existing-room | vacant or shareable room that is big enough |
| subdivide | split spare length off a room |
| add-wing | rear wing along the corridor; must stay in the parcel, on buildable ground and clear of roads |
| add-floor | on the stair core, up to 4 storeys; no public spaces upstairs |
| add-basement | only above the water table |
| new-building | vacant parcel with a road spur, a fitting footprint, buildable ground and setbacks |
| new-district | next to the settlement; it carves a parcel big enough for the capability first |
| outdoor-plot | open land with a gate, and a transport node when vehicles are needed |

**Scoring.**
- Adjacency, public-near-entrance and secure-deep biases adjust costs.
- The cheapest feasible option wins, with ties broken by option order and then target id.
- Planning is side-effect free (trials run on clones). `applyPlan` applies exactly the plan returned.

**Construction status.**
- Applied structures are tagged with the capability as their project, with status `planned`.
- HQ moves them to under-construction, then built. A capability becomes operational only when HQ verifies it.
- A project records its prerequisites: an unfinished road it branches from, or unfinished work in the same building. It cannot be completed before them, so nothing built is ever reachable only through a plan.

## 5. Canonical scale (`units.mjs`)

The generator works in metres on a 0.5 m grid. Metres are derived from `world/scale.mjs` (one person = AGENT_HEIGHT units = 1.75 m), so generated doors and storeys convert back to exactly the render units the existing characters and furniture use.

| | Size |
|---|---|
| Person | 1.75 m tall, 0.49 × 0.35 m footprint |
| Door | 1.26 × 2.17 m |
| Entrance | 1.4 × 2.38 m |
| Storey | 3.78 m (3.36 m clear) |
| Corridor | 2 m |
| Smallest room | 2.5 m a side |
| Stair core | 2 × 4 m |
| Road | 6.5 m (3.15 m lanes) |
| Path | 1.5 m |
| Car | 4.2 × 1.68 m |

Tests check that:
- a person fits every door and passage
- a car fits its lane
- two people pass in a corridor
- every room is on the grid
- buildings are 4–40 people across

## 6. Navigation (`nav.mjs`)

The graph is derived from geometry every time the world changes, never authored or stored:
- rooms connect to door nodes
- hallways get a spine along their long axis, with each door joining where it projects
- built stair cores link consecutive levels
- road and path polylines are joined at junctions, and a path ends on its entrance door

Every edge names the one space it runs through, and both ends lie inside it, so no edge can cross a wall. `validateNav` checks this, that outdoor edges never pass through a building, that doors fit a person, and that everything built is reachable from the arrival point on the map edge. Planned structures have no nodes, so nobody walks into what HQ has not built. Routes use Dijkstra.

## 7. Camera (`camera.mjs`)

Frames come from canonical geometry:
- **world**: the whole map
- **settlement**: developed land plus a margin; it grows with the world
- **building**
- **room**
- **agent**: follow, using the space HQ says the agent is in

Zoom runs from the whole map (any size) down to about three people across the viewport. `engine/camera.mjs` (pan, zoom about a point, focus, follow) is unchanged. The inspector page uses these frames with drag to pan and wheel to zoom.

## 8. HQ → World contract (`contract.mjs`)

**Event types:**
- OBJECTIVE_CREATED
- TASK_ASSIGNED
- AGENT_WORKING
- IMPLEMENTATION_STARTED
- TESTING
- REVIEW
- BLOCKED
- WAITING_FOR_KYLE
- AGENT_IDLE
- TASK_FINISHED
- CAPABILITY_REQUESTED
- CONSTRUCTION_REQUESTED
- CONSTRUCTION_COMPLETED
- CAPABILITY_VERIFIED

**Acceptance rules.** An event is accepted only when all of these hold:
- `source: 'hq'`
- contract version 1
- a known type
- its required fields are present

Events are idempotent by id and appended to history. Renderer, simulator and malformed events are refused and change nothing (tested).

**Where agents are.** Agents are located canonically: implementing happens in the room hosting `engineering`, and testing in the room hosting `review`.

**Today's HQ feed.** `fromHqActivity` translates HQ's existing Pass 3 activity feed (`tools/hillink-hq/orchestration/activity.mjs`, contract v1), so today's facts need no HQ change. The capability and construction events are new vocabulary the World already applies; HQ does not emit them yet (see deferred).

**The rule.** Creative freedom for atmosphere; zero creative freedom for operational facts.

## 9. Persistence and determinism (`persist.mjs`)

The save is the canonical model plus its fingerprint (128-bit, stable JSON). `openWorldFile` loads it if it exists and founds it from the seed only if it does not. A reload never regenerates, and a save that does not match its fingerprint, or whose terrain would not regenerate identically, is refused. Writes are atomic (temporary file, then rename).

`replayWorld(history)` rebuilds the identical world from the founding entry plus every placement, construction report, vocabulary addition and HQ event. The World server keeps it at `~/.hillink-world/site.json` (`WORLD_SEED` chooses the seed of a new world) and serves it read-only at `GET /api/site`, same-origin only.

## 10. Open-ended expansion

Nothing caps the world:
- **Space:** districts are added next to the settlement as needed, and the map size is a parameter.
- **Buildings:** they grow wings, floors and basements.
- **Kinds:** capabilities are requirements, not a list of known kinds, so an unknown kind is placed by the same rules.
- **Vocabulary:** new primitives can be added.

The seed world uses about 1% of the map, and after seven unknown capabilities it is still under 3%.

## Proofs (tests/pass5a.test.mjs, 15 tests)

- **A. Determinism.** The same seed gives the same world, in this process and in a separate Node process, and founding order does not matter. Checked by hand as well: native Windows Node and Linux Node in WSL produce the same fingerprints, both for the seed world and after growth.
- **B. Variation.** Eight seeds give eight different valid layouts (site, front, bands, rooms, road).
- **C. Dual representation.** Real and Fantasy describe exactly the same canonical set with different looks, and a deep-frozen world is unchanged.
- **D. Scale.** Covers every door, room, corridor, road, path and building across seeds and growth.
- **E. Navigation.** From the map edge, through the front door, to every capability on eight seeds. A planned floor is unwalkable until built, then reached via the stair.
- **F. Persistence.** Save and reload give an identical world, the file seed wins over a different requested seed, replay from history works, and tampering and terrain drift are refused.
- **G. Expansion.**
  - Five capabilities unknown to the catalogue are placed with explanations, using at least three strategies including a new building and open land.
  - Existing structures are not moved (only an extended corridor and a split room change).
  - Nothing overlaps, less than 5% of the map is developed, and the whole growth replays.
- **G2.** New primitives.
- **Other tests:** the HQ contract (two tests), camera, tiny seed world, the read-only server route, a 12-seed random-growth robustness sweep, and construction order.

## Deferred to Pass 5B (intentionally not built)

- **Rendering generated sites** with the object-built iso renderer: characters walking generated routes, doors, stairs and lifts. The current dollhouse building (`world/building.mjs`) stays as today's live view until 5B moves it onto generated geometry. The plan view here is a debug inspector, not the art.
- **Visible construction stages** for planned, under-construction and built structures (the state exists; 5B draws it).
- **HQ emitting CAPABILITY_REQUESTED, CONSTRUCTION_* and CAPABILITY_VERIFIED.** The World applies them, but HQ has no capability model yet. Wiring the live `/api/hq` feed into `site.json`, which today only records what HQ sends through `applyHqEvent`, also comes later.
- **Interior furnishing** of generated rooms: workstations and furniture anchors from `world/scale.mjs` SIZES.
- **Growth options:** side wings, courtyards, and internal district streets (parcels are reached by spurs today).
- **Lifts** in stair cores.
- **Cross-country walking** off the road network.
- **Fantasy-specific generation** (walls, towers, palisades) is Pass 5E. 5A provides the theme adapter only.
