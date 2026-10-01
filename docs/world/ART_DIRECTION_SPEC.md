# HILLINK ART DIRECTION SPEC — DRAFT 1 (revision 5)

Status: **the overall direction is approved by Kyle as a working foundation (2026-10-01 00:12Z). That is not approval to
implement.** No artwork, no vertical slice and no Pass 5I until Kyle approves. Kyle's decisions are in §25. Questions
that need more references stay [open] (§24).

**Reference authority (Kyle, 2026-10-01 00:40Z):**
- **6A** for the Real HQ environment.
- **6B** for the Real agent aliases.
- **6C** for the Fantasy HQ environment.
- **6D** for the Fantasy agent aliases.
- **7A** for Real functional spaces (workstations, server bay, Real prop families) [Kyle 00:51Z].
- **7B** for Fantasy functional spaces (workstations, Arcane Core/Archive, Fantasy prop families, banners) [Kyle 00:51Z].
- **8** for the construction system in both themes (scenes, parity, roles, ambient workers, construction props) [Kyle 01:01Z]. Its exact building is illustrative.

Earlier references stay valid for what they were approved for. Where an older *character* reference conflicts with 6B or
6D, 6B or 6D wins. Where a generated incidental detail conflicts with this spec, the spec wins.

Written 2026-10-01 on `claude/world-5h`, in answer to "PASS 5H — ITERATION 2" (Kyle, 2026-10-01 00:06Z).

References are stored in `docs/world/references/pass5h-iter2/` (ref1–ref6, `ref6r-6a-6d-aliases.png`, `ref7a-real-functional-spaces.png`, `ref7b-fantasy-functional-spaces.png` and `ref8-construction-gameplay-scale.png`). The 5H iteration 1 evidence it is compared
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
  *(Banner colour superseded by C26: Fantasy organizational banners are green and gold; blue is a local secondary.)*
- The artificer's workshop has a glowing arcane ring device, with the cyborg inspecting it.
  *(Naming superseded by C25: "forge / artificer workshop" is Claude's space; Codex's is the arcane-mechanical analysis station.)*
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
- Each character is also drawn **at a modern desk with monitors**. *Superseded by 6B:* Real uses different human role
  aliases, not these characters at desks.

DO NOT COPY:
- The exact sprites, pixel for pixel. Kyle said so.

HILLINK APPLICATION:
- A **Fantasy** character reference, together with Reference 4. 6D outranks both where they differ.
- The question it raised (do Real characters keep the dwarf, cyborg and King bodies?) is settled by 6B: **no**. Real
  aliases are human role translations (§0, §4).

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
- Its ChatGPT, Claude and Codex sprites are **Fantasy** aliases. 6D outranks them where they differ.
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
  These match the §6 per-archetype `work` clips. *Superseded by 6B for Real costumes:* this "Real" sheet still dressed
  the agents as their Fantasy archetypes.

DO NOT COPY:
- **The side-scroller camera** [Kyle]. Every panel except 5 and 6 is a side cutaway.
- **Large floating name labels** over agents and rooms [Kyle C13].
- **The "HILINK" spelling** on the HQ sign. The brand is **Hillink**.
- **The fantasy castle on Real's horizon** (panels 1 and 7) [Kyle C11].
- **Codex with a red visor across both eyes.** About half of the Codex frames in panel 2 show a red band over both eyes,
  and some show a helmet or cap. That contradicts **Fantasy** Codex's lock of ONE red eye, not a full robot [Kyle C2].
  Real Codex has no cybernetic eye at all (6B). Treated as a reference artifact.
- **Codex's hair colour varies** between frames (black and brown). Treated as a reference inconsistency.
- **Hard-hat workers who look like Claude.** The ambient worker in the server bay and outside T0 wears the same yellow
  hard hat as construction Claude. See §25 C15 and C24 (§20 rule).
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

### REFERENCE 6: Batch 2B, Real agents and Real T0 (`ref6-batch2b-real-t0.png`) [Kyle, 2026-10-01 00:32Z]

**Approved by Kyle as a strong visual-direction reference.** For the topics below it is **more authoritative than
Reference 5**:
- Real agent appearance
- Real T0 materials and interior character
- character and environment scale
- gameplay pixel density
- Real workstations
- modern density
- the Real lighting and material language

It does not override approved architectural or canonical rules. Where the spec and an accidental generated detail
disagree, the spec wins [Kyle].

It has nine panels:
1. the Real T0 interior in the 2.5D isometric gameplay view
2. Real character sheets
3. walking
4. working and interaction
5. workstation close-ups
6. character detail close-ups
7. scale
8. Real props
9. the same room at day, dusk and night

USE:
- **Real identity:** a small, living, handcrafted technology and engineering HQ [Kyle]. Not a corporate office, a
  lodge, a sterile visualization, a large campus, a fantasy building with computers, or a side-scroller base.
- **Camera** (panel 1): a 2.5D isometric cutaway that matches Hillink's camera. It is guidance for viewing angle, room
  readability, depth and furniture scale.
- **Real T0 layout** (panel 1): one compact single-level open-plan HQ.
  - Three role corners: ChatGPT back left, Claude back right, Codex right with the server bay behind glass.
  - One central shared table with stools and a lamp, plus a sofa: the C20 planning, break and informal meeting space.
  - An entrance with a door and signage.
  - Railings, exterior planters, a paved approach and greenery.
- **Real materials** (panel 1):
  - dark concrete or blockwork walls
  - stone-tile floor with rugs
  - a glass partition with a steel frame
  - steel railings
  - modern desks with 2–3 monitors
  - server racks with LED strips
  - warm practical lamps (pendants, wall sconces, desk lamps)
  - shelves of books and binders
  - many potted plants
  - cables, papers and personal items
  Warm and dense, but modern [Kyle C19].
- **Character scale** (panel 7): **24 art pixels tall** at gameplay zoom [Kyle].
  - A door is about 1.4h.
  - A shelf is about 1.2h.
  - A plant is about 0.8–1h.
  - A desk is about 0.45h.
- ~~Real character designs (panels 2, 6)~~ **SUPERSEDED by 6B (Kyle, 00:40Z).** This board carried too much Fantasy
  design into Real. These earlier Real locks are withdrawn:
  - Real ChatGPT's crown, and his green and gold jacket
  - Real Claude as dwarf-like (stout dwarf body, harness costume), with the hard hat only contextual
  - Real Codex's red cybernetic eye and cybernetic shoulder
  - the requirement that the Real and Fantasy aliases share one physical face
  The current Real aliases are in **REFERENCE 6A–6D** below and in §4.
- **Clip semantics** (panels 3, 4), still valid with 6B's characters:
  - walk in profile, about 4 frames
  - ChatGPT: idle, working, talking, interacting
  - Claude: idle, working, building, reading
  - Codex: idle, inspecting, testing, using a tablet
  Proportions stay stable across all of them [Kyle].
- **Workstations** (panel 5):
  - **ChatGPT:** command and planning, with a world map, three monitors, a leather armchair and plants. The green and
    gold banners are **not** carried into Real [Kyle C22].
  - **Claude:** engineering and building, with a pegboard wall of tools, parts bins, boxes, a workbench desk with
    monitors and a red task chair. *(Superseded by 7A.4: Real Claude's space is a construction workshop, not a
    monitor desk.)*
  - **Codex:** inspection and testing, with server racks and blue LEDs, two monitors with readouts, a darker, cooler
    corner and diagnostic gear.
- **Prop kit** (panel 8): sofas, armchairs, desk chairs, desks, a fridge, a cabinet, monitors, lamps, potted plants,
  bookshelves, a server rack and side tables.
  - It is a good starting inventory for the Real T0 prop set.
- **Lighting** (panel 9): the same room at day, dusk and night with the same assets. This confirms §9.

DO NOT COPY:
- **Codex's look in the gameplay scene** (panel 1). His eye area reads as a red band. Real Codex has no red eye at all
  (6B). For **Fantasy** Codex, the single red eye must read as single at 24 pixels: one bright red cluster on one side,
  never spanning both eyes [Kyle C2].
- **The dog on the sofa** and any other decorative animals or people. They are not required, and never canonical
  [Kyle].
- **Exact prop placement, the floor plan, or text on banners and screens.** Verify every word independently. The sign
  here correctly reads "HILLINK"; keep the spelling **Hillink** regardless of the reference [Kyle].
- **Impossible geometry.** Walls that end in mid-air and railings that cut through rooms are generation artifacts.
- **Floating name labels** over agents [Kyle C13].
- **All of this board's Real character designs.** They are superseded by 6B.

HILLINK APPLICATION:
- **Real T0 = this composition** in Hillink's isometric room system, as a single storey that matches its exterior (C16).
  - Three role corners, one shared central table zone, one server bay, an entrance and circulation.
  - The open floor stays clear for navigation (§7).
