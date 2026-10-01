# HILLINK ART DIRECTION SPEC — DRAFT 1

Status: **draft for Kyle/ChatGPT review. Nothing in it is implemented.** Written 2026-10-01 on `claude/world-5h`, in
answer to "PASS 5H — ITERATION 2" (Kyle, 2026-10-01 00:06Z).

References are stored in `docs/world/references/pass5h-iter2/` (ref1–ref4). The 5H iteration 1 evidence it is compared
against is in `docs/world/evidence/pass5h/`.

Every rule carries one of these labels:
- **[Kyle]** confirmed by Kyle, either in the Iteration 2 brief or in an earlier decision
- **[ref N]** observed in a reference image
- **[proposed]** an agent proposal, open to change
- **[open]** an unresolved question, also listed in §24 and §25

Numbers marked [proposed] are starting points for the vertical slice, not final values.

---

## Reference analysis

### REFERENCE 1: side-view cutaway HQ at dusk (`ref1-side-hq-a.png`)
Applies to: Real, terrain, architecture, props, lighting, construction, atmosphere and scale. It does **not** apply to
the camera.

USE:
- Rooms read by contents alone. Even without the labels, the servers room is racks plus blue LEDs, the workshop is a
  drafting table with pinned plans, and the planning room has a world map and a desk with two monitors.
- Every wall carries information: shelves, maps, framed pictures, pinned papers, lamps, plants, cables and pipes.
- Warm, local light. Each room has 2–4 warm lamp pools, and light falls off into darker corners. Light makes the room;
  ambient fill does not.
- The building is part of the terrain. It is cut into a hillside, with roots, grass overhangs, cave pockets below, a
  waterfront dock and stairs that follow the slope.
- Visible structure: thick floor slabs, timber beams, stone footings, stairs between floors, ladders and scaffolding.
- Growth is legible. An "Under Construction" wing with a timber frame, scaffold, ladders and workers sits beside the
  finished building.
- Rooftop infrastructure: antennas, a lattice mast and a satellite dish. Communications infrastructure is shown as
  objects.
- Atmosphere: a dusk sky, layered mountain silhouettes, a distant castle and water reflections.

DO NOT COPY:
- The side-view camera. Kyle has confirmed Hillink keeps its fixed 2.5D isometric camera.
- Terraria's block-terrain look and 16×16 tile grid, or any recognizable Terraria assets, NPCs or UI.
- The specific room list. In particular, a Gym is not justified by any Hillink capability; see §25 C8.
- The "HILINK HQ" sign spelling. The brand is **Hillink**.
- Generic NPC hardhat workers as a crowd. See §25 C7.

HILLINK APPLICATION:
- This is the main reference for **interior density, lighting and terrain integration** in Real HQ, translated to the
  isometric camera.
- The construction wing becomes the model for the "frame + scaffold + workers" stages in §17.

### REFERENCE 2: side-view cutaway HQ, variant (`ref2-side-hq-b.png`)
Applies to: Real, terrain, props, ambient life and atmosphere.

USE:
- Everything from Reference 1, with more ambient life.
- Small animals: a rabbit and a bird.
- Someone fishing off the dock.
- Under the ground: a crystal vein, a mine with a pickaxe worker, and a chest.
- Fire in a hearth, banners, a red sofa in the lounge, crates stacked on the roof and sunflowers.
- Heavier vegetation: hanging vines, overhanging grass edges and plants growing out of the masonry.
- The stone and brick texture is visible on every wall.

DO NOT COPY:
- The camera or the layout, as in Reference 1.
- The skeleton and the floating island. Both are flavour that doesn't map to a Hillink capability.
- Workers and the fisherman as permanent population. See §25 C7.

HILLINK APPLICATION:
- This is the reference for the **ambient life layer** (§20).
- It also shows **authored imperfection** (§15, §16): no surface is perfectly clean, edges are broken by vegetation,
  and materials change at seams.

### REFERENCE 3: isometric composite, the primary architecture and growth reference (`ref3-iso-composite.png`)
It has four panels.

**3a. Modern isometric office building (top left).**

Applies to: Real, architecture, scale, density and lighting.

USE:
- This is the closest match to Hillink's actual camera. It uses a 2:1 isometric cutaway with roof and front walls
  removed, floor slabs as thick dark bands, and glass curtain walls on steel mullions.
- Room density at this camera: desks with 2–3 monitors, chairs, server racks, bookshelves, a whiteboard wall, a wall
  display, a meeting table with 8 chairs, a sofa, and plants in every corner.
- Warm interior light against a cool night exterior. Light spills out through the glass.
- Plaza and street dressing: paving, a bench, planters, street lamps, trees and a kerb.
- Characters are small relative to rooms, about 1/4 to 1/3 of the storey height.

