# HILLINK ART DIRECTION SPEC — DRAFT 1 (revision 2)

Status: **the overall direction is approved by Kyle as a working foundation (2026-10-01 00:12Z). That is not approval to
implement.** No artwork, no vertical slice and no Pass 5I until Kyle approves. Conflicts C1–C11 are resolved by Kyle
(§25). Questions that need more references stay [open] (§24). Reference Batch 2 is expected.

Written 2026-10-01 on `claude/world-5h`, in answer to "PASS 5H — ITERATION 2" (Kyle, 2026-10-01 00:06Z).

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

### REFERENCE 5: Batch 2A concept board (`ref5-batch2a-board.png`) [Kyle, 2026-10-01 00:25Z]

This is a concept board, not a screenshot. It supplements refs 1–4. Kyle said it is for calibration: pixel density,
character-to-environment scale, density, lighting, materials, silhouettes, T0 scale, construction and time of day.

It has seven panels:
1. a master gameplay shot of Real
2. Real character sheets
3. the Real T0 exterior, and 3B the Real T0 interior
4. the Fantasy T0 exterior, and 4B the Fantasy T0 interior
5. Real construction
6. Fantasy construction
7. day, dusk and night

USE:
- **Pixel density at gameplay zoom** (panel 1).
  - Characters measure about 24 art pixels tall.
  - Each art pixel is about 2.5 board pixels.
  - Faces are a few pixels, with eyes as single dark pixels.
  - The crown, beard mass, hard hat and red eye all still read at this size.
  - This confirms the §3 range and narrows it to about 22–26 pixels.
- **Character-to-room scale** (panel 1).
  - A character is roughly 1/2 to 1/2.5 of a floor-to-floor storey: cosier than ref 3a's 1/3.
  - Desks, chairs and monitors fit the body.
  - Doors and stairs are clearly sized for the characters.
- **Interior density** (panels 1, 3B, 4B).
  - Every wall bay has 2–4 items: lamps, frames, a map, shelves, a pinboard.
  - Every floor bay has a furniture cluster plus a plant.
  - The lower floor mixes lounge, planning and storage: sofa, world map, shelves, crates.
  - The server bay is a wall of racks with blue LEDs.
- **Warm local lighting.**
  - Pendant lamps hang every 2–3 tiles, with amber pools.
  - Monitors give cyan and rack LEDs give blue as secondary light.
  - Outside, a campfire and lamp posts.
- **Material richness** as a principle: texture, wear and overgrowing foliage on edges and roofs. The specific
  materials (dark timber beams, stone and brick walls) are **not** adopted for Real. See §25 C19.
- **Real T0** (panels 3, 3B):
  - Outside, a small finished building: a concrete and brick front, a wall sign, lit windows, rooftop solar panels, a
    lattice mast with a dish, crates and planters, and a van.
  - Inside, three workstations in a row on the work floor, a planning lounge (map and sofa), stairs and a small server
    bay.
  - Small but legitimate: exactly what [Kyle C5] asks for.
- **Fantasy T0** (panels 4, 4B):
  - Outside, a small stone keep with a timber upper storey and a watchtower, a banner, warm windows, a waterfall and a
    dock.
  - Inside, three work spots under banners, with a hearth or forge on the lower floor.
- **Construction** (panels 5, 6).
  - Both are shown as **isometric plot tiles**: site, foundation, frame, walls and roof, interior, operational.
  - Real goes fenced dirt plot, slab, frame, enclosed building, lit interior, finished building with greenery.
  - Fantasy goes plot, stone footing ring, timber frame, stone keep shell, interior, finished keep with a flag.
  - Both show "walls + roof" as one step, which matches §17's shared `exterior` stage.
- **Time of day** (panel 7).
  - The **same assets** are shown at day, dusk and night.
  - Only the sky, ambient tint and how strong the light pools look change.
  - Windows glow at all three times; the glow just dominates more at night.
  - This confirms [Kyle C6]: light is a parameter, not baked in.