- The 24-pixel target sets the relative scale of the T0 World: character, furniture, room and building. It is not a
  licence to resize the existing World arbitrarily [Kyle].
- Workstation props are visual metaphors for canonical activity. They create no capability and no work [Kyle].
- The panel 5 corners are the starting story-prop clusters for §11.
- ~~Panel 6 detail callouts define the identity features~~ Superseded: identity features now come from 6B (Real) and 6D
  (Fantasy), §4.

CONFLICTS / RESOLUTION:
- C15, C16, C17, C19 and C20 were resolved by Kyle with this reference. See §25.
- C18 was resolved here, then superseded by the 6A–6D alias model.
- C21 and C22, raised here, were resolved by Kyle with 6A–6D. See §25.

### REFERENCE 6A–6D: corrected alias board (`ref6r-6a-6d-aliases.png`) [Kyle, 2026-10-01 00:40Z]

This board **corrects** Reference 6's character interpretation. Kyle asked for its four panels to be analysed
separately, because each has its own authority:
- **6A**: Real HQ environment
- **6B**: Real agent aliases
- **6C**: Fantasy HQ environment
- **6D**: Fantasy agent aliases

**The correction [Kyle].** One canonical agent has a Real alias and a Fantasy alias. **The aliases do not need to be the
same physical character in different clothes.** Continuity across themes comes from:
- role and behaviour
- animation semantics
- workstation and function
- recurring identity cues and palette accents, where useful
- personality and archetype
It does **not** come from identical anatomy, face, age, clothing or species.

#### 6A: Real HQ environment (authoritative for the Real environment)

USE:
- **The modern T0 HQ:** compact, complete, modern and expandable. It is one storey, and three exterior views show
  the same building.
- **Materials:**
  - concrete walls with a large Hillink logo
  - glass partitions with steel frames
  - steel and dark metal trim
  - rooftop AC units
  - modern desks with monitors
  - server racks with LED strips behind glass
  - warm practical lamps
  - plants
  - books and shelving
  - controlled clutter
- **Open-plan organization:**
  - ChatGPT's command and planning corner, with a wall map and planning displays.
  - Claude's building and engineering corner, with shelving, tools and parts.
  - Codex's inspection and testing corner, beside the server bay.
  - One shared central zone (sofa and table) for planning, breaks and informal meetings [C20].
- **A top-down floor plan** confirms one plausible, coherent volume [C16].
- **Exterior:** a parking area with a pickup truck, planters, wall lamps and a paved approach.

DO NOT COPY:
- Generated text, accidental geometry or impossible spatial relationships.
- The floating labels; rooms are identified by their environment [C13].
- Decorative entities, such as the truck, as canonical entities or capabilities.

HILLINK APPLICATION:
- **This is Real T0** in Hillink's isometric room system (§11, §18).
- It replaces Reference 6 panel 1 as the authority for the Real environment. The two agree on materials, layout program
  and density.

#### 6B: Real agent aliases (authoritative for Real characters)

USE:
- **Real ChatGPT is the BOSS, executive and orchestrator.**
  - A human man in an **all-black suit**: black jacket, black tie, white shirt.
  - Dark, neat hair and a polished executive look.
  - Clips: idle, walk, work (desk), talk, interact.
  - Gear: a phone and a watch.
  - **No crown, no green king jacket, no medieval or fantasy clothing** [Kyle].
- **Real Claude is a CONSTRUCTION WORKER and builder.**
  - A human man (**not a dwarf**) with a red-orange beard and hair.
  - A **hard hat** (yellow-orange), an orange hi-vis vest with reflective stripes, a tool belt, gloves, work boots and
    tools (hammer, saw).
  - Clips: idle, walk, work (build), use tool, talk.
  - The hard hat is **part of his Real identity**, not only contextual [Kyle].
- **Real Codex is an ENGINEER.**
  - A human man with dark hair and **glasses**.
  - A grey hoodie under a dark jacket, headphones around his neck, a tablet and a backpack.
  - Clips: idle, walk, work (desk), inspect, talk.
  - **No cybernetic eye, no cybernetic shoulder, no armour, no robot silhouette** [Kyle].
- **Palette swatches** shown on the board:
  - ChatGPT: blacks and greys with a white shirt.
  - Claude: orange, brown and tan.
  - Codex: greys and blues.

DO NOT COPY:
- Sprites pixel for pixel. Production art is original [C9].
- Generated text.
- The "CEO" job-title label as an in-world claim. The role is a visual metaphor for orchestration, not a capability.

HILLINK APPLICATION:
- These are the Real aliases in §4. All three are standard human body plans at 24 pixels.
- Their silhouette signatures in Real:
  - ChatGPT: a dark suit block with a white collar and tie.
  - Claude: a hard hat with a hi-vis vest and a beard.
  - Codex: glasses, headphones, a hoodie and a backpack.

#### 6C: Fantasy HQ environment (authoritative for the Fantasy environment)

USE:
- **Fantasy T0 is a compact, established outpost.**
  - Stone walls with crenellated corner towers and a timber interior structure.
  - A dock on the water.
  - A red flag outside.
  - Three exterior views of the same building, and a top-down floor plan.
- **The same organizational scale and program as 6A, translated:**
  - ChatGPT's command and strategy corner, with a large map.
  - Claude's forge and building corner, with a hearth.
  - Codex's arcane inspection corner, with a glowing violet crystal device.
  - A shared central table on a rug, and a seating zone.
- **Materials:** stone, timber, iron, banners, candles, torches, hearth fire, rugs, shelves and crystals.
- **Lighting:** warm candle and torch pools; a violet arcane glow at Codex's corner.
- **Density and storytelling:** dense, with clear circulation.

DO NOT COPY:
- **Modern monitors and office chairs** at the Fantasy desks. They violate C17: Fantasy translates function, not
  object.
- **A modern red sofa** carried over from Real. Translate the function (a seating or rest zone) into Fantasy furniture,
  such as a bench, settle or furs.
- **Claude's corner as a desk.** It reads weakly as a forge. The Fantasy build station should be clearly a forge or
  workshop (§11, §13).
- Generated text and floating labels.

HILLINK APPLICATION:
- **This is Fantasy T0** (§12, §18): the same three role corners, shared zone and circulation as Real T0, in the
  Fantasy material language.

#### 6D: Fantasy agent aliases (authoritative for Fantasy characters)

USE:
- **Fantasy ChatGPT is the KING and orchestrator.**
  - A young King with brown hair and a gold crown with a red gem.
  - A green robe with a fur collar and gold trim, and a sceptre.
  - Palette: greens and golds.
  - Clips: idle, walk, work (table), talk, interact.
- **Fantasy Claude is the DWARF artificer.**
  - Dwarf anatomy, with a large red-orange beard and hair.
  - Leather apron and armour, gloves, a hammer and tools.
  - Palette: oranges and browns.
  - Clips: idle, walk, work (forge), build, talk.
- **Fantasy Codex is the ARCANE INSPECTOR.**
  - A human with dark hair and **ONE red cybernetic eye**.
  - A dark hooded coat with brass trim, and mechanical or arcane gear.
  - A staff or tool, and an arcane book.
  - Palette: dark blues, greys and violet.
  - Clips: idle, walk, study (table), inspect, talk.

DO NOT COPY:
- Sprites pixel for pixel.
- Generated text.

HILLINK APPLICATION:
- These are the Fantasy aliases in §4.
- The exact balance of arcane and mechanical in Fantasy Codex was open here; **resolved by C23 (00:51Z):** an
  arcane-mechanical hybrid with one red eye (§4).

### REFERENCE 7A: Real T0 functional spaces (`ref7a-real-functional-spaces.png`) [Kyle, 2026-10-01 00:51Z]

The board is the same building as 6A, with no fantasy elements, at 24 px in 2.5D isometric. It has nine panels:
- 7A.1 overview
- 7A.2 character context
- 7A.3–7A.6 close-ups of the four functional spaces, each with key props and gameplay-scale clips
- 7A.7 prop set
- 7A.8 lighting
- 7A.9 scale

Authoritative for Real functional spaces. 6A still wins on the overall building and 6B on the characters.

USE:
- **7A.3 command / orchestration office (ChatGPT, boss in a black suit).**
  - Props: an executive desk with monitors and a leather chair, a large wall map or plans, a bookshelf, a globe,
    a lamp, plants and a rug.
  - Clips: idle, walk, look at map, write, point, talk, interact.
- **7A.4 construction / builder workshop (Claude, hard-hat construction worker).**
  - Props: a workbench with blueprints, wall-hung tools, a red tool chest, material stacks, shelving, a stepladder
    and traffic cones.
  - Clips: idle, walk, hammer, build, carry, look at plan, talk.
- **7A.5 engineering / testing station (Codex, engineer with glasses, hoodie and tablet).**
  - Props: a desk with two monitors, a laptop or tablet, test equipment, components, a whiteboard with diagrams, a
    lamp and plants.
  - Clips: idle, walk, study, inspect, write, interact, talk.