DO NOT COPY:
- The exact footprint or floor plan.
- Several Codex-like characters at once. The panel shows at least three dark cyborgs at desks, which would break the
  three-agent rule.

HILLINK APPLICATION:
- This is the **target look for Real HQ** at its expanded stage.
- The starting stage must be much smaller (§18).

**3b. Isometric fantasy settlement (top right).**

Applies to: Fantasy, architecture, terrain, lighting, props and construction.

USE:
- The forge has a red tiled roof, a stone chimney with smoke, an anvil and a glowing hearth, and the dwarf working.
- The throne-command hall has stone walls, blue and gold banners, a red carpet, and the King on a throne with tables.
- The artificer's workshop has a glowing arcane ring device, with the cyborg inspecting it.
- Terrain has stone terraces, stairs and a waterfall into a pool. There is a dock with a campfire, torches on posts,
  and dense trees and bushes.
- Paths are irregular cobble.

DO NOT COPY:
- The exact building arrangement.

HILLINK APPLICATION:
- This is the **target look for Fantasy**.
- It shows semantic translation directly: the forge is Claude's workshop, the command hall is ChatGPT's planning room,
  and the arcane device is Codex's inspection station.

**3c. Character sheet (bottom left).**

Applies to: characters and animation.

USE:
- Proportions are about 3 heads tall. The head is not oversized and the eyes are 1–2 pixel marks.
- Silhouettes are chunky, with dark selective outlines and textured clothing (leather, fur, metal).
- Each character holds a role prop: the dwarf a hammer and axe, the cyborg a glowing eye and mechanical arm, the King a
  sceptre and scroll.
- Each character is also drawn **at a modern desk with monitors**: the same characters inside Real HQ.

DO NOT COPY:
- The exact sprites, pixel for pixel. Kyle said so.

HILLINK APPLICATION:
- This is the **primary character reference** together with Reference 4.
- It raises the biggest open question: do Real HQ characters keep their archetype identity (dwarf, cyborg, King at
  computers)? See §25 C4.

**3d. Construction and growth progression (bottom right).**

Applies to: construction, growth and architecture.

USE:
- The Fantasy sequence:
  1. a camp with a tent and campfire, where the three agents gather
  2. a fenced cleared plot
  3. a timber frame on a stone footing
  4. stone and timber walls
  5. a roof going on
  6. the finished forge with chimney smoke and banners
- The modern sequence:
  1. a single small glass room
  2. two rooms
  3. a large multi-room office with stairs and a server room
- The agents are present at every stage.

DO NOT COPY:
- The exact buildings.

HILLINK APPLICATION:
- This is **the model for §17 (construction) and §18 (growth)**.
- It shows that the starting World can be a camp, or a single room, with three agents. That fits "small, complete,
  alive, intentional".

### REFERENCE 4: ten-character animation sheet (`ref4-character-sheet.png`)
Applies to: characters, animation, UI/status and props.

USE:
- One sheet layout per agent: five directions (front, front-diagonal, side, back-diagonal, back) by nine clips (idle,
  walk, run, work, talk, think, carry, inspect, celebrate).
- Work clips are specific to the role: plan, build, test, outreach, ledger, review, analyze and model.
- Clips show what the character is doing with an object: a hammer, a tablet, a scroll, a ledger, a magnifier, a
  telescope or a laptop.
- Each agent has a role palette (King green and gold, dwarf orange and brown, cyborg blue and red) that stays readable
  at 16–20 pixels tall.
- Very different bodies coexist in one style: a cupid, a goblin, a hooded oracle, a shaggy cyclops, robed apprentices
  and a human owner.
- A small set of above-head status icons: talking, thinking, idea, positive, alert, working, building, money,
  complete, waiting, blocked.
- A tools and props strip: crown, hammer, laptop, crate, door, scroll, letter, coin, books, map, magnifier, telescope,
  sapling and plant.

DO NOT COPY:
- Population. Only ChatGPT, Claude and Codex exist today [Kyle]. The rest show the range the system must support.
- The exact icon artwork.

HILLINK APPLICATION:
- This defines the **clip matrix (§6)**, the **archetype range (§5, §19)** and the **status icon vocabulary (§21)**.
- It adds a `run` clip, which is not in 5H's clip list.

---

## 1. Core visual identity

[proposed] **Hillink is a miniature, handcrafted, pixel-art organization seen from a fixed isometric camera, which
visibly builds itself as the company grows.**

The pillars:
- **Handcrafted density.** Every space shows what happens there, who works there and what was built there. [Kyle]
- **Warm light in a cool world.** Interiors glow amber; exteriors are dusk-cool. Light marks where work happens.
  [ref 1–3]