- **Role tells on the character sheet** (panel 2):
  - ChatGPT has speech, idea, a sceptre and a monitor.
  - Claude has blueprints, a flow diagram and a hard hat while building.
  - Codex has a tablet, screens and a magnifier.
  These match the §6 per-archetype `work` clips.

DO NOT COPY:
- **The side-scroller camera** [Kyle]. Every panel except 5 and 6 is a side cutaway.
- **Large floating name labels** over agents and rooms [Kyle C13].
- **The "HILINK" spelling** on the HQ sign. The brand is **Hillink**.
- **The fantasy castle on Real's horizon** (panels 1 and 7) [Kyle C11].
- **Codex with a red visor across both eyes.** About half of the Codex frames in panel 2 show a red band over both eyes,
  and some show a helmet or cap. That contradicts the lock of **ONE red eye, not a full robot** [Kyle C2]. Treated as
  a reference artifact.
- **Codex's hair colour varies** between frames (black and brown). Treated as a reference inconsistency.
- **Hard-hat workers who look like Claude.** The ambient worker in the server bay and outside T0 wears the same yellow
  hard hat as construction Claude. See §25 C15.
- **Modern monitors in the Fantasy interior** (panel 4B). This conflicts with the Fantasy material language (§8). See
  §25 C17.
- **The Real T0 exterior and interior don't match**: one storey outside, two inside. See §25 C16.
- **Construction "frame" in Real drawn as timber.** In Real it should be steel, per §8 and §17. Treated as a reference
  simplification.

HILLINK APPLICATION:
- Use the board's density, lighting, materials and scale **inside Hillink's isometric cutaway** (§15). The side
  cutaway's "rooms in a row" become isometric rooms with back and side walls carrying the wall dressing.
- Panels 5 and 6 are already isometric and can be followed closely for the plot-tile construction look, mapped to the
  10 truthful stages in §17.
- Real T0 and Fantasy T0 compositions (§18) take their *layout and program* from panels 3 and 4, but Real keeps
  modern materials (C19). They are: three workstations, one planning corner and
  one small compute corner (Real) or hearth (Fantasy), in one compact building.
- Panel 7 defines how lighting is tested: one scene rendered at three ambient settings with the same assets (§9).

---

## 0. One canonical agent, two visual aliases [Kyle, 2026-10-01 00:13Z]

**Real and Fantasy versions of an agent are not separate agents.** They are two visual aliases of one canonical agent.

```
CANONICAL WORLD STATE (one Claude, one ChatGPT, one Codex)
            ↓
VISUAL TRANSLATION LAYER (theme)
          ↙        ↘
   Real alias     Fantasy alias
```