- **7A.6 server / infrastructure bay.**
  - Props: server racks with blue LEDs behind glass, a console, network gear, cables, a tool cart, crates, a plant and
    a light.
  - Station clips (performed by an agent who is there): idle, inspect, interact, maintain.
- **7A.7 prop set.** One coherent modern vocabulary: sofa, shelving, cabinets, lockers, monitors, racks, plants, mugs,
  maps, chairs and tables.
- **7A.8 lighting.** The same room at day (bright), dusk (warm) and night (moody), matching §9.
- **7A.9 scale.** Character 24 px, door about 1.4×, chair about 0.5×, table about 0.5×.
- **Density per close-up.** Each station is compact, inhabited and readable, with clear floor around the agent.

DO NOT COPY:
- **The second hard-hat worker beside Claude in 7A.1.** He duplicates Claude's silhouette and violates C15. Real
  helpers are now governed by C24 (resolved by ref 8).
- **The two large green "HILLINK" fabric banners in 7A.3.** They are too prominent for understated branding and sit
  close to the C22 line. Branding is reduced to modern formats (§11).
- Generated text and the floating name labels (C13).
- The overview's density. 7A.1 is close to the upper bound and its floor is nearly full. Use the close-ups for station
  density and keep negative space (§7).
- Exact prop positions, duplicated objects and the floor plan of the composite.

HILLINK APPLICATION:
- **The four Real functional spaces** (§11): three agent stations plus a server bay that is infrastructure, not an
  agent or department.
- **Real prop families** (§11, §16): office, construction, engineering, server/infrastructure, storage, lighting,
  plants, planning, general clutter.
- **Per-role clip sets** (§6). They match 7B exactly.

### REFERENCE 7B: Fantasy T0 functional spaces (`ref7b-fantasy-functional-spaces.png`) [Kyle, 2026-10-01 00:51Z]

The board is the same building as 6C, with no modern monitors, at 24 px in 2.5D isometric. Its panels are labelled
7A–7J on the image; here they are cited as "7B 7C" and so on:
- 7B 7A overview, 7B 7B character context
- 7B 7C–7B 7F close-ups of the four functional spaces
- 7B 7G banner and colour reference
- 7B 7H prop set, 7B 7I lighting, 7B 7J scale

Authoritative for Fantasy functional spaces and Fantasy banners. 6C still wins on the overall building and 6D on the
characters.

USE:
- **7B 7C war / command table (ChatGPT, King in green and gold).**
  - Props: a large map table with markers and scrolls, an astrolabe, a bookshelf, green and gold banners, candles
    and plants. The chair reads as a command seat.
  - Clips: idle, walk, look at map, write, point, talk, interact.
- **7B 7D forge / builder workshop (Claude, dwarf artificer).**
  - Props: a real stone forge with fire, an anvil, wall tools, materials, blueprints on an easel, a workbench, crates
    and barrels.
  - Clips: idle, walk, hammer, build, carry, look at plan, talk.
  - This is the forge that 6C lacked.
- **7B 7E arcane analysis station (Codex, red-eyed arcane inspector).**
  - Props: a violet arcane orb, scrolls, brass instruments (wheels, gears), books, diagnostic tools, mechanical
    components and a crystal lamp.
  - Clips: idle, walk, study, inspect, write, interact, talk.
  - It mixes brass mechanism with contained magic, which shows C23's hybrid directly.
- **7B 7F Arcane Core / Archive (Fantasy server equivalent).**
  - Props: a contained blue core crystal, rune columns, a scroll archive, conduits, a control table and a crystal
    lamp.
  - Station clips: idle, inspect, interact, maintain.
- **7B 7G banners.** Primary green and gold; secondary blue and gold. The board's note says to use green as the primary
  Hillink colour and blue for support and Codex's area. This confirms C26.
- **7B 7H prop set.** Tables, chairs, shelves, chests, cabinets, benches, rugs and plants, all in timber, iron and
  cloth.
- **7B 7I lighting.** Day, dusk and night of the same room, matching §9.
- **7B 7J scale.** It matches 7A.9: character 24 px, door about 1.4×, chair and table about 0.5×.

DO NOT COPY:
- **The screen-like blue panels** on Codex's desk (7B 7E) and on the core's control table (7B 7F). They come close to
  monitors. Under C17 they are drawn as rune slates or crystal panes (§12).
- **Blue-and-gold banners as organizational heraldry.** Blue is a local secondary only (C26).
- Generated text, the floating name labels, and the mislabelled panel letters.
- The overview's density and exact layout, as in 7A.
- Any reading of the Arcane Core as "server racks with medieval textures". The rune columns must not repeat the rack
  rhythm of LED-dotted slabs.

HILLINK APPLICATION:
- **The four Fantasy functional spaces** (§12).
- **Fantasy prop families** (§12, §16): command/planning, forge/building, arcane engineering, archive/core, storage,
  lighting/fire, plants, books/scrolls, general clutter.
- **Banner rule** (C26).
- **The Fantasy Codex hybrid** (C23).

### 7A ↔ 7B paired comparison (semantic mappings) [Kyle C25, 00:51Z]

Each row is **one canonical space with two visual readings**, not two systems. The pair shares its location role,
its slot in the T0 layout, the light-equals-activity behaviour and the clip set.

| Canonical space | Real (7A) | Fantasy (7B) | Shared clips | Light when active |
|---|---|---|---|---|
| Orchestration (ChatGPT) | command / orchestration office: executive desk, displays, wall map, documents, books | war / command table: map, markers, scrolls, astrolabe, correspondence, candles, green and gold banners | idle, walk, look at map, write, point, talk, interact | desk lamp and monitors ↔ candles |
| Building (Claude) | construction / builder workshop: workbench, tools, tool chest, blueprints, materials, ladder | forge / artificer workshop: forge, anvil, hammer, tools, plans, materials, crates, barrels | idle, walk, hammer, build, carry, look at plan, talk | work lamp ↔ forge fire |
| Inspection / testing (Codex) | engineering / testing station: monitors, laptop or tablet, test equipment, components, whiteboard | arcane-mechanical analysis station: orb, brass instruments, diagrams, scrolls, books, components | idle, walk, study, inspect, write, interact, talk | monitor cyan ↔ violet/blue arcane glow |
| Infrastructure (no agent) | server / infrastructure bay: racks, networking, console, cables, tool cart | Arcane Core / Archive: contained crystal, rune columns, conduits, scroll archive, control table | idle, inspect, interact, maintain | rack LEDs ↔ crystal pulse |

What the pair agrees on:
- **Scale.** 24 px characters; door, chair and table proportions are identical.
- **Lighting.** The same three times of day.
- **Density.** Per-station density is the same.
- **Agent roles.** Each role is in its own station.
- **Clip sets.** One set per role, identical across themes.

What deliberately differs:
- **Materials.** Real uses concrete, glass and steel; Fantasy uses stone, timber and iron.
- **Light sources.** Real uses electric light; Fantasy uses fire and crystal.
- **Branding.** Real has an understated logo; Fantasy has green and gold banners.
- **Codex's look.** The Real alias has no cybernetics; the Fantasy alias is the hybrid with one red eye.

### REFERENCE 8: construction at gameplay scale, Real and Fantasy (`ref8-construction-gameplay-scale.png`) [Kyle, 2026-10-01 01:01Z]

The board shows one construction event in both themes at 24 px in 2.5D isometric. It is laid out as follows:
- **8A:** the Real sequence in 7 scenes.
- **8A.1:** Real ambient workers, Real Claude, Real Codex, and Real construction props.
- **8B and 8B.1:** the same for Fantasy.
- **8C:** a stage-by-stage comparison of the two themes.
- **8D:** the same floor plan through all stages, top-down.
- **8E:** construction lighting at day, dusk and night.

It is authoritative for the construction **system**: stage legibility, parity, roles, ambient workers and construction
props. The exact generated building is illustrative only [Kyle].

USE:
- **Seven readable scenes per theme**, matched one to one across themes:

  | Scene | Real (8A) | Fantasy (8B) |
  |---|---|---|
  | 1 site / planning | survey tripod, string lines, cones, a plan table, material pallets | a survey tent, rope lines, stakes, a plan table, stone and timber piles |
  | 2 foundation | formwork, a poured slab, block courses, a concrete mixer | a stone footing ring and block courses |
  | 3 structure | structural steel columns and beams | timber post-and-beam frame on the stone base |
  | 4 walls + roof | concrete or panel walls going up, roof deck started, a crane hook | masonry walls going up, slate roof started, scaffolding |
  | 5 systems / rough-in | ducts, cable trays, steel studs, racks arriving | timber partitions, runic conduits, a crystal panel being set |
  | 6 interior / finishing | drywall closed, racks in, desks arriving, plants | shelving, rugs, banners and lights going in |
  | 7 operational | the finished, furnished, lit T0 | the finished, furnished, lit T0 with green and gold banners |