- **Built, not generated.** Everything looks placed by someone: footings, beams, scaffolds and repairs. [Kyle, ref 3d]
- **One world, two readings.** Real and Fantasy are the same organization in two material languages. [Kyle]
- **Small and alive first.** Three agents in a small, finished place, rather than a large empty one. [Kyle]

## 2. Pixel and sprite rendering language

- [Kyle] Deliberate pixel-art influence with detailed sprite work. No vector avatars, sterile geometry or flat
  browser-game illustration.
- [proposed] **A real pixel grid, not a "pixel-ish" vector look.**
  - The World renders to a low-resolution buffer at a fixed art scale, then upscales by an integer factor with
    nearest-neighbour sampling.
  - The default zoom is 3× (1 art pixel = 3 screen pixels). Zoom steps are 2×, 3×, 4× and 6×.
  - Text and UI render at native resolution on top and are never pixelated.
- [proposed] **Selective outlines.**
  - Use a darker shade of the adjacent colour, not uniform black.
  - Use a near-black outline only on the outer silhouette of characters and key props.
  - This replaces 5H's single ink outline.
- [proposed] **Hue-shifted ramps.**
  - Each material has a 3–5 step ramp.
  - Shadows shift toward blue or violet; highlights shift toward yellow.
  - No pure greys, except steel and concrete, and even those are tinted.
- [proposed] **Dithering** is used sparingly and only for large gradients: sky, glow falloff and water.
- [proposed] **Texture** comes from pixel clusters (brick courses, plank seams, stone joints, fabric folds), not noise.
- [open] Who or what authors the pixels: hand-authored sprite data, or procedural pixel sprites, or both. See §25 C9.
  The rule "appearance data is data, never code" still holds either way. Sprites would be palette-indexed pixel grids
  stored as plain data.

## 3. Character proportions

- [ref 3c, 4] About 3 heads tall. The head is about 1/3 of the height *including hair or headgear*. The face itself is
  smaller.
- [proposed] At art scale, characters are **about 20–24 art pixels tall**. Most are humanoid; a broad build such as the
  dwarf is about 20.
  - The head is about 8 pixels.
  - Eyes are 1×1 or 1×2 pixels with no visible whites at default zoom.
  - The torso is about 6–7 pixels, the legs about 5–6 pixels, and the feet 2 pixels.
- [Kyle] **Not** giant cartoon heads or oversized eyes. 5H iteration 1 has a head radius of 0.185h, with large white eye
  discs and blush. That reads as a vector chibi and has to change.
- [proposed] Arms reach mid-thigh. Hands are 2×2 pixel blocks. Legs are separate, with a 1-pixel gap in front view.
- Body types vary by archetype (§5). The rig must not assume one humanoid template [Kyle].

## 4. Character silhouette rules

- [Kyle] A player must identify an agent without its nameplate.
- [proposed] **Silhouette test:** a solid-black version of each sprite in front and side views must be distinguishable
  from every other agent's at 1× art scale.
- [proposed] Each core agent owns one silhouette signature that no future agent may reuse:
  - **ChatGPT:** the crown points plus a cape that widens the lower outline.
  - **Claude:** a broad, short body with a beard mass, plus a hammer head above the shoulder.
  - **Codex:** an asymmetric head, with one glowing eye and a mechanical plate, plus one mechanical arm.
- [proposed] Each agent has one dominant hue, one secondary hue and one accent glow:
  - ChatGPT: [open, §25 C1], gold and gem.
  - Claude: orange-brown, leather and steel, forge-orange glow.
  - Codex: blue or dark grey, steel, eye glow [open, §25 C2].

## 5. Agent archetype rules

- [Kyle] The three core identities are:
  - **ChatGPT = King / Orchestrator**
  - **Claude = Dwarf / Builder / Artificer**
  - **Codex = Cyborg / Inspector**
- [proposed] An archetype is a data record. Its fields:
  - `body` (a body plan: humanoid-short, humanoid-standard, broad, small-winged, hunched, large-creature or mechanical)
  - `silhouetteSignature`
  - `palette` (dominant, secondary, accent, glow)
  - `equipment` (an attachment-point → item map)
  - `clipOverrides` (for example, a winged agent hovers instead of walking)
  - `workVerb` (build, inspect, plan, ledger, outreach, analyze, review, model…)
  - `workstation` (§19)
  - `fantasyForm` / `realForm` (§13)
- [proposed] Body plans are shared skeletons. Archetypes are skins on them. A new archetype that fits an existing body
  plan needs only a palette, equipment and a work verb.
- [Kyle] Scout, Treasurer, Oracle, Cyclops, Qwen, Gemma and Kyle are examples of range, not inhabitants.

## 6. Animation requirements

- [ref 4] The clip matrix is five directions by these clips:
  - `idle`, `walk`, `run`, `work`, `talk`, `think`, `carry`, `inspect`, `celebrate`
  - plus 5H's `waiting`, `blocked` and `type` (seated)
  - Left-facing views mirror the right-facing ones.