- **ONE canonical agent:** Claude, ChatGPT, Codex, and every future agent (Agent #4 and on).
- **A visual alias** is a theme's rendering of that agent: "Real Claude" and "Fantasy Claude" are two views of the same
  Claude, not two or three entities.
- **Aliases own nothing canonical.** They never independently hold:
  - task state, lifecycle state, work state or activity
  - construction authority, progress or completion
  - blocked or waiting state
  - agent identity or capability
  All of that belongs to the canonical agent and system state. A theme only **reads** it and translates it.
- **Same event, two pictures.**

  | Canonical | Real alias | Fantasy alias |
  |---|---|---|
  | Claude is implementing or building | Claude at a modern builder workspace with the right tools | dwarf artificer Claude hammering at the forge |
  | Codex is inspecting or testing | cyborg Codex with modern test equipment | cyborg Codex inspecting arcane machinery |
  | ChatGPT is coordinating | the King at a planning wall or status board | the King at the command table |

- **No drift.** Switching theme changes only the picture. It never creates, removes, duplicates or changes the state of
  an agent. There is never a "Real World state" and a separate "Fantasy World state".
- **Extensible.** A new agent gets one canonical record, and each theme supplies an alias. Both aliases inherit the
  Hillink visual language and express the same identity (§4, §5, §19).
- [Kyle C12] **Kyle's avatar is not an agent.** It represents the human owner. It appears only for owner
  interactions, never does AI work and never counts in the agent population.
- [proposed] **Alias data is appearance-only.** An alias record holds sprite, wardrobe, equipment, palette and
  workstation art per theme, keyed by the canonical agent id. It has no state fields, and any it carries are ignored.
  The appearance-is-data-never-code rule applies.
- [proposed] **Acceptance test for any future implementation:** for the same canonical World, both themes show the same
  set of agent ids, with the same activity, task, lifecycle, blocked or waiting state, needs-owner flag and
  construction stage. Rendering either theme leaves the World unchanged.
- [code] This already matches the architecture: one `store.world` feeds both skins. Derived Fantasy entities are marked
  `canonical: false` (`themes/fantasy/entities.mjs`). 5H's truth-equivalence tests check that rendering doesn't change
  World state. Aliases make the rule explicit for the art.

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
- [Kyle C9] Hybrid authoring: bespoke pixel sprites for the core agents, modular parts for everything else (§19). Either
  way, the rule "appearance data is data, never code" still holds. [proposed] Sprites are palette-indexed pixel grids
  stored as plain data.

## 3. Character proportions

- [ref 3c, 4] About 3 heads tall. The head is about 1/3 of the height *including hair or headgear*. The face itself is
  smaller.
- [proposed, narrowed by ref 5] At art scale, characters are **about 22–26 art pixels tall** at default zoom. Ref 5's
  gameplay shot measures about 24. Most are humanoid; the broad dwarf is about 2 pixels shorter and wider.
  [open] The final number waits on the dedicated pixel-density reference.
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
  - **ChatGPT:** [Kyle C1] green and gold are the identity palette. Royal cream, gold and richer garment detail may be
    added, but green must stay recognizable. Neither reference is copied literally.
  - **Claude:** orange-brown, leather and steel, forge-orange glow. [Kyle C3] Visible red/orange hair and a full beard
    always. A hard hat or helmet appears **only while he is actively doing construction work**, so equipment shows the
    activity.
  - **Codex:** [Kyle C2] a **half-human cyborg** (a human body with cybernetics, not a full robot) with **ONE RED EYE**.
    The red eye is a permanent identity and silhouette feature in every view, clip and theme.
- [Kyle C4] **Identity persists across themes.** The three agents never become generic humans in Real.
  - Real changes wardrobe, equipment and presentation for a modern technology company.
  - Fantasy uses the stronger archetype form.
  - Each must be instantly recognizable as the same individual in either theme.
  - [proposed] What stays fixed across themes: face, hair or beard, body plan, silhouette signature, identity palette
    and Codex's red eye. What changes: clothing, held equipment and props.
  - [open] What exactly the Real versions look like. Needs references (§24).

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
  [Kyle C6] Hillink is **not** permanently locked to dusk. Dusk or evening stays the showcase condition for visual
  development because it shows lighting best.
- [ref 5] **Time-of-day behaviour:** the same assets serve day, dusk and night. Only sky, ambient tint and light-pool
  strength change. Interior lights glow at all times and dominate more at night.
- [Kyle C6] The art system must keep a future day/night cycle possible: light sources, ambient colour and sky are
  parameters, not baked into sprites. [proposed] Sprites carry base colours only. Ambient tint and light pools are a
  separate pass. No day/night system is built in this pass.
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
  | Storey (floor to floor) | about 2–2.6h. Ref 3a reads about 2.6h, ref 5 is cosier at about 2–2.5h. [open] Final value waits on the pixel-density reference |
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
- [Kyle C4] Characters keep their identity in Real. ChatGPT is still recognizably the King, Claude the dwarf
  builder and Codex the half-human cyborg, dressed for a modern technology company. [open] The exact Real wardrobe
  needs references (§24).

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
- [Kyle C8] **Environment is not an operational facility.**
  - Environmental flavour is allowed and encouraged: water, dock, garden, woods, cliffs, caves or cave entrances,
    landscaping, paths, benches and scenic terrain.
  - An operational facility (a department, specialized room or capability) exists only if Hillink has that capability.
  - So a scenic cave is fine, but a working mining department is not. A pond or dock is fine, but a dedicated facility
    must match a real capability.
- [proposed] Flavour terrain never carries a capability label, workstation or agent destination.

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
- [proposed] Mapping of the 11 brief stages onto canonical facts. Each row comes from a fact the code already has:

  | Brief stage | Canonical fact |
  |---|---|
  | 1 untouched site | no construction project exists for the plot yet |
  | 2 surveyed or staked | `planning` (the planner chose the site) |
  | 3 materials arrive | `site-preparation` (HQ asked for it to be built: cleared, cones, materials) |
  | 4 excavation or foundation | `foundation` |
  | 5 structural frame | `structure` |
  | 6 walls **and** 7 roof or exterior | `exterior` (the only shared stage) |
  | 8 systems or equipment | `systems` |
  | 9 interior furnishing | `furnishing` |
  | 10 finishing or detail | `inspection`, or `completed` but not yet verified (Codex on site) |
  | 11 operational | `operational` (verified) |

- [Kyle C10] **Canonical construction authority does not change for art.** The visual stages map underneath the
  existing canonical stages. Visual sub-stages are allowed inside one canonical stage only if they can be derived
  deterministically without inventing progress.
- [code] **Limitation:** walls (6) and roof (7) share the single `exterior` stage. There is no canonical progress
  signal inside a stage, so they **cannot be shown truthfully as a sequence.**
  - [proposed] `exterior` is drawn as **one combined composition**: walls going up with the roof frame started.
  - Nothing animates from walls to roof over time.
  - Facts that are already canonical but aren't progress may vary what is shown, deterministically. Examples: the
    assigned agent, a blocked or waiting gate, rework, the order number. They never imply advancement.

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

- [Kyle C5] **Start small supersedes the two-floor baseline as the starting state.** The larger HQ is **not
  discarded**; it becomes an **earned growth stage**.
- [Kyle C5] Small does not mean primitive.
  - **Real T0:** a compact, legitimate, *finished* small HQ suitable for three agents.
  - **Fantasy T0:** a compact, established outpost, small keep or workshop suitable for three agents.
  - The progression visibly grows toward the larger HQ or settlement.
  - This replaces the ref 3d camp and single glass room in the table above as T0 *candidates*.
- [ref 5, proposed] **T0 compositions**, small but finished:
  - **Real T0:** one compact building with a concrete and brick front, wall signage, rooftop solar panels and a
    mast with a dish. Inside: three workstations (ChatGPT, Claude, Codex), a planning corner (map wall, sofa), a
    small compute corner (2–4 racks) and stairs if there is an upper level.
  - **Fantasy T0:** a small stone keep with a timber upper storey and a watchtower. Inside: three work spots under
    banners, plus a hearth or forge.
- [open] Final T0 looks, including whether Real T0 has one storey or two (§25 C16), wait on the dedicated T0
  references.
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
- [Kyle C9] **Hybrid authoring: bespoke personality plus procedural scalability.**
  - **Core agents** (ChatGPT, Claude, Codex) get authored, bespoke sprite identities. They are deliberately designed,
    not assembled from generic interchangeable parts.
  - **The reusable system** stays modular: body plans, equipment, palettes, materials, props, animation conventions
    and attachment points.
  - **Future agents** may start with a coherent identity generated from the modular system. Important or permanent
    agents can later get a bespoke refinement without breaking the animation or World architecture. [proposed] To make
    that possible, a bespoke sprite set must fit the same body plan, frame count and attachment-point contract (§5, §6).
  - **All production art is original.** Reference artwork is never shipped or traced.

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
- [Kyle C7] **AGENTS vs AMBIENT INHABITANTS.**
  - **Agents** are actual AI or system actors with canonical identity and state. The current core agent population is
    ChatGPT, Claude and Codex.
  - **Ambient inhabitants** are purely visual World life. They are allowed, and may eventually include construction
    helpers, maintenance workers, justified background staff, birds, rabbits and other small critters.
  - Ambient inhabitants must **never** masquerade as agents, receive fake canonical work, imply AI capabilities that
    don't exist, or distort the visible agent population.
- [proposed] To keep that distinction visible:
  - Ambient inhabitants have no nameplate, no status icon, no selection panel and no HUD count.
  - They use a reduced detail level and never an agent's silhouette signature or identity palette.
  - They don't appear in agent lists, and the renderer derives them from scenery data, never from World agents.

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
  - [Kyle C4] Identities persist in Real: the King, dwarf and cyborg in modern dress, not generic humans.
  - Claude's hard hat appears only during active construction work [Kyle C3], and Codex has one red eye [Kyle C2].
- **Rendering:** smooth canvas vectors become a low-resolution pixel buffer, integer-upscaled.
- **Outline:** one ink outline becomes selective outlines.
- **Colour:** flat fills become hue-shifted ramps with texture.
- **Density:** isolated props in open floors become clustered, wall-heavy dressing with story props bound to state.
- **Lighting:** even lighting becomes warm local pools against a dusk ambient, with light meaning activity.
- **Construction:** 6 visual looks become 11 visual stages over the 9 canonical stages, with scaffolds, materials and builder interaction.
- **Starting World:** [Kyle C5] a compact, finished T0 that grows. The current two-floor HQ becomes an earned later
  stage.
- **Ambient life:** [Kyle C7] ambient inhabitants are strictly separate from agents.
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

## 24. Remaining visual questions requiring reference material [open]

These stay open until Reference Batch 2 or later.

1. **Real T0 HQ:** the exact compact, finished three-agent HQ, inside and out.
2. **Fantasy T0 settlement:** the exact compact outpost, small keep or workshop.
3. **Real versions of ChatGPT, Claude and Codex:** how the King, dwarf and cyborg dress and equip for a technology
   company while staying recognizable (C4).
4. **Character pixel density:** how many art pixels tall a character is at default zoom, and how much detail fits.
5. **Isometric construction stages:** especially the paired compositions (§17) and the stages ref 3d doesn't show.
6. **Terrain boundaries:** where each World ends (cliff, forest, water, fog, map edge) at small and large sizes.
7. **Real exterior architecture:** the street, plaza and façade at T0 and as it grows.
8. **Fantasy exterior architecture:** walls, roofs and paths of the outpost as it grows.
9. **UI and HUD:** panels, nameplates and status icons in the pixel language.
10. **Lighting variations:** dusk showcase plus at least one other time, to prove the system isn't dusk-locked (C6).
11. **Environmental detail:** close-ups of prop clusters and wall dressing for each workspace (Claude, Codex,
    ChatGPT), in both themes.
12. **Kyle's avatar appearance (C14)** and the new Batch 2A conflicts (C15–C18). See §25.

---

## 25. Reference conflicts and Kyle's decisions

Resolved by Kyle on 2026-10-01 at 00:12Z:

| # | Conflict | Decision [Kyle] |
|---|---|---|
| C1 | ChatGPT's palette | **Green and gold** is the identity palette. Royal cream, gold and richer garment detail may be added; green stays recognizable. Neither reference is copied literally. |
| C2 | Codex's design | **Half-human cyborg with ONE RED EYE.** A human or cybernetic body, not a full robot. The red eye is a permanent identity and silhouette feature. |
| C3 | Claude's headgear | **Red or orange hair and a full beard.** A hard hat or helmet appears only while actively doing construction work. |
| C4 | Real HQ character identity | **Identities persist across themes.** Never generic humans in Real. Real changes wardrobe, equipment and presentation for a technology company; Fantasy uses the stronger archetypes. The same individual is recognizable in both. |
| C5 | Starting size | **Start small supersedes** the two-floor baseline as the starting state. The larger HQ is kept as an **earned growth stage**. Small is not primitive: Real T0 is a compact, finished small HQ; Fantasy T0 is a compact established outpost, small keep or workshop. Exact looks wait on references. |
| C6 | Time of day | **Not locked to dusk.** The system must allow a future day/night cycle. Dusk is the showcase condition for now. No day/night system in this pass. |
| C7 | Non-agent inhabitants | **Allowed, as ambient inhabitants strictly separate from agents.** They never masquerade as agents, receive fake work, imply nonexistent capabilities or distort the agent population. The agents are ChatGPT, Claude and Codex. |
| C8 | Flavour spaces | **Environment is allowed and encouraged**, but it is not an operational facility. No department, specialized room or capability exists only because it looks cool. |
| C9 | Sprite authoring | **Hybrid.** Bespoke authored identities for the core agents; a modular system (body plans, equipment, palettes, materials, props, animation, attachments) for everything reusable and for future agents, who can be refined later. All production art is original; references are never shipped or traced. |
| C10 | Construction stages | **Canonical authority does not change.** Visual stages map underneath the canonical stages. Sub-stages are allowed only if they can be derived deterministically without false progress; otherwise the limitation is documented. Only walls and roof share a stage; §17 has the mapping and how that pair is drawn. |
| C11 | Cross-theme backdrop | **No fantasy castle behind Real.** Each theme stays physically coherent. Subtle shared motifs are fine, but the settings never blend. |
| C12 | Kyle avatar (resolved 2026-10-01 00:25Z) | **Kyle may have a visual avatar. He is NOT an AI agent.** He represents the human owner and player. He appears only for legitimate owner interactions: NEEDS KYLE, approvals, owner decisions, meetings, inspections or visits, and ceremonies. He never autonomously performs AI work and never adds to the apparent agent population. His exact appearance is still open. |
| C13 | Room labels (resolved 2026-10-01 00:25Z) | **Environment first, text second.** Rooms are recognized by their physical design. Labels may appear on hover, on selection, in the inspector, in a map view, or as subtle architectural signage. No large permanent floating labels. |

Still open (new from Reference 5):

| # | Question | Agent leaning (not a decision) |
|---|---|---|
| C14 | **Kyle avatar appearance:** how Kyle looks, and how his avatar stays clearly separate from agents (no nameplate status, no work clips) | A distinct human owner silhouette. Visible only during owner interactions (C12). |
| C15 | **Claude's hard hat vs ambient workers:** ref 5's ambient workers wear the same yellow hard hat as construction Claude, so they read as Claude look-alikes | Claude is never confusable. Ambient workers get a different hat colour and no beard, are smaller in scale, and never wear orange-brown. |
| C16 | **Real T0 size:** ref 5 shows one storey outside but two storeys inside | Needs the T0 reference. Leaning: one compact building, two small levels if the three workstations, planning corner and compute corner need it. |
| C17 | **Monitors in Fantasy:** ref 5 panel 4B puts modern screens on Fantasy desks | Keep the material split (§8). Fantasy uses scrying glass, crystals, maps and ledgers, never modern monitors. |
| C19 | **Real materials:** ref 5's Real HQ and Real T0 use dark timber beams and stone or brick walls, and read like a lodge close to Fantasy. That bends the approved Real material language (glass, steel, concrete, electronics, §8, §12 of Kyle's brief). | Keep the modern Real materials. Take only ref 5's layout, density, warmth and wear. A wood floor and some brick are fine as accents. |
| C20 | **T0 lounge vs C8:** ref 5's Real T0 has a lounge (sofa, world map) with no capability behind it | Allow one shared planning or break space in T0 as environment. It is not an operational facility and holds no capability. Nothing more until a capability justifies it. |
| C18 | **How literal Real wardrobe is:** ref 5's "Real" sheet still has ChatGPT in a crown and long cape, and Claude in a tank top | The crown stays as the silhouette lock (Kyle). Leaning: Real swaps the cape for a green and gold jacket or long coat with a crown or crown pin, so it's clearly the King but office-appropriate. Needs the Real-agents reference. |

---

## Next steps (only after approval)
REFERENCES → spec → review → **Reference Batch 2 (next)** → more references or corrections → approved visual language → small
vertical-slice prototype (one room, three agents, both themes) → visual review → refinement → propagation. [Kyle]
No implementation, no Pass 5I and no World-wide redesign until Kyle approves.