- **Claude as the builder.** Clips: idle, walk, build, carry, inspect plan, talk. Both aliases.
- **Codex as the inspector.**
  - Real clips: idle, walk, inspect, test, write, talk.
  - Fantasy clips: idle, walk, inspect, study, write, talk.
- **Ambient workers as a varied crew.**
  - Real clips: idle, walk, carry, use tool, hammer, drill, weld, lift, push, point, talk.
  - Fantasy clips: idle, walk, carry, hammer, mason, carpenter, push, lift, point, talk.
  - Workers vary in hard-hat colour (white, grey, blue, yellow), vest, body, hair, tools and skin tone. The Fantasy
    crew has its own trades, such as mason and carpenter.
- **Construction prop rows.**
  - Real: cones or barriers, materials, steel beams, concrete, tools, a scissor lift, a forklift, framing, HVAC units,
    electrical, drywall, doors and windows, interior and office props.
  - Fantasy: stone blocks, timber beams, scaffolding, rope and pulley, tools, crates and barrels, lanterns and
    torches, rune stones, crafting parts, a workbench, anvil and forge, banners, doors and windows, interior props.
- **8C.** The two themes share stage timing, camera and footprint.
- **8D.** The intent is one footprint carried through every stage.
- **8E.** The same art serves day, dusk and night. At night, Real uses work lights and Fantasy uses torches and
  lanterns.

DO NOT COPY:
- **Modern machinery and gear in Fantasy.**
  - The yellow forklift in 8B scene 3.
  - Yellow modern hard hats on Fantasy workers in 8B scenes 1–2.
  - The grey AC units outside the finished Fantasy building in 8B scene 7.
  - The blue vehicle at the Fantasy site in 8C.
  - Fantasy hauls with carts, sledges, rope and pulley and windlass; the crew wears cloth caps, hoods or nothing on
    their heads.
- **Footprint and massing mutation.**
  - 8D's site outline differs from the later rectangle.
  - The Fantasy foundation outline differs from its later walls.
  - Real scene 3's steel frame reads taller than the one-storey finished building.
  - Windows, doors and room splits shift between scenes.
  - All of this is the "AI-image architectural mutation" Kyle bans. See the §17 same-building rule.
- **Workers who are near-Claude.** Several 8A.1 workers combine a yellow-orange hat, an orange vest and a reddish
  beard, so they read as Claude copies. The C24 rule (§20) forbids that combination.
- **Exact worker count**, duplicated workers, malformed tools, generated text and the panel labels.
- **The dense overlap in scenes 3–5**, where agents almost disappear into the crew. Agents must stay readable on top
  (§7, §20).

HILLINK APPLICATION:
- **§17:** the seven scenes become the **visual scene grouping** over the existing truthful mapping. Canonical stages
  are unchanged.
- **§20 and C24:** the ambient-worker rule.
- **§6:** the Claude, Codex and worker construction clips.
- **§16:** the construction prop families.
- **§9:** construction lighting.

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
  | Claude is implementing or building | construction-worker Claude physically building with modern tools and materials | dwarf artificer Claude with hammer and forge |
  | Codex is inspecting or testing | engineer Codex with engineering and testing equipment | arcane-mechanical Codex analysing at his arcane-mechanical station |
  | ChatGPT is coordinating | the boss (black suit) at planning displays and the strategy table | King ChatGPT at the command table |

- **No drift.** Switching theme changes only the picture. It never creates, removes, duplicates or changes the state of
  an agent. There is never a "Real World state" and a separate "Fantasy World state".
- **Aliases are thematic representations, not one body in two outfits** [Kyle 00:40Z].
  - Cross-theme continuity comes from role, behaviour, animation semantics, workstation and function, deliberately
    chosen recurring cues and palette accents, and personality or archetype.
  - It does **not** require the same anatomy, face, age, clothing or species.
  - Example: Real Claude is a human construction worker; Fantasy Claude is a dwarf artificer. Both build.
- **Same canonical work, different performance.** One canonical activity may be animated differently by each alias
  (for example, using a power tool versus hammering at a forge). Both must show the same canonical state.