- [proposed] Frame counts at the 5H cycle timings:

  | Clip | Frames |
  |---|---|
  | idle | 4 |
  | walk | 6 |
  | run | 6 |
  | work | 4–6 |
  | talk | 4 |
  | think | 4 |
  | carry | 6 |
  | inspect | 4 |
  | celebrate | 6, plays once |
  | waiting | 4 |
  | blocked | 3, plays once |
  | type | 3 |

- [proposed] `work` is per archetype:
  - Claude hammers at the anvil or desk.
  - Codex scans with the eye beam or a tablet.
  - ChatGPT gestures over a map or table.
  - Future agents declare their own (ledger, outreach…).
- [proposed] Props held in clips use the 5H attachment points: handNear, handFar, back, hip and head.
- [Kyle] Celebrate plays only on canonical completion. Animation never implies a state that isn't canonical.
- [proposed] Characters are animated by frame swapping, not by rotating limbs, so the pixel grid stays clean.

## 7. Environmental density rules

- [Kyle] Move away from large clean shapes, empty floors and isolated props.
- [proposed] Every room meets these density rules:
  - **Walls:** at least one wall-mounted item per 2 tiles of visible back wall, such as a shelf, map, frame, pinboard,
    lamp, cable run, pipe or vent.
  - **Floor:** about 35–55% of floor tiles have something on them. The rest is clear walk space, kept for navigation.
  - **Clusters, not scatter:** props come in groups of 2–5 around a purpose (a desk cluster, a storage corner, a
    plant corner).
  - **Story props:** each room has at least one object that says *who* works there (§11) and one that says *what
    is happening now*, tied to canonical state. Examples: plans on the table while Claude builds, a test rig lit while
    Codex runs checks.
  - **Edge breakup:** room edges, terrain edges and roofs get vegetation, debris or wear every few tiles. There are no
    perfectly clean runs longer than about 6 tiles. This is stricter in Fantasy, looser in Real.
- [proposed] **Readability guardrail:** density lives on walls, edges and corners. The centre path and the agent's
  standing spot stay clear and slightly lighter, so agents always read on top.

## 8. Material language

| Family | Real [ref 1–3a] | Fantasy [ref 3b, 3d] |
|---|---|---|
| Structure | concrete slabs, steel beams and mullions, glass curtain wall | stone footings, timber frames, plaster infill |
| Surfaces | wood flooring, tile, carpet runners | flagstone, planks, packed earth, rugs |
| Furniture | desks, mesh chairs, sofas, shelving | trestle tables, benches, chests, thrones |
| Tech or magic | monitors, racks, cables, LEDs, wall displays | forges, crystals, rune devices, arcane rings |
| Soft | plants in pots, rugs | banners, tapestries, fur, hay |
| Light sources | ceiling pendants, desk lamps, monitor glow, rack LEDs | torches, candles, hearths, forge glow, crystal glow |

- [proposed] Every material has a hue-shifted ramp and a pixel texture pattern:
  - brick courses every 3 pixels
  - plank seams every 4 pixels
  - flagstones as irregular 5–8 pixel polygons
  - glass as 2 tones plus a single highlight diagonal

## 9. Lighting language

- [ref 1–3] **Warm, local key lights inside and a cool ambient outside.** The default time is dusk or evening.
  [open, §25 C6: whether there is a day/night cycle]
- [proposed] Light sources are objects in the World. Each one casts a soft additive pool of 2–4 tiles, with a dithered
  falloff in amber, monitor cyan or forge orange.
- [proposed] Unlit areas sit 1–2 ramp steps darker. Rooms are never evenly bright.
- [proposed] **Light means activity.** An occupied, active workspace has its lamps and monitors on. An unbuilt or idle
  room is dimmer. This ties light to canonical state, read-only.
- [proposed] Shadows:
  - a 1–2 pixel contact shadow under every character and prop
  - wall-to-floor ambient occlusion as a 1-pixel dark seam
  - no long cast shadows; the 5H "light from the upper left" rule is kept for highlight placement

## 10. Scale rules

- [Kyle] Buildings are clearly larger than agents. Furniture and doors make sense. Characters don't dominate rooms.
- [proposed] Using character height h (about 22 art pixels):

  | Element | Size |
  |---|---|
  | Door | 1.3h tall, 0.6h wide |
  | Storey (floor to floor) | 2.6h, matching ref 3a where characters are about 1/3 of the storey |
  | Desk | 0.45h |
  | Chair seat | 0.3h |
  | Server rack | 1.1h |
  | Bookshelf | 1.1–1.3h |
  | Table lamp | 0.25h |
  | Tree | 3–5h |
  | Fantasy house | 2–3 storeys equivalent |

- [proposed] One isometric floor tile is about 0.9h wide. A single desk workstation is about 2×2 tiles including the
  chair.
- [Kyle] When zoomed out, agents stay recognizable. [proposed] Below 2× zoom, core agents get a 1-pixel brighter rim,
  and their silhouette signature (crown, hammer, eye glow) is kept visible by a level-of-detail sprite.

## 11. Real HQ rules

- [Kyle] Keep the existing Real HQ architecture and camera. Translate the art language into it. It should feel like *a
  miniature living technology company*.
- [proposed] Workspaces say who works there:

  | Agent | Workspace | Story props |
  |---|---|---|
  | **Claude** | Builder's workspace | drafting table with blueprints, a workbench with tools and parts, a monitor with code, crates of components, a hammer on a rack |
  | **Codex** | Inspection lab | test bench with an oscilloscope and probes, several monitors with graphs and logs, a magnifier lamp, a small rack, a checklist board |
  | **ChatGPT** | Planning and oversight office | wall map or display with routes and tasks, a planning table with pins and cards, a raised desk overlooking the floor, a status board |

- [Kyle] Shared spaces only appear when a capability justifies them. Examples: meeting room, server room, workshop,
  planning area, lounge, storage, infrastructure. No filler departments.
- [proposed] Real can be cleaner than Fantasy, but must look lived in:
  - cable runs
  - coffee mugs
  - pinned notes
  - a stack of boxes not yet unpacked
  - plants that are slightly overgrown
- [ref 3a] Glass curtain walls show the interior from outside. Light spills onto the plaza at night.
- [open] Real HQ character identity. See §25 C4.

## 12. Fantasy rules

- [Kyle] Same visual DNA, different materials. It must not look like a second, unrelated game.
- [ref 3b] Buildings sit on stone footings and terraces that follow the terrain. Roofs are red tile, slate or thatch.
  Chimneys smoke when in use.
- [proposed] **Controlled irregularity:**
  - Paths wander by ±1 tile.
  - Walls have uneven top courses.
  - Roofs have a patched tile or two.
  - Fences lean.
  - Terraces step by height.
- [proposed] District signals are props and architecture, not labels:
  - **Forge:** a smoking chimney and an anvil glow.
  - **Command hall:** banners and a throne.
  - **Workshop:** an arcane device glow.
  - **Gate:** a portcullis and torches.

## 13. Real ↔ Fantasy translation rules

- [Kyle] Translation is semantic: same canonical activity, two readings.

  | Canonical concept | Real | Fantasy |
  |---|---|---|
  | build / implement | builder's workspace, workbench, code on monitors | forge or artificer's workshop, anvil, hammer |
  | inspect / test / review | inspection lab, test bench, logs | arcane machinery inspected with the eye beam, rune device |
  | orchestrate / plan | planning office, wall map, status board | King's command, war table, banners, throne |
  | infrastructure / compute | server room, racks, LEDs | arcane engine, crystal conduits |
  | security | badge gate, cameras | gate, guards, fortifications |
  | data / storage | storage room, archive shelves | vault, archive, library |
  | communications | antennas, dish, network closet | towers, relays, observatory |
  | owner action needed | flagged item on the planning board | sealed scroll at the King's table |
  | construction | scaffolding, steel frame, glazing | timber frame, stone, thatch |

- [proposed] **Parity rule:** every canonical state visible in one theme must be visible in the other, with the same
  location role, the same character pose and the same light-equals-activity behaviour. This extends 5H's truth
  equivalence to art.

## 14. Terrain rules

- [ref 1–3] Buildings sit *in* the terrain: footings, terraces, slopes, cut banks, overhangs.
- [proposed] Terrain layers:
  1. ground tiles (grass, dirt, cobble, paving)
  2. edge transitions (grass to dirt, path borders)
  3. elevation (terrace steps 0.5h high, retaining walls)
  4. water (stream or pond, 2-tone animated shimmer)
  5. vegetation (trees, bushes, flowers, tufts)
- [proposed] Real terrain is an urban plot: paving, kerb, planters, street lamps and a few trees [ref 3a]. Fantasy
  terrain is wilder, with meadow, rock, water and dense trees [ref 3b].
- [open] Underground (caves, mines, crystals) appears in refs 1 and 2 but has no Hillink capability. See §25 C8.

## 15. Architecture rules

- [proposed] **Cutaway convention:** roofs and front walls are removed or faded over interiors. Back and side walls are
  full height and carry wall props. This keeps 5H's camera.
- [proposed] **Visible structure:** floor slabs are 3–4 pixels thick, with beams at room edges, columns at corners,
  stairs between storeys and footings at ground contact.
- [proposed] **Modular construction:** buildings are assembled from footprint modules (a room, corridor, stair core,
  tower or hall), each built through the §17 stages. This matches 5G/5H's existing building-and-room data.