- **Extensible.** A new agent gets one canonical record, and each theme supplies an alias. Both aliases inherit the
  Hillink visual language and express the same canonical *role* (§4, §5, §19).
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
- [Kyle, ref 6] **Target: 24 art pixels tall** at normal gameplay zoom (narrowed from ref 5's 22–26). All three Real
  aliases are standard humans. In Fantasy, dwarf Claude is about 2 pixels shorter and wider.
  - The goal is the relationship between character, furniture, room and building. It is not permission to resize the
    World arbitrarily [Kyle].
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
- [proposed] Each core agent owns one silhouette signature **per alias**, and no future agent may reuse it in that theme:

  | Agent | Real alias (6B) | Fantasy alias (6D) |
  |---|---|---|
  | ChatGPT | a dark suit block with a white collar and tie | crown points plus a robe or cape widening the lower outline |
  | Claude | a hard hat and hi-vis vest plus a beard | a broad, short dwarf body with a beard mass, plus a hammer |
  | Codex | glasses, headphones around the neck and a backpack | a hooded coat with an asymmetric head (one red eye) |

- [Kyle 00:40Z] **Identity locks per alias.** These hold in every view, clip and state of that alias.
  - **ChatGPT (one canonical agent):**
    - **Real: the boss, executive and orchestrator.** A human man in an all-black suit, polished and authoritative. No
      crown, no green king jacket, no medieval or fantasy clothing.
    - **Fantasy: the King and orchestrator.** Crown, royal clothing, green and gold [C1], command symbolism, a regal
      silhouette.
  - **Claude (one canonical agent):**
    - **Real: a construction worker and builder.** A human man, not a dwarf, in practical workwear. The **hard hat is
      part of his Real identity**, with work boots and a tool belt or construction gear. He clearly reads as the person
      physically building things. He keeps a red-orange beard and hair (6B).
    - **Fantasy: a dwarf builder and artificer.** Dwarf anatomy, a large red-orange beard, forge and building identity,
      hammer and tools, artificer styling. Headgear is contextual [C3]: a leather cap or smith's helmet, never a modern hard hat (ref 8).
  - **Codex (one canonical agent):**
    - **Real: an engineer.** A human man in technical or professional workwear, with engineering tools, a computer,
      plans or inspection gear. No cybernetic eye, no cybernetic shoulder, no armour, no robot silhouette.
    - **Fantasy: an ARCANE-MECHANICAL HYBRID inspector** [Kyle C23, 00:51Z]. Not a pure wizard and not a pure machine.
      Human, with dark hair and **ONE red eye** [C2] (Fantasy alias only). Mechanical half: the red eye, brass
      fittings, precision instruments and mechanical components. Arcane half: controlled magical energy, an orb or
      crystal, runes, scrolls and books. Never a visor across both eyes, never two cybernetic eyes, never a full
      robot or plated body, never a pointed-hat, long-beard wizard.
- [proposed] Palettes per alias, from the 6B and 6D swatches:

  | Agent | Real | Fantasy |
  |---|---|---|
  | ChatGPT | black and charcoal with a white shirt; a small accent is optional | green and gold [C1] |
  | Claude | orange hi-vis and tan with a brown tool belt and a yellow-orange hard hat | orange-brown and leather, with forge-orange glow |
  | Codex | grey and blue-grey, with a screen-blue accent | dark blue and grey with brass trim, a red eye, and blue/violet arcane glow (blue is Codex's local secondary, C26) |

- [Kyle] **Identity is stable across animation.** Walking Claude is the same Claude, working Codex doesn't change
  form, and seated ChatGPT keeps his proportions. This holds **within** each alias.
- [Kyle 00:40Z, supersedes C4's "same individual"] **Across themes, recognition comes from role, not anatomy.** A
  player recognizes "the boss / the King", "the builder", "the engineer / inspector" by role, behaviour, workstation
  and animation semantics. Shared motifs are optional and deliberate, never required.

## 5. Agent archetype rules

- [Kyle] The three core roles, with their alias per theme:
  - **ChatGPT = orchestrator.** Real: boss or executive. Fantasy: King.
  - **Claude = builder.** Real: construction worker. Fantasy: dwarf artificer.
  - **Codex = inspector or engineer.** Real: engineer. Fantasy: arcane-mechanical hybrid inspector [C23].
- [proposed] An archetype is a data record. Its fields:
  - `body` (a body plan: humanoid-short, humanoid-standard, broad, small-winged, hunched, large-creature or mechanical)
  - `silhouetteSignature`
  - `palette` (dominant, secondary, accent, glow)
  - `equipment` (an attachment-point → item map)
  - `clipOverrides` (for example, a winged agent hovers instead of walking)
  - `workVerb` (build, inspect, plan, ledger, outreach, analyze, review, model…)
  - `workstation` (§19)
  - `realForm` / `fantasyForm` (§13): each alias has its own body plan, silhouette, palette and equipment. They may
    differ in species, age and anatomy [Kyle 00:40Z].
- [proposed] Body plans are shared skeletons. Archetypes are skins on them. A new archetype that fits an existing body
  plan needs only a palette, equipment and a work verb.
- [Kyle] Scout, Treasurer, Oracle, Cyclops, Qwen, Gemma and Kyle are examples of range, not inhabitants.

## 6. Animation requirements

- [ref 4] The clip matrix is five directions by these clips:
  - `idle`, `walk`, `run`, `work`, `talk`, `think`, `carry`, `inspect`, `celebrate`
  - plus 5H's `waiting`, `blocked` and `type` (seated)
  - Left-facing views mirror the right-facing ones, **except where mirroring would move an identity feature** (below).
- [Kyle 2B §7, ref 6] **Mirroring must not break an identity lock.** 5H builds left-facing views by mirroring the
  right-facing ones. For a symmetric agent that is harmless, but Fantasy Codex's single red eye and any one-sided
  augmentation would jump to the other side of his body whenever he turns. That breaks "identity and proportions stable
  across every view and state" and the one-red-eye lock.
  - [proposed] Every archetype declares `asymmetric: true|false`. Asymmetric agents get authored left-facing views (or
    a mirrored base with the identity layer redrawn on the correct side), never a plain flip.
  - [proposed] Fantasy Codex's red eye and augmentation stay on one fixed side of his body in all five views, both facings
    and every clip; in views where that side faces away, the eye glow may still show as a rim light, but never moves.
  - [proposed] The same check applies to held items and one-sided details on any alias (Fantasy ChatGPT's sceptre hand,
    either Claude's tool side, Real Codex's backpack strap) and to future agents; the §4 silhouette test is run on both facings.
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

- [proposed] `work` is per alias (6B, 6D):
  - **Claude:** Real uses tools on construction (`work (build)`, `use tool`). Fantasy hammers at the forge (`work
    (forge)`, `build`).
  - **Codex:** Real works at the desk and inspects with a tablet or gear. Fantasy studies at the table and inspects with
    arcane tools.
  - **ChatGPT:** Real works at the desk and gestures to planning displays. Fantasy works at the table and gestures over
    the map.
  - Future agents declare their own (ledger, outreach…).
- [Kyle 00:51Z, 7A/7B] **Per-role clip parity across themes.** Both boards give each role the *same* clip set; only
  the props and the alias performing it differ:

  | Role | Clips (Real 7A = Fantasy 7B) | Real performs it at | Fantasy performs it at |
  |---|---|---|---|
  | ChatGPT | idle, walk, look at map, write, point, talk, interact | executive desk, wall map, displays | war/command table, map, scrolls |
  | Claude | idle, walk, hammer, build, carry, look at plan, talk | workbench, materials, blueprints | forge, anvil, materials, plans |
  | Codex | idle, walk, study, inspect, write, interact, talk | monitors, test equipment, whiteboard | orb, instruments, scrolls |
  | Infrastructure (a place, not an agent) | idle, inspect, interact, maintain (performed by Codex) | server bay | Arcane Core/Archive |

  - [proposed] These are `work` variants and named poses inside the §6 matrix (`look at map`, `point`, `write`,
    `hammer`, `build`, `look at plan`, `study`, `maintain`), not a second clip system. Each maps to the existing
    canonical activity; none implies state that isn't canonical.
  - [proposed] "maintain" at the infrastructure station is a Codex pose shown only when canonical state puts Codex
    there; the server bay or core never animates an agent by itself.
- [Kyle 01:01Z, ref 8] **Construction clips:**
  - **Claude**, both aliases: idle, walk, build, carry, inspect plan, talk. `measure` and `direct` are proposed poses.
  - **Codex:**
    - Real: idle, walk, inspect, test, write, talk.
    - Fantasy: idle, walk, inspect, study, write, talk.
  - **Ambient workers:** a separate, cheaper clip set (§20).
    - Real: idle, walk, carry, use tool, hammer, drill, weld, lift, push, point, talk.
    - Fantasy: idle, walk, carry, hammer, mason, carpenter, push, lift, point, talk.
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
- [Kyle 00:51Z] **Compact, inhabited, purposeful, with navigable negative space.** Spaces are detailed, warm and
  slightly imperfect or handcrafted, but never so cluttered that agents disappear, paths become unreadable,
  animations are hidden, or every tile carries an object. Each area must be identifiable without labels; there are
  no permanent floating labels [C13]. 7A/7B show the right density per station; their overview panels (7A.1, 7B 7A)
  are the upper bound, not the target.
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
- [ref 7A.8, 7B 7I] Day (bright), dusk (warm) and night (moody) of the *same* room in both themes confirm this rule.
- [Kyle, ref 8E] Construction sites follow the same rule. At night, Real adds work lights and Fantasy adds torches and
  lanterns. The assets are the same; only the lighting differs.
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
- [Kyle 2B, ref 7A.9/7J] Using character height h = **24 art pixels**:

  | Element | Size |
  |---|---|
  | Door | about 1.4h tall, 0.6h wide [ref 6, 7A.9/7J] |
  | Storey (floor to floor) | about 2–2.5h. Ref 6's T0 is a single storey with walls of about 2h visible in the cutaway; ref 3a reads about 2.6h |
  | Desk or table | 0.45–0.5h [ref 7A.9/7J] |
  | Chair seat | 0.3h (overall chair with back about 0.5h [ref 7A.9/7J]) |
  | Server rack | 1.1h |
  | Bookshelf | 1.1–1.3h |
  | Table lamp | 0.25h |
  | Tree | 3–5h |
  | Fantasy house | 2–3 storeys equivalent |

- [proposed] One isometric floor tile is about 0.9h wide. A single desk workstation is about 2×2 tiles including the
  chair.
- [Kyle] When zoomed out, agents stay recognizable. [proposed] Below 2× zoom, core agents get a 1-pixel brighter rim,
  and their per-alias silhouette signature (§4) is kept visible by a level-of-detail sprite.

## 11. Real HQ rules

- [Kyle] Keep the existing Real HQ architecture and camera. Translate the art language into it. It should feel like *a
  miniature living technology company*.
- [proposed] Workspaces say who works there:

  | Agent | Workspace | Story props |
  |---|---|---|
  | **ChatGPT** (boss) | Command / orchestration office [Kyle 00:51Z, 7A.3] | executive desk, displays, planning material, maps, documents, books, communication tools, understated Hillink branding |
  | **Claude** (construction worker) | Construction / builder workshop [Kyle 00:51Z, 7A.4] | workbench, construction tools, tool storage, plans and blueprints, materials, shelving, measuring equipment, ladders, construction equipment |
  | **Codex** (engineer) | Engineering / testing station [Kyle 00:51Z, 7A.5] | monitors, technical drawings, testing equipment, components, diagnostics, whiteboard, laptop or tablet |
  | *(no agent)* | Server / infrastructure bay [Kyle 00:51Z, 7A.6] | racks, networking, consoles, cables, technical storage, maintenance equipment |

- [Kyle 00:51Z] **The server bay is infrastructure, not another agent or department.** It has no alias, no
  identity and no work of its own. Codex visits it to inspect or maintain only when canonical state puts him there.
- [Kyle 00:51Z, 7A.7] **Real prop families** (visual vocabulary, not a checklist; §16): office, construction,
  engineering, server/infrastructure, storage, lighting, plants, planning, general clutter.

- [Kyle, ref 6] **Real T0** is compact, finished, modern, warm, dense, functional, expandable, and designed for the
  three-agent organization.
  - It contains three agent workstations, one modest shared planning, break and informal meeting space [C20], a small
    server or technical corner, circulation and suitable props.
  - No extra departments just because there is room.
- [Kyle C19, ref 6] **Real materials:** steel, concrete, finished wall surfaces, glass, modern desks, monitors, server
  equipment, cables, technical equipment, warm practical lamps, plants, books, papers, tools and personal objects.
  Visual clutter is controlled. Ref 5's timber and stone lodge identity is rejected for Real; only its warmth, density,
  intimacy, storytelling, lighting and layout ideas carry over.
- [Kyle] Shared spaces only appear when a capability justifies them. Examples: meeting room, server room, workshop,
  planning area, lounge, storage, infrastructure. No filler departments.
- [proposed] Real can be cleaner than Fantasy, but must look lived in:
  - cable runs
  - coffee mugs
  - pinned notes
  - a stack of boxes not yet unpacked
  - plants that are slightly overgrown
- [ref 3a] Glass curtain walls show the interior from outside. Light spills onto the plaza at night.
- [Kyle 00:40Z, 6A/6B] **Real agents are the 6B aliases:** boss ChatGPT in a black suit, construction-worker Claude
  and engineer Codex. Workstation props are visual metaphors for canonical activity; they create no capability or work.
- [Kyle C22] **No royal theming in Real.** No green and gold banners or King motifs to make Real ChatGPT resemble the
  Fantasy King. Subtle Hillink branding in the environment is fine.
  - [proposed, from 7A.3] 7A.3 hangs two large green "HILLINK" fabric banners in ChatGPT's office. Read as branding,
    not royalty, but too prominent for "understated". Real branding uses modern formats (a wall logo, a framed print,
    a sign or a small flat panel), at most one per room, in the Hillink green without gold heraldic trim, tassels or
    hanging pennant shapes.

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
- [Kyle 00:40Z, 6C] **Fantasy T0** is a compact, established outpost at the **same organizational scale** as Real T0.
  It is not the same building or objects; it is the same organization translated:
  - stone, timber, hearth fire and banners
  - workshops and magical or medieval technical equivalents
  - warm local light, dense storytelling, clear circulation, expandable
- [Kyle 00:51Z, 7B; supersedes the 00:40Z list] **Fantasy workstations translate function** (C25):
  - **ChatGPT (King): war / command table.** Maps, scrolls, markers, books, correspondence, astrolabe or planning
    instruments, candles, and green and gold banners. A throne-like command chair is optional.
  - **Claude (dwarf): forge / artificer workshop.** An actual forge, anvil, hammer, tools, workbench, plans,
    materials, crates, barrels and construction supplies. Never a desk.
  - **Codex: arcane-mechanical analysis station.** Magical diagnostics, precision instruments, diagrams, scrolls,
    books, controlled magical energy, mechanical components and inspection tools.
  - **Infrastructure (no agent): Arcane Core / Archive.** A contained magical core or crystal, runic systems,
    conduits, archives and control apparatus. It is **not** "server racks with medieval textures".
  - No modern monitors [C17]. Glowing slates or panels on the analysis station or core control table (as in 7B 7E/7F)
    must read as runes, crystal or enchanted glass: irregular, framed in wood or brass, no rectangular bezel, no UI
    chrome, no screen glow grid.
- [Kyle C26, 00:51Z] **Banners and colour:** Fantasy organizational banners are **green and gold**. Blue is a
  **local secondary** only, for Codex, arcane energy, magical technical systems and accents (7B 7G). No blue-and-gold
  organizational banners.
- [Kyle 00:51Z, 7B 7H] **Fantasy prop families** (visual vocabulary, not a checklist; §16): command/planning,
  forge/building, arcane engineering, archive/core, storage, lighting/fire, plants, books/scrolls, general clutter.
- [proposed] District signals are props and architecture, not labels:
  - **Forge / artificer workshop (Claude):** a smoking chimney, forge fire and an anvil glow.
  - **War / command table (ChatGPT):** green and gold banners over a map table.
  - **Arcane-mechanical analysis station (Codex):** a contained blue/violet instrument glow and brass mechanisms.
  - **Arcane Core / Archive (infrastructure):** a pulsing contained crystal, rune columns and scroll shelving.
  - **Gate:** a portcullis and torches.

## 13. Real ↔ Fantasy translation rules

- [Kyle] Translation is semantic: same canonical activity, two readings.

  | Canonical concept | Real | Fantasy |
  |---|---|---|
  | orchestrate / plan | command / orchestration office: executive desk, wall map, displays | war / command table: maps, scrolls, markers, green and gold banners |
  | build / implement | construction / builder workshop: workbench, tools, blueprints, materials | forge / artificer workshop: forge, anvil, hammer, materials |
  | inspect / test / review | engineering / testing station: monitors, test equipment, whiteboard | arcane-mechanical analysis station: orb, instruments, scrolls |
  | infrastructure / compute | server / infrastructure bay: racks, networking, consoles, cables | Arcane Core / Archive: contained crystal, rune columns, conduits, archives |
  | security | badge gate, cameras | gate, guards, fortifications |
  | data / storage (only when a separate capability exists) | storage room, archive shelves | vault or library; at T0 storage lives inside the Arcane Core / Archive |
  | communications | antennas, dish, network closet | towers, relays, observatory |
  | owner action needed | flagged item on the planning board | sealed scroll at the King's table |
  | construction | scaffolding, steel frame, glazing | timber frame, stone, thatch |

- [Kyle C25, 00:51Z] **The four functional mappings are fixed:** command office ↔ war/command table, builder
  workshop ↔ forge/artificer workshop, engineering/testing station ↔ arcane-mechanical analysis station, server bay ↔
  Arcane Core/Archive. **Each pair is one canonical space with two visual readings, not two canonical systems.** The
  pair shares location role, footprint slot, light-equals-activity behaviour and the §6 clip set.
- [Kyle 00:40Z] **Role translation of the agents:**

  | Agent | Real alias | Fantasy alias |
  |---|---|---|
  | ChatGPT | boss, executive, orchestrator | King, orchestrator |
  | Claude | construction worker, builder | dwarf builder, artificer |
  | Codex | engineer | arcane-mechanical hybrid inspector [C23] |

- [proposed] **Parity rule:** every canonical state visible in one theme must be visible in the other, with the same
  location role, the same *pose semantics* (each alias may perform it in its own way, §0) and the same
  light-equals-activity behaviour. This extends 5H's truth
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
  - `family` [Kyle 00:51Z]: one of the theme's prop families (§11 Real, §12 Fantasy).
- [Kyle 00:51Z] **Props are visual vocabulary, not a checklist.** A station draws from its families to read as its
  function; it does not have to contain every listed item, and the 7A/7B key-prop rows are examples, not quotas.
- [Kyle 00:51Z] Never carry generation artifacts into production props: generated text or misspellings, impossible
  geometry, duplicated objects, inconsistent proportions, decorative characters, malformed props, impossible floor
  plans, modern tech in Fantasy, or fantasy in Real. The written spec outranks any reference artifact.
- [Kyle 01:01Z, ref 8] **Construction prop families.** These are vocabulary, not a checklist. They appear only on a
  canonical construction site, and they change with the canonical stage (§17.1).
  - **Real:**
    - barriers and cones
    - material pallets, steel beams, concrete and framing
    - tools, lifts, electrical and HVAC
    - drywall and panels, doors and windows
    - crates and construction equipment
    - [proposed] Vehicles such as a van, mixer or forklift are temporary site props for a stage. They are never
      agents or capabilities.
  - **Fantasy:**
    - stone blocks, timber beams, scaffolding, ropes and pulleys
    - tools, crates and barrels
    - forge components and crafted hardware
    - rune stones and arcane infrastructure
    - doors and windows, and interior materials
    - No modern machinery.
- [proposed] Props are placed by the existing 5H dressing rules (never on walks, stations, solids or plots), extended
  with the §7 cluster rules and the density targets.
- [proposed] **Story props bound to state** (read-only) swap variants, such as an open book, a lit monitor or a
  steaming forge, from canonical fields only.
- [Kyle] Props keep consistent relative scale (§10).

## 17. Construction visual system

- [Kyle] Eleven brief stages. They are *visual* stages, mapped onto the 9 canonical stages below and grouped into Reference 8's seven scenes (§17.1):

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

- [proposed] Scaffolding, ladders, temporary work lights and a tarp appear during stages 5–8 (Fantasy: scaffolding, ladders, torches and a rope and pulley; no tarp of modern material).
- [Kyle] Builders visibly interact: Claude carries materials and hammers at the active stage's work point (roles in §17.1).
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

### 17.1 Reference 8: seven visual scenes over the truthful mapping [Kyle 01:01Z, ref 8]

- [Kyle] **Construction is a visual representation of canonical construction state, never decorative animation.** One
  canonical project feeds both themes. Real and Fantasy never advance construction independently, and artwork never
  creates or advances state.
- [proposed] **The seven scenes group the canonical stages.** No canonical stage is added, split or renamed [Kyle C10].
  The 11-row brief mapping above stays the finest truthful grain inside each scene.

  | Ref 8 scene | Canonical stages | Brief rows | Variation allowed inside the scene (deterministic, from canonical facts only) |
  |---|---|---|---|
  | — (no scene) | no project exists for the plot | 1 | wild terrain, never a placeholder [§18] |
  | 1 site / planning | `planning`, `site-preparation` | 2–3 | `planning` shows stakes, lines and the plan table; `site-preparation` adds cleared ground, cones and material piles |
  | 2 foundation | `foundation` | 4 | none |
  | 3 structure | `structure` | 5 | none |
  | 4 walls + roof | `exterior` | 6–7 | **one combined composition** (walls rising, roof started); never a walls → roof sequence (§17) |
  | 5 systems / rough-in | `systems` | 8 | none |
  | 6 interior / finishing | `furnishing`, `inspection`, and `completed` before verification | 9–10 | `furnishing` shows interiors going in; `inspection` and completed-unverified add Codex inspecting on site |
  | 7 operational | `operational` | 11 | lights on, agents move in, workers leave |

- [proposed] Scenes 1 and 6 each span two canonical stages, so they show the stage they are actually in using the
  variants above. They never show the second stage early.
- [proposed] Facts that are canonical but are not progress may change *who* and *how*, never *how far*:
  - `builders`
  - `blocked`
  - `waiting`
  - `rework`
  - `inspection` / `verdict`
- [proposed] When a project is `blocked` or `waiting`, its work stops visibly. Tools are down, workers idle or leave,
  and the work lights dim. The existing 5H blocked or waiting gate icon shows above the site. Nothing moves forward.

**Same-building rule** [Kyle 01:01Z]. Every scene is the same structure. The player follows footprint → foundation →
frame → enclosure → systems → interior → finished building.
- [proposed] Every scene is drawn from one canonical footprint (the plot or room record) and one fixed opening plan.
  The opening plan is the positions of the doors, windows and internal walls, derived deterministically from the
  footprint.
  - Scene 1's lines trace the exact footprint.
  - Scene 2's slab fills it.
  - Scene 3's columns stand at its corners and openings.
  - Scene 4's walls leave gaps exactly where scene 7's doors and windows are.
  - Scene 5's systems run where scene 7's equipment stands.
- [proposed] There is no footprint teleportation, no change in dimensions or storey count, no moving doors or windows,
  and no finished building that doesn't descend from its frame.
- [proposed] Each scene is a superset of the previous one's permanent structure. Temporary items (scaffolding,
  materials, vehicles in Real, carts in Fantasy, the crew) come and go.

**Real construction** [Kyle] is modern:
- concrete, structural steel and steel framing
- modern wall systems, glass, doors and windows
- electrical, networking, HVAC and technical infrastructure
- modern tools, scaffolding and lifts

There is no timber post-and-beam framing in Real.

**Fantasy construction** [Kyle] translates the same progression into Fantasy's own material culture:
- stone, masonry, timber and wooden framing
- scaffolding, rope and pulleys
- forge-made components and crafted hardware
- runic infrastructure and arcane conduits

Fantasy never reskins modern machinery. There are no forklifts, mixers, AC units, vehicles or hard hats; carts,
sledges, a windlass and the crew do the work instead.

**Claude's role** [Kyle]. Claude is the primary visual builder in both themes. Real Claude is the construction
worker; Fantasy Claude is the dwarf builder and artificer.
- He inspects plans, measures, hammers, builds, carries, directs work, handles materials and uses tools.
- [proposed] He appears on site while the canonical project names him in `builders`, or by default during the build
  stages (`site-preparation` to `furnishing`).
- His clip follows the scene:

  | Scene | Claude's clip |
  |---|---|
  | 1 | inspect plan or measure |
  | 2–4 | carry, hammer or build |
  | 5–6 | build or direct |

- His animation reflects the stage. It never causes progress.

**Codex's role** [Kyle]. Codex shows inspection, engineering and verification.
- Real Codex, the engineer, inspects, measures, tests, reviews plans, and uses a tablet or engineering tools.
- Fantasy Codex, the arcane-mechanical inspector, inspects, studies, tests, examines runes and systems, and verifies
  work with his instruments.
- [proposed] He appears on site when canonical state calls for it:
  - at `inspection`
  - while a completed project awaits verification
  - when a review `verdict` or `rework` is recorded
  - when HQ assigns him as a builder
- Otherwise he stays at his station.
- He is never shown as the primary builder unless canonical activity says so.

**Activity and motion** [Kyle]. Construction feels active without becoming noise:
- carrying, hammering, carts and lifts
- welding sparks (Real) and forge sparks (Fantasy)
- dust
- material piles that shrink as the canonical stage moves past them
- inspection
- lights and systems coming on at `operational`

[proposed] At most about 6 looping ambient motions are visible on one site at a time. Agents stay readable on top of
the crew (§7).

**Diegetic first** [Kyle]. A player can roughly tell the stage by looking:
- a site looks like a site
- a foundation shows foundation work
- a structure exposes its structure
- systems show infrastructure
- finishing looks nearly complete
- operational looks inhabited

UI may clarify the exact canonical stage (§21).

**Lighting** [Kyle, ref 8E]. Construction stays readable at day, dusk and night with the same art; only lighting
changes (§9). At night, Real adds work lights and Fantasy adds torches and lanterns. Light supports the activity and
never hides it.

**Scope** [Kyle]. Reference 8 answers how *one structure* is built. It does **not** define how the whole World expands
(T0 → T1 stays open, §18, §24).

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
- [Kyle 00:40Z, 6A/6C] **T0 compositions**, small but finished:
  - **Real T0 (6A):** a one-storey modern building of concrete, glass and steel, with the Hillink logo. Inside: three
    role corners (ChatGPT, Claude, Codex), one shared central zone, a server bay behind glass, an entrance and
    circulation. Station contents per 7A.
  - **Fantasy T0 (6C):** a compact stone outpost with corner towers and a timber interior. Inside: three role corners
    (war/command table, forge, arcane-mechanical analysis station), the Arcane Core/Archive in the server bay's slot,
    one shared central table, and the same circulation and scale. Station contents per 7B.
- [open] Exact exteriors at gameplay zoom, and the T0 → T1 step, still need references.
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
  6. **Two aliases from one role:** a Real alias (a human role translation) and a Fantasy alias (an archetype that may
     differ in species or anatomy), linked by role and behaviour, not by shared anatomy [Kyle 00:40Z].
  7. If needed, a new room or building module goes through §17.
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
  - [Kyle C24, 01:01Z] **Ambient builders are allowed during construction. They are not agents.** They make
    legitimate canonical construction feel populated.
    - They own no AI-agent identity and receive no Hillink tasks.
    - They represent no capability and never advance construction.
    - They never add to the agent count.
    - What they do (walk, carry, hammer, lift, push carts, operate tools, move between work areas, loop work
      animations) is downstream of canonical construction state. It never makes the renderer authoritative over
      progress.
  - [Kyle C24] **Never Claude clones.**
    - **Real workers** vary in skin tone, hair, facial hair, body proportions, vest and workwear colours, hard-hat
      colours, tools, equipment and silhouette.
    - **Fantasy builders** vary by role (mason, carpenter, labourer, material carrier, scaffolder, smith's
      assistant), and in body type, species or human appearance where appropriate, clothing, hair, equipment and
      silhouette. Fantasy Claude's dwarf-artificer identity is never repeated across the crew.
  - [proposed] A testable form of that rule:
    - **Real:** no worker combines more than one of Real Claude's three cues (a yellow-orange hard hat, an orange
      hi-vis vest, a red-orange full beard). No worker ever has the red-orange full beard.
    - **Fantasy:** no worker combines dwarf proportions with a red-orange beard, a leather artificer apron or the
      forge hammer.
    - Both: every crew palette is checked against the §4 silhouette test.
  - [proposed] **Crew size and presence** come deterministically from canonical facts:
    - the stage, from 0 at `planning` up to a small cap of about 2–4 per site
    - `blocked` or `waiting`, which leaves the crew idle or gone
    - `operational`, at which point the crew leaves
    The crew never comes from the clock and never appears on a site without a canonical project.
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
  - **Real (6B):** ChatGPT is the boss in a black suit, Claude is a hard-hat construction worker, and Codex is an
    engineer.
  - **Fantasy (6D):** ChatGPT is the King, Claude is the dwarf artificer, and Codex is the arcane-mechanical hybrid inspector
    with one red eye.
  - Each alias is its own design; continuity comes from role (§0, §4).
- **Rendering:** smooth canvas vectors become a low-resolution pixel buffer, integer-upscaled.
- **Outline:** one ink outline becomes selective outlines.
- **Colour:** flat fills become hue-shifted ramps with texture.
- **Density:** isolated props in open floors become clustered, wall-heavy dressing with story props bound to state.
- **Lighting:** even lighting becomes warm local pools against a dusk ambient, with light meaning activity.
- **Construction:** 6 visual looks become Reference 8's 7 scenes (11 brief stages at the finest grain) over the 9 unchanged canonical stages, with scaffolds, materials, Claude building, Codex inspecting, and a non-agent ambient crew.
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

Resolved by refs 5–8:
- pixel density (24 pixels)
- Real T0 environment and materials (6A)
- Real aliases (6B)
- Fantasy T0 environment (6C)
- Fantasy aliases (6D)
- the alias model (§0)
- lighting behaviour
- functional spaces in both themes, including Fantasy workstations without monitors (7A/7B, C25)
- Fantasy Codex's arcane/mechanical balance (C23)
- Fantasy banner colour (C26)
- construction at gameplay scale, its parity, and Claude's and Codex's construction roles (ref 8, §17.1)
- ambient builders versus Claude (ref 8, C24)

Still open:
1. **Kyle's avatar** (C14). Not inferred from any reference.
2. **UI/HUD** in the pixel language.
3. **Terrain edges** at T0 and as the World grows.
4. **The T0 → T1 world growth step** in each theme. Reference 8 shows how one structure is built, not how the World
   expands.
5. **The shared central zone in Fantasy:** 7B shows a central table and hearth but no clear Fantasy translation of
   Real's sofa and table (6C's red sofa is rejected). Low priority.