- [ref 3d] A building grows by adding modules to an existing one, not by replacing it.

## 16. Prop rules

- [proposed] Every prop is a data record:
  - `id`
  - `size` in tiles
  - `anchor` (floor, wall or ceiling)
  - `materials`
  - `light` (optional)
  - `anim` (optional)
  - `theme` (real, fantasy or both)
  - `roles` (which workspace kinds use it)
  - `storyTag` (what it implies is happening)
- [proposed] Props are placed by the existing 5H dressing rules (never on walks, stations, solids or plots), extended
  with the §7 cluster rules and the density targets.
- [proposed] **Story props bound to state** (read-only) swap variants, such as an open book, a lit monitor or a
  steaming forge, from canonical fields only.
- [Kyle] Props keep consistent relative scale (§10).

## 17. Construction visual system

- [Kyle] Eleven stages, each a canonical construction stage:

  | # | Stage | Real visuals | Fantasy visuals |
  |---|---|---|---|
  | 1 | untouched site | grass or paving | meadow, rocks |
  | 2 | surveyed or staked | stakes, string lines, spray marks | stakes, rope lines |
  | 3 | materials arrive | pallets, steel bundles, glass crates | lumber stacks, stone piles, carts |
  | 4 | excavation or foundation | dug pit, concrete footing, rebar | dug pit, stone footing |
  | 5 | structural frame | steel columns and beams | timber frame |
  | 6 | walls | panels and glazing partly in | stone and plaster partly in |
  | 7 | roof or exterior | roof deck, cladding | rafters, then tiles |
  | 8 | systems or equipment | cable trays, racks being installed | hearth, forge, arcane device installed |
  | 9 | interior furnishing | desks arriving in crates | tables, shelves, rugs |
  | 10 | finishing or detail | plants, lamps, signage | banners, torches, flowers |
  | 11 | operational | lights on, agent moves in | smoke, glow, agent moves in |

- [proposed] Scaffolding, ladders, temporary work lights and a tarp appear during stages 5–8.
- [Kyle] Builders visibly interact: Claude carries materials and hammers at the active stage's work point.
- [Kyle] **Art never advances progress.** The stage comes only from canonical construction state. This 5H rule is
  kept.
- [code] Canonical construction (`procgen/construction.mjs` `STAGES`) has **9** stages: planning, site-preparation,
  foundation, structure, exterior, systems, furnishing, inspection and operational. 5H draws 6 looks over them.
- [proposed] Mapping of the 11 brief stages onto the 9 canonical stages:

  | Brief stage | Canonical stage |
  |---|---|
  | 1 untouched | planning |
  | 2 surveyed | site-preparation |
  | 3 materials and 4 excavation/foundation | foundation |
  | 5 frame | structure |
  | 6 walls and 7 roof | exterior |
  | 8 systems | systems |
  | 9 furnishing and 10 finishing | furnishing |
  | — | inspection (scaffold coming down, Codex inspecting) |
  | 11 operational | operational |

  Only the 3/4, 6/7 and 9/10 splits need HQ to report progress within a stage. Without that, each pair shows its first
  look until the canonical stage changes. See §25 C10.

## 18. Procedural expansion rules (World growth)

- [Kyle] Progression: need or capability emerges → an agent is added → construction → the space becomes operational →
  the agent moves in.
- [proposed] **Growth tiers** (visual names; canonical capability drives them):

  | Tier | Real | Fantasy |
  |---|---|---|
  | T0 Start | a single small glass office: 3 desks, a planning wall, a small rack corner [ref 3d modern 1] | camp: tent, campfire, anvil, map table [ref 3d fantasy 1] |
  | T1 Functional | two rooms: work room and planning office | first hall plus forge |
  | T2 Specialized | dedicated workspaces per agent plus a server room | forge, command hall, artificer workshop |
  | T3 Expanded | second storey, meeting room | walls, gate, more districts |
  | T4+ | additional buildings, compound, campus | settlement, town, kingdom |

- [open] Today's T0 conflicts with the earlier "two-floor HQ baseline" decision. See §25 C5.
- [code] The default simulation boots with only Claude and Codex (`sim/simulator.mjs` `SIM_ROSTER`). ChatGPT appears
  only when an evidence script registers it, so the three-agent start is not what you see on boot today. The vertical
  slice should register all three by default.
- [proposed] Slots for growth come from deterministic layout rules, as in 5G's procedural layout. The empty land
  around the starting World is **wild terrain**, not reserved blank plots, so a small World doesn't look unfinished.

## 19. Future-agent visual-generation rules

- [Kyle] A new agent gets an archetype, sprite identity, equipment, animation set, workspace, props, room or building,
  and a role visual language, without redesigning the World.
- [proposed] Generation pipeline:
  1. Role domain → archetype candidates. This uses the existing 5G/5H `DOMAIN_ARCHETYPE` table.
  2. The definition's registered colour becomes the dominant hue.
  3. Pick a body plan and a silhouette feature that no existing agent owns (§4).
  4. Work verb → `work` clip variant and held prop.
  5. Workstation kind → workspace prop cluster, in both Real and Fantasy forms.
  6. If needed, a new room or building module goes through §17.
- [Kyle] Appearance and theme metadata stay data, never code. This 5H rule is kept.
- [proposed] **Fallback art:** an unknown role gets a generic but finished-looking specialist (a hooded worker with a
  satchel, in its colour), never an unfinished placeholder.
- [open] Whether unique sprites for future agents are authored by hand when the agent is approved, or assembled from
  parts. See §25 C9.

## 20. Ambient animation principles

- [Kyle] Design for animation now; don't implement all of it yet.
- [proposed] Ambient loops, each cheap with 2–6 frames:
  - monitor flicker and scroll
  - rack LEDs
  - lamp and torch flicker
  - fire
  - chimney smoke
  - water shimmer
  - swaying grass and trees
  - forge sparks
  - crystal pulse
- [proposed] **Rules:**
  - Ambient motion is tied to the light-equals-activity rule (§9), so an inactive room is calmer.
  - It never implies agent state.
  - Reduced motion freezes it.
  - It is phase-offset by a deterministic hash so things don't pulse in sync.
- [proposed] Critters (birds, a rabbit) are allowed only as rare, non-canonical ambient life. See §25 C7.

## 21. UI and status relationship to the World

- [Kyle] **Diegetic first.** The World shows the activity, and icons reinforce it.
- [proposed] Priority, from first read to last:
  1. location and prop state (lit monitors, the forge burning, plans on the table)
  2. pose and clip (hammering, scanning, gesturing)
  3. small above-head icon [ref 4 vocabulary]
  4. nameplate and HUD
- [proposed] The above-head icon only appears for states the pose can't show alone: waiting, blocked, owner action
  needed, complete, talking.
- [Kyle] NEEDS KYLE stays canonical-only, from the issue owner flag. This 5H rule is kept.
- [proposed] Icons are pixel-art 9–11 pixels on a 1-pixel outline chip, using the ref 4 vocabulary: talking, thinking,
  idea, alert, working, building, complete, waiting, blocked, plus owner-needed.
- [proposed] 5H's coloured ground rings are dropped as the default. They come back only on hover or selection.

## 22. What specifically changes from current 5H

- **Character art:** vector chibi becomes pixel sprites at about 3 heads, with small eyes and no blush.
  - ChatGPT becomes the King in both themes.
  - Claude becomes the dwarf.
  - Codex becomes the cyborg.
  - Real characters move to the pixel language even if C4 keeps them human.
- **Rendering:** smooth canvas vectors become a low-resolution pixel buffer, integer-upscaled.
- **Outline:** one ink outline becomes selective outlines.
- **Colour:** flat fills become hue-shifted ramps with texture.
- **Density:** isolated props in open floors become clustered, wall-heavy dressing with story props bound to state.
- **Lighting:** even lighting becomes warm local pools against a dusk ambient, with light meaning activity.
- **Construction:** 6 visual stages become 11 visual stages, with scaffolds, materials and builder interaction.
- **Starting World:** the large layout becomes a small T0 that grows (pending C5).
- **Population:** simulation and evidence default to three agents. The other characters appear only in a scalability
  demo.
- **Status:** emblem plus ring becomes diegetic first with small icons. Rings appear only on selection.

## 23. What specifically remains from current 5H

- Canonical state architecture: HQ → events → World → theme → spatial → renderer. The renderer stays read-only.
- Real and Fantasy dual representation, and truth equivalence.
- Lifecycle semantics: READY != ACTIVE.
- Construction authority: art never advances progress.
- NEEDS KYLE and the PR chip come only from canonical fields.
- Navigation and interaction: nodes, walks, keep-outs and dressing avoidance.
- Deterministic replay, and isolation between live and simulation.
- Procedural layout and the dynamic-agent onboarding pipeline.
- The data-only appearance rule and the hostile-metadata clamps.
- Depth planes, attachment points, the clip names (extended) and the five-view model.
- Test strategy: boundary and determinism tests, not pixel tests.
- The camera.

## 24. Remaining visual questions requiring reference material

1. **Real HQ characters:** close-ups of archetypes at modern desks *versus* human staff. This resolves C4.
2. **Exact pixel density:** a reference at the intended zoom (for example, one room at 3×) showing how many pixels a
   character is.