---

## 25. Reference conflicts and Kyle's decisions

Resolved by Kyle on 2026-10-01 at 00:12Z:

| # | Conflict | Decision [Kyle] |
|---|---|---|
| C1 | ChatGPT's palette | **Green and gold** is the identity palette. Royal cream, gold and richer garment detail may be added; green stays recognizable. Neither reference is copied literally. *Scope narrowed 00:40Z: this applies to **Fantasy** ChatGPT. Real ChatGPT's identity is the all-black suit (6B).* |
| C2 | Codex's design | **Half-human cyborg with ONE RED EYE.** A human or cybernetic body, not a full robot. The red eye is a permanent identity and silhouette feature. *Scope narrowed 00:40Z: this applies to **Fantasy** Codex. Real Codex is an engineer with no cybernetics (6B). Refined 00:51Z by C23: an arcane-mechanical hybrid, still with one red eye.* |
| C3 | Claude's headgear | **Red or orange hair and a full beard.** A hard hat or helmet appears only while actively doing construction work. *Scope narrowed 00:40Z: contextual headgear applies to **Fantasy** Claude. Real Claude's hard hat is part of his identity (6B). Ref 8 (01:01Z): Fantasy headgear is a leather cap or smith's helmet, never a modern hard hat.* |
| C4 | Real HQ character identity | ~~Identities persist across themes… the same individual is recognizable in both.~~ **Superseded 00:40Z** by the alias model (§0): Real aliases are human role translations (boss, construction worker, engineer). They need not share anatomy, face, age, clothing or species with the Fantasy aliases. They are never generic: each reads as its role. |
| C5 | Starting size | **Start small supersedes** the two-floor baseline as the starting state. The larger HQ is kept as an **earned growth stage**. Small is not primitive: Real T0 is a compact, finished small HQ; Fantasy T0 is a compact established outpost, small keep or workshop. Exact looks wait on references. |
| C6 | Time of day | **Not locked to dusk.** The system must allow a future day/night cycle. Dusk is the showcase condition for now. No day/night system in this pass. |
| C7 | Non-agent inhabitants | **Allowed, as ambient inhabitants strictly separate from agents.** They never masquerade as agents, receive fake work, imply nonexistent capabilities or distort the agent population. The agents are ChatGPT, Claude and Codex. |
| C8 | Flavour spaces | **Environment is allowed and encouraged**, but it is not an operational facility. No department, specialized room or capability exists only because it looks cool. |
| C9 | Sprite authoring | **Hybrid.** Bespoke authored identities for the core agents; a modular system (body plans, equipment, palettes, materials, props, animation, attachments) for everything reusable and for future agents, who can be refined later. All production art is original; references are never shipped or traced. |
| C10 | Construction stages | **Canonical authority does not change.** Visual stages map underneath the canonical stages. Sub-stages are allowed only if they can be derived deterministically without false progress; otherwise the limitation is documented. Only walls and roof share a stage; §17 has the mapping and how that pair is drawn. |
| C11 | Cross-theme backdrop | **No fantasy castle behind Real.** Each theme stays physically coherent. Subtle shared motifs are fine, but the settings never blend. |
| C12 | Kyle avatar (resolved 2026-10-01 00:25Z) | **Kyle may have a visual avatar. He is NOT an AI agent.** He represents the human owner and player. He appears only for legitimate owner interactions: NEEDS KYLE, approvals, owner decisions, meetings, inspections or visits, and ceremonies. He never autonomously performs AI work and never adds to the apparent agent population. His exact appearance is still open. |
| C15 | Ambient workers vs Claude (resolved 00:32Z; detailed by C24) | **Ambient workers must not duplicate Claude.** They have their own silhouettes, clothing, palettes and headgear. They may wear construction gear, but they are never Claude clones, and they remain non-agent inhabitants. |
| C16 | Real T0 storeys (resolved 00:32Z) | **Exterior and interior are the same physical volume.** A cutaway may expose spaces but never invent an impossible interior. Ref 6's T0 is a single storey. |
| C17 | Monitors in Fantasy (resolved 00:32Z) | **No literal modern monitors in Fantasy.** Themes translate *function*, not *object*: a diagnostic workstation becomes an arcane-analysis station, a planning display becomes a map, war table or magical planning apparatus, and server equipment becomes the established world's equivalent. A deliberate hybrid technology needs a future reference that explicitly establishes it. |
| C18 | Real wardrobe (resolved 00:32Z, **superseded 00:40Z**) | ~~Modern King DNA, dwarf DNA, cyborg DNA.~~ **Now:** Real wardrobe is the 6B role aliases. ChatGPT wears an all-black suit with no crown. Claude is a hard-hat construction worker, not a dwarf. Codex is an engineer with no cybernetics. Fantasy costumes are never carried into Real. |
| C21 | ChatGPT's face across aliases (resolved 00:40Z) | **Aliases need not share a face or apparent age.** Real and Fantasy ChatGPT are two thematic aliases of one canonical agent. The same applies to Claude and Codex. Recognition comes from semantic identity and chosen motifs, not anatomy. |
| C22 | King banners in Real (resolved 00:40Z) | **No green and gold banners in Real** just to echo the King. Real ChatGPT's identity is the black-suit boss. Subtle Hillink branding is allowed, but his Real workspace is not royal-themed. |
| C19 | Real materials (resolved 00:32Z) | **Real uses modern materials** (§11). Ref 5's lodge identity is rejected; its warmth, density, intimacy, storytelling, lighting and layout ideas are kept. Ref 6 is authoritative. |
| C20 | T0 shared space (resolved 00:32Z) | **One modest shared multipurpose space** in T0, for planning, breaks and informal meetings. It is not a capability or department. No large lounge, cafeteria or recreation area for decoration. |
| C23 | Fantasy Codex, arcane vs mechanical (resolved 00:51Z) | **An ARCANE-MECHANICAL HYBRID**, not a pure wizard and not a pure machine. He keeps **ONE RED EYE**, on the Fantasy alias only. Mechanical: the eye, brass fittings, precision instruments, components. Arcane: controlled magical energy, orb or crystal, runes, scrolls, books (§4). |
| C25 | Fantasy functional spaces (resolved 00:51Z) | **Four fixed mappings:** Real command/orchestration office ↔ Fantasy war/command table; Real construction/builder workshop ↔ Fantasy forge/artificer workshop; Real engineering/testing station ↔ Fantasy arcane-mechanical analysis station; Real server/infrastructure bay ↔ Fantasy Arcane Core/Archive. **Not separate canonical systems** (§13). 6C's monitors, office chairs and desk-like forge remain rejected. |
| C26 | Fantasy banner colour (resolved 00:51Z) | **Fantasy organizational banners are GREEN and GOLD primary.** Blue is a **local secondary** only, for Codex, arcane energy, magical technical systems and accents (§12). The earlier blue-and-gold-heraldry leaning is withdrawn. |
| C24 | Ambient builders vs Claude (resolved 01:01Z, ref 8) | **Ambient builders are allowed during construction as non-agent inhabitants.** They own no identity, task or capability, never advance construction, and never add to the agent count; their activity is downstream of canonical state. **Never Claude clones:** Real workers vary in skin tone, hair, facial hair, build, vest and hard-hat colour, tools and silhouette. Fantasy builders vary by trade, body, species where appropriate, clothing and equipment, and never repeat Fantasy Claude's dwarf-artificer identity (§20). |
| C13 | Room labels (resolved 2026-10-01 00:25Z) | **Environment first, text second.** Rooms are recognized by their physical design. Labels may appear on hover, on selection, in the inspector, in a map view, or as subtle architectural signage. No large permanent floating labels. |

Still open:

| # | Question | Agent leaning (not a decision) |
|---|---|---|
| C14 | **Kyle avatar appearance:** how Kyle looks, and how his avatar stays clearly separate from agents. Not to be inferred from any reference [Kyle 00:51Z]. | A distinct human owner silhouette, visible only during owner interactions (C12). Never in a black suit, hard hat or glasses, so he can't be mistaken for a Real alias. |

---

## Next steps (only after approval)
REFERENCES → spec → review → Reference Batch 2C (7A/7B, done) → Reference 8 (construction, done) → **T0 → T1 world-growth reference (next)** → more references or corrections → approved visual language → small
vertical-slice prototype (one room, three agents, both themes) → visual review → refinement → propagation. [Kyle]
No implementation, no Pass 5I and no World-wide redesign until Kyle approves.