3. **Day and night:** do we want a daytime version? Is dusk the default?
4. **T0 starting World:** a reference of the "small, complete, alive" three-agent start in both themes.
5. **Construction mid-stages in isometric:** stages 2–4 and 8–9 aren't shown in ref 3d.
6. **Exterior of Real HQ at T0 and T1:** the street context for a small office.
7. **Fantasy terrain edge:** where the World ends. A cliff, forest, fog or map edge?
8. **UI frame:** HUD and panel styling for the pixel look. No UI reference has been given yet.
9. **Night lighting of Fantasy exteriors:** torch density along paths.

---

## 25. Conflicts between references (not silently resolved) [open]

Agent leanings, which are not decisions:
- **C1:** green and gold, keeping the ermine and sceptre.
- **C2:** half-human with blue armour and ONE red eye. This uses ref 3c's body with ref 4's eye.
- **C3:** bare-headed with a red beard; the hard hat appears only on construction sites.
- **C4:** the same character in both themes.
- **C5:** start small.
- **C6:** dusk by default.
- **C7:** no anonymous workers; rare critters are allowed.
- **C8:** landscape flavour only, no rooms without a capability.
- **C9:** authored pixel sprite sheets allowed in the repo for the core agents, with procedural parts for props and
  future agents.
- **C11:** no castle behind Real.

| # | Conflict | Sources | Options (agent leaning, not a decision) |
|---|---|---|---|
| C1 | **King's palette:** green and gold with a green cape, *vs* blue robe with ermine trim | ref 4 and the earlier bible / ref 3c | Either works. Green keeps ChatGPT's established brand colour. |
| C2 | **Codex's eye and build:** one red eye in an armoured blue helmet, *vs* a cyan-glowing eye with black hair and a mechanical arm, otherwise human | ref 4 / ref 3c, plus the 5G bible "half-human, ONE red eye, not a robot" | ref 3c fits "half-human" better; ref 4 fits "red eye". Possible blend: ref 3c's body with a red eye. |
| C3 | **Claude's headgear:** an orange hard-hat helmet, *vs* bare red hair with a full beard | ref 4 / ref 3c | Possibly by context: hard hat during construction, bare-headed otherwise. |
| C4 | **Real HQ characters:** ordinary humans at work, *vs* the dwarf, cyborg and King at modern desks | ref 1–2 / ref 3a and 3c | This is the biggest identity question. ref 3 suggests one identity across both themes, with only the environment translated. |
| C5 | **Starting size:** a small T0 (camp, single room), *vs* the earlier decision "keep today's two-floor HQ as baseline" | ref 3d plus the Iteration 2 brief / Kyle decision 2026-09-29 | The newer brief ("small first") likely supersedes, but it was not explicitly revoked. |
| C6 | **Time of day:** every reference is dusk or night | refs 1–3 | Fixed dusk, or a day/night cycle. |
| C7 | **Non-agent people:** hardhat workers, a fisherman, a miner and NPCs fill refs 1–3, *vs* "only three agents" | refs 1–3 / Kyle's population rule | Are non-agent workers and critters allowed as ambient life? 5H currently has some. |
| C8 | **Flavour spaces without a capability:** a gym, dock, caves, mine and a castle on the horizon, *vs* "no unnecessary departments" | refs 1–2 / Kyle | Allow landscape flavour (dock, water) but not rooms, unless a capability justifies them. |
| C9 | **How sprites are authored:** the references are hand-pixelled (AI-generated) art, *vs* 5H's procedural, data-only, all-original rule | all refs / Kyle's "all assets original" | Options: (a) hand-authored pixel sprite data; (b) procedural pixel sprites from parts; (c) a hybrid, with authored core agents and procedural props and future agents. The references themselves can't be shipped. |
| C10 | **Construction stage count:** 11 visual stages *vs* 9 canonical stages (6 looks in 5H) | Kyle's brief / `procgen/construction.mjs` | Lean: use the §17 grouping now, and add within-stage progress from HQ later for the 3/4, 6/7 and 9/10 splits. |
| C12 | **Kyle avatar:** ref 4 includes an owner avatar | ref 4 / the three-agent population rule | Lean: no permanent avatar. Owner presence shows as the sealed scroll or flagged board item (§13). |
| C13 | **Room labels:** refs 1–2 label rooms with signs (Servers, Gym), *vs* "identify rooms by props" | refs 1–2 / the Iteration 2 brief | Lean: no floating labels. Labels show on hover only, or as an in-world sign where a real building would have one. |
| C11 | **Cross-theme backdrop:** the Real HQ references show a fantasy castle on the horizon | refs 1–2 | Keep the themes strictly separate, or allow a subtle backdrop nod. |

---

## Next steps (only after approval)
REFERENCES → **this spec** → review → more references or corrections → approved visual language → small
vertical-slice prototype (one room, three agents, both themes) → visual review → refinement → propagation. [Kyle]
No implementation, no Pass 5I and no World-wide redesign until Kyle approves.
