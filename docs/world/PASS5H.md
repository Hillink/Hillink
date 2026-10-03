# Pass 5H: unified World art and design system (iteration 1)

Branch `claude/world-5h`, based on `claude/world-5g @ f48f40e`. Status: **iteration 1, ready for visual review.**
Nothing in the architecture changed: HQ truth → events → World → theme → spatial → renderer. The renderer is still
read-only and only the art layer is new. Tests: World 214/214 (10 new in `tests/pass5h.test.mjs`), HQ 201/201.

Evidence: `docs/world/evidence/pass5h/` (35 PNGs, `shots.json`). Script: `tools/hillink-world/live/pass5h-shots.mjs`.
Everything shown is simulation mode (HQ unreachable on purpose, and banners say so). Character sheets are at
`lineup.html?theme=real|fantasy&mode=lineup|views|states|status`.

Labels used below: **[Kyle]** confirmed by Kyle in the 5H spec · **[code]** observed in current code · **[proposed]** agent
choice, open to review · **[placeholder]** exists but is not final art.

---

## ART BIBLE

### 1. Visual goals
- [Kyle] Fixed camera, 2.5D, stylized and compact. No 3D, first- or third-person, WASD, side camera, photorealism, or
  Agent Office visuals. All assets are original, drawn in code from shape data. No image files are used.
- [Kyle] Real and Fantasy share one visual DNA: the same character rig, outline, lighting, shadows, depth planes and
  status language. Only the costume and the environment change.
- [Kyle] Character readability follows the Terraria reference in spirit only: about 3 heads tall, oversized heads,
  short separated legs, tiny arms, chunky silhouettes, minimal faces and strong colour blocking.

### 2. Shared rules (`render/art/tokens.mjs`, plain data)
| Rule | Value |
|---|---|
| Proportions | head radius 0.185h (head ≈ 0.37h wide, 1.06 wide:tall), torso 0.25h, legs 0.115h wide with a 0.045h gap, arms 0.085h × 0.2h |
| Scale | Hip and seat heights stay the World landmarks (`world/scale.mjs`), so chairs and desks still fit. Look clamps: scale 0.6–1.5, width 0.6–1.6, headScale 0.75–1.35 |
| Perspective | The existing fixed isometric projection per theme; nothing new |
| Outline | One ink `rgba(24,20,28,.95)`, weight 0.034h clamped to 0.6–2.2 px. [proposed] Characters are outlined in both themes, the Fantasy environment is outlined, and the Real environment keeps its lit volumes without outlines |
| Light | From the upper left in both themes. Multipliers: highlight 1.14, shade 0.8, deep 0.66. Glow sources are listed per theme |
| Shadows | Every character and prop gets a grounding contact ellipse (0.26h × 0.075h) and a soft cast shadow toward the lower right |

### 3. Depth planes
`farBackground → background → ground → building → agent → foreground → overlay`. Building and agent are depth-sorted
together by footprint, so a barrel in front of a character hides its legs (test J). The overlay plane is for status UI
only (labels, chips, selection) and never holds scenery. The order is deterministic for a given World state (test J).

### 4. Palettes
Both themes use the same value structure (light, mid and dark per material family), so a character reads the same
against either. Real: office whites, tech greys, warm wood, a blue fabric, accent `#ff7a1a` and screen blue. Fantasy:
stone, wood, four roof families, gold, magic violet and cyan, fire, water and four banner colours. See `PALETTE`.

### 5. Animation
Clips, with their loop and cycle ranges in `CLIPS`: idle, walk, work, type, carry, talk, think, inspect, waiting,
blocked and celebrate. Celebrate plays only on canonical completion. Reduced motion freezes the loops and the ceremony.
[placeholder] Clips are procedural pose curves on one rig. There are no hand-keyed frames yet.

### 6. Views
Five authored views: front, front-diagonal, side, back-diagonal and back. Left-facing views mirror the right-facing
ones. The view comes from the smoothed heading, or from the four-way facing when there is none (`viewOf`). See
`02c-real-views.png` and `08d-fantasy-views.png`.

### 7. Attachment points
`ATTACH`: head, hatTop, handNear, handFar, back, hip and chest, as fractions of h from the feet. Tools (hammer, tablet,
scroll, book, bow) and carried items use these, so new gear never needs the rig rebuilt.

### 8. Status language (`render/art/status.mjs`)
One meaning with two metaphors. The colour and pose are identical in both themes; only the small emblem changes (a
rounded chip in Real, a wax seal with a ribbon in Fantasy). There is also a ground ring in the status colour.

| Status | Colour | Pose | Real emblem | Fantasy emblem | Comes from |
|---|---|---|---|---|---|
| needs-owner ("Needs Kyle") | pink | waiting | hand chip | scroll seal | only an open World issue with `owner: true` for this agent (HQ sets it from `alert.ownerMustAct`) |
| blocked | red | blocked | ! chip | broken seal | agent activity blocked |
| waiting | amber | waiting | clock | hourglass | activity waiting |
| working | green | work | play | spark | activity working |
| travelling | blue | walk | arrow | boots | moving along a route |
| completed | gold | celebrate | check | star | `activity === 'completed'` only |
| candidate | violet | waiting | badge | rune | lifecycle READY but not ACTIVE (READY != ACTIVE is preserved) |
| idle / offline | grey | idle / slumped | none / moon | none / moon | activity |

- [Kyle] NEEDS KYLE is never faked. There is no timer or heuristic. World-level owner approvals that aren't tied to
  an agent stay in the HUD's Attention panel.
- The PR or quest chip (a Real PR card, a Fantasy scroll with a wax seal) is drawn only from canonical `agent.prId` or
  `task.prId`. Future binding: when HQ emits a PR number on the task event, the chip lights up with no art change.
- The completion ceremony (Real confetti, Fantasy stars) plays for `CEREMONY_S = 2.6` s after a canonical completion,
  and not at all with reduced motion.
- Evidence: `25-status-comparison.png` (every status in both themes side by side) and `25b-needs-kyle-in-world.png`.

### 9. Real HQ design language
Clean modern office with lit volumes, glass partitions, warm wood desks, dark monitors and server racks with LEDs.
Rooms are made identifiable by their props instead of large labels. [code] `render/art5d/dressing.mjs`
`ROOM_DRESSING` by room kind:
- dev: monitors and cable trays
- testing: spare parts and a bench
- servers: racks and an extinguisher
- lounge: sofa, beanbag, coffee station and magazines
- comms: an easel board
- command: trophies
Props go on the back wall and the side strips, never on walks, stations or keep-outs. The browser default is now the
5D art; the old skin is at `?art=classic`.

### 10. Fantasy design language
A compact kingdom on a meadow, with mountains behind and a stream with a bridge in front. Each district has its own
floor:
- flagstones in the halls, gate and circle
- planks in the academy
- earth in the forge and yard
- meadow on the commons
- rugs and carpets in the keep, library, tower and dome
Every district is dressed from `DISTRICT_DRESSING` (barrels, anvils, grindstones, potion shelves, scroll racks,
crystals, rune stones, cauldrons, star charts, coins and more). Back-row halls get banners, torches and windows. The
flanks have 26 trees, plus bushes, flowers and grass tufts. Districts:
- King's Command / Castle
- Forge
- Vault
- Oracle Chamber
- Observatory
- Academy
- Great Library
- Arcane Engine
- Gate/Watch
- Summoning Circle
- Hearth Commons
- Builders' Yard (construction)
[Kyle/code] A district stands only when HQ has the capability for it (library, vault and observatory are hidden in the
default sim). Shots 12–15 use a demo World that adds those capabilities.

### 11. Characters
The rig is `render/art/character.mjs`. Sprite parts (hair, headwear, face, head back and garments) in
`render/art/parts.mjs` are data only. Dressing is `render/art/dress.mjs`, driven by the agent definition and never by
the id.

| Agent | Real | Fantasy [Kyle bible] |
|---|---|---|
| ChatGPT | orchestration jacket | green and gold king, crown and white beard |
| Claude | builder hoodie, orange | orange and brown dwarf builder with a horned helm and hammer |
| Codex | QA jacket with glasses | blue half-human cyborg, ONE red bionic eye on a face plate, human otherwise |
| Scout | outreach headset | pink and white cupid with wings and a bow |
| Treasurer | finance suit | green goblin in red and gold with a coin pouch |
| Oracle | memory role | purple hooded figure with a shadowed face and glowing eyes |
| Cyclops | analytics | organic, shaggy, one big eye, not robotic |
| Qwen / Gemma | apprentice headsets | white and blue apprentice / green apprentice, with books |
| Kyle | owner suit | brown and red adventurer, distinct from the King |

Non-agent characters, all non-canonical and decorative:
- a friendly Giant in the yard
- a Ranger with a bow, quiver and elf ears
- a fairy messenger
- a Gate Golem made of stone blocks with a rune core, whose eyes turn red on alert. It is distinct from the Giant
- workers and carts, drawn through the same rig with deterministic `npcLook`

### 12. Construction art
[Kyle/code] Construction art is chosen by the canonical construction stage only. Art never advances progress. Test H:
drawing a plot is identical across time at the same stage and differs across all 6 stages.
Evidence: `05-real-construction-refit.png` and `18-fantasy-construction-giant.png`.

### 13. Dynamic-agent fallback
An agent with no authored look gets one from its role domain:
- Real uses `REAL_OUTFITS[domain]` in its registered colour.
- Fantasy uses the domain archetype.
The same definition always gives the same look. Hostile or unknown metadata is dropped or clamped, and appearance data
can never become code (tests A–D). Evidence: `22-real-unknown-agent.png` and `23-fantasy-unknown-agent.png` (the
`agent-5h-unknown-417` definition).

### 14. Asset organization
```
render/art/tokens.mjs         shared rules (data)
render/art/sprites.mjs        shape-list sprite format, validation, mirroring, shading
render/art/parts.mjs          character parts (data)
render/art/character.mjs      the rig: views, clips, attachment points, portrait
render/art/dress.mjs          definition → look (Real outfits, Fantasy archetypes, NPC looks)
render/art/status.mjs         status derivation + emblem, ring, work chip, ceremony
render/art/kingdom-props.mjs  Fantasy props, district dressing, wall pieces, trees
render/art5d/dressing.mjs     Real room dressing
lineup.html + ui/lineup.mjs   character sheets (lineup, views, states, status)
```

---

## Placeholder or unfinished (iteration 1)
- All art is procedural vector shapes. There is no pixel-art texture pass and no hand-keyed animation frames.
- Real hair reads a little helmet-like at small zoom.
- The Cyclops and shaggy hair silhouettes are still oversized.
- Real side-strip props sometimes sit near the front edge. Front-row Fantasy props sit partly behind fences.
- Room centres are still open floor in both themes, left clear for nav.
- Dressing is visual only and not in nav. It is placed off walks and does not create new obstacles.
- The Gate Golem is only seen at the gate. The Giant, Ranger and fairy are ambient and have no behaviour.
- Characters are outlined but the Real environment is not. This is deliberate for now, but review it.
- At full overview zoom the Fantasy characters are small, and labels carry identity.

## Deferred (5I or later, only on Kyle's go)
- A texture and detail pass on terrain and walls, plus hand-authored key poses for work, carry and celebrate.
- Binding PR numbers from HQ task events to the work chip. The art is ready; the HQ field is missing.
- Per-agent tools in hand while working, across all agents (Claude's hammer is done).
- Tighter room density: mid-floor furniture islands that are added to the nav keep-outs.
- Seasonal and time-of-day lighting.

## Bug fixes found while rendering
- `main.mjs`: a boot race could restore an empty saved sim World before seeding. Saving is now guarded, and a saved
  World with no agents is ignored.
- `main.mjs` `shotPoint`: crashed in themes without a `view` (Fantasy). Now guarded.
- `lineup.html`: an inline style was blocked by the CSP and was moved to JS.

---

## Art-direction checkpoint (Kyle, 2026-09-30 23:56Z) — confirmed by Kyle
- Iteration 1 is complete. Its **systems** are kept: Real/Fantasy dual representation, canonical state relationship, 2.5D
  isometric concept, activity/state semantics, construction semantics, navigation/interaction, procedural expansion.
- Its **artwork is not the final Hillink identity**. Do not redesign, replace or propagate it until the direction is
  approved.
- No Iteration 2 and no 5I. Next input is a curated visual-reference package from Kyle/ChatGPT (characters, proportions,
  pixel/detail level, Real and Fantasy environments, architecture, density, lighting, props, construction, mood). The
  references are inspiration, not something to clone.
- **Population:** the core permanent population today is Claude, Codex and ChatGPT. Scout, Treasurer, Oracle, Gemini and
  the others in the evidence only show scalability and are not permanent inhabitants. The three-agent World should feel
  small, intentional, alive and complete. It grows organically: need/capability → agent added → construction →
  workspace/district operational → agent inhabits it, in both Real and Fantasy.
- When references arrive, the first deliverable is a proposed **Hillink Art Direction Specification** covering 12
  sections: borrowed principles per reference; what not to copy; character rules; environment rules; shared DNA; how
  the two themes stay distinct; scale/perspective; palette/material/lighting; density; animation; procedural rules for
  future agents and buildings; how the World evolves visually. Stop there. Nothing is implemented until Kyle approves.

## P1–P4 and the vertical slice (Kyle approved P1/P2, 2026-10-01 01:40Z)

Status: implemented on `claude/world-5h`, awaiting Kyle's visual review. Not merged, not deployed.

**P1 (confirmed by Kyle).** Real and Fantasy run on ONE canonical planner layout (`world/generated-layout.mjs`). Themes
translate materials, architecture, props and environment only. The 5G kingdom stays in the code, superseded and
inactive (`?layout=kingdom-5g`, debug only).
**P2 (confirmed by Kyle).** T0 = one compact storey (13.5 × 13 m) with ChatGPT, Claude and Codex. Break and meeting are
both `shareable` and share one common room in canonical data (`shareRooms`). Worlds founded before 5H replay as they were.
**P3 (agent default, adopted after Kyle's approval).** ChatGPT's canonical workstation is the command office.
**P4 (agent default).** One canonical display name per capability (`CAPABILITY_NAMES`), the same in both themes; a
shared room joins its names ("Break & Meeting"). The older HUD/roster still shows the 5B theme labels.

### Slice (`?art=px`, plus `?light=day|dusk|night`, `L` cycles lighting, `Enter` opens details)
- `render/px/buffer.mjs` pixel raster; `palette.mjs` ramps and lighting settings; `character.mjs` shared body plans,
  part masks, tools and clips (idle, walk, work, sit; four facings), six aliases plus a TEST look for reference sheets only;
  `kit.mjs` materials, floor patterns, prop recipes per theme, decor, vegetation, posts, sconces, glows;
  `compose.mjs` builds the scene from canonical records by rule; `stage.mjs` bakes static layers and renders frames;
  `skin.mjs` plugs into the canvas renderer (hover chip, gold selection ring, details card).
- 2× display (one art pixel = 2 screen pixels), zoom snapped to whole pixels; characters 24 px.
- Harness: `node scripts/px-harness.mjs <dir> [--frames]` renders four seeds, a planner wing and a planner room split in
  both themes, plus the alias sheet, with pixel hashes in `manifest.json`.
- Evidence: `docs/world/evidence/pass5h-slice/`.
- To see T0 locally without touching an existing world: `WORLD_STATE_DIR=<new folder> node serve.mjs`, then open
  `/?art=px`. A World saved before 5H keeps its two-storey layout by design.

## Visual refinement 1 (2026-10-01)

Refinement of the vertical slice. Every change is a rule or kit entry in `render/px/`; nothing is placed by hand, and
there is no T0 special case. Geometry, canonical state, the planner and saved Worlds are unchanged.

- **Architecture:** outer walls are now thick (0.38 m back/left, 0.30 m front/right) and stand outside the room rects.
  Interior walls are 0.14 m. Real full-height walls get a coping; their exteriors are concrete panels on a base course.
  Real interiors are divided by clear glass partitions (1.6 m, 1.2 m low). Fantasy walls are coursed ashlar with moss and
  a plinth. Fantasy has crenellations on every outer wall and towers at the back corners (one with a slate roof and
  finial, one crenellated with a banner). It also has torch turrets at the front corners, buttresses along the visible
  faces, and round-arch headers over doors in full-height walls.
- **Corners and junctions:** Real has steel columns at the back corners and flush concrete corners at the front;
  Fantasy has towers. Pilasters or columns stand where interior walls meet outer walls. Interior doors have jambs.
- **Windows** are bays chosen by rule, clear of doors, junctions, decor and tall pieces. Real windows are framed glass
  with reveal, glint and sill. Fantasy windows are leaded lancet arches.
- **Entrance:** Real has slim concrete door reveals and a thin cantilevered canopy with a brand line and one downlight.
  This replaces the heavy posts. Fantasy has a stone gate arch with a gold keystone and torch piers. Every entrance is
  derived from the canonical entrance door, and each has a paved forecourt pad.
- **Ground and ways:**
  - Roads are drawn along the canonical polyline with Chaikin-rounded bends. Real roads have a curb, a dashed centre
    line and an edge band. Fantasy roads have dirt ruts, a grass crown and frayed edges.
  - Paths: Real uses pavers with edging; Fantasy uses irregular flagstones with grass joints.
  - Land: a gravel or rubble strip at the building edge, verge wear, a forest floor, dry meadow patches and sparse tufts.
  - Fixed a sign bug in the paving patterns (negative coordinates made every paver a joint line).
- **Environment:** stands of pine or broadleaf follow a deterministic field, with big trees at the heart and understorey
  at the edges. Rock outcrops are rarer, and clearings have flowers. A lone landmark tree appears occasionally, and there
  are shrubs at the forecourt. Plants come in three sizes with an alternative leaf; a rare Fantasy autumn tree appears.
- **Interiors:** screens are state-driven. Every screen piece has an off state; it lights, with its glow, only while
  an agent's clip is a work clip inside that room. No state is invented. Prop outlines are darker. The Real vending
  machine is desaturated (metal, dark glass, brand band, no light). The Real testing desk has a test rig.
- **Real exterior lights** are low bollards (0.86 m) every 4 m, not street lamps.
- **Characters** stay 24 px.
  - Outlines are darker, poses are exaggerated (hammer raise and strike, walk swing, scan, orchestrate), and the
    single red eye is bigger.
  - The Fantasy Codex is a dark cyborg with gold and steel; half of the face is mechanical.

Evidence is in `docs/world/evidence/pass5h-refine1/` (the live video is in `/mnt/project-files/pass5h-refine1/`).

## Visual refinement 2 (2026-10-01)

Convergence pass. Real's architecture has been brought up to the level of Fantasy, and the rendering architecture,
canonical geometry and harness are unchanged. Every change is a rule or kit entry, and there is no T0 special case.

- **Real architecture (modern language, through structure rather than decoration):**
  - The front and right walls are a cut curtain wall: a concrete spandrel, then tinted glass between dark steel
    mullions with a transom.
  - The cut tops show the wall in section: steel cladding, a concrete core and the inner lining.
  - Full-height walls end in a dark roof-slab band with a light cove line, under a steel fascia that overhangs
    outward.
  - A steel column grid runs every 3.2 m on the inside of the outer walls, clear of windows, doors, decor and junctions.
  - The front corners are steel columns cut at partition height.
  - The silhouette counterparts of the Fantasy towers: a comms mast with a beacon at the back-right corner, and a
    slim brand fin at the back-left.
  - The entrance has steel reveals and a concrete canopy with a brand fascia, plus one small Hillink plate on the
    facade where the wall is clear.
  - Soft wash lights sit at the base of the curtain walls.
  - The interior wall is a darker warm grey, so primary structure (steel and concrete) outweighs glass, and glass
    outweighs accents.
- **Interior hierarchy:**
  - Real task chairs are graphite and lower than the desks they serve, so they no longer merge with them.
  - Workshop pegboards are steel with hi-vis accents (no longer brown rectangles).
  - Fantasy is unchanged.
- **Agent readability:**
  - Real Codex wears a teal technical jacket over a white shirt and keeps his glasses, so he contrasts with screens,
    with ChatGPT's black suit and with Claude's hi-vis.
  - Occlusion, as a generic stage rule: a prop drawn over an agent is dithered (every other pixel) where it covers the
    agent's figure. Agents stay readable behind tall furniture, still drawn behind it. Seat backs are exempt.
- **Environment:**
  - Plants are jittered wider than a grid cell.
  - Stands thin out toward their edges and have small gaps.
  - Every plant may be mirrored by hash, so no stand repeats one silhouette.
- **Lighting:** the new wash lights add no light pools, only a faint glow. Nothing else changed.
- **Performance:** unchanged (about 2.3–3 s first build per theme).

Evidence is in `docs/world/evidence/pass5h-refine2/`, including `pass5h-refine2-evidence.pdf`. The live video's path is listed at the end of this file.

## px renderer V2 integration (2026-10-02)

The px renderer now draws the live canonical World: construction, agent status and unknown content. It reuses the
World, procgen, construction, capability and behaviour systems as they are. There is no new engine and no second
simulation. px stays opt-in (`?art=px`; `loadTheme` only builds the px skin when asked).

- **Construction by canonical stage** (`render/px/compose.mjs`, materials in `kit.mjs` `SITE`). Every unfinished
  `world.projects` entry is drawn at its stage. A new structure is drawn on its own spaces. A refit is drawn in the
  work zone of the room it refits. Pieces build up over the stages:
  - planning: stakes, tape and a survey level
  - site preparation: cleared ground, cones or barrels, and a material stack
  - foundation: slab and rebar or pegs
  - structure: columns and beams
  - exterior: clad walls with a glazing band (front and right cut low), plus scaffold
  - systems: services along the back wall
  - furnishing: the canonical furniture arrives crated on its own footprints, and the floor is laid
  - inspection: the furniture in place with its screens off, plus an inspection board

  Gates come only from canonical project state: blocked shows a barrier, waiting for Kyle shows a sign. The geometry is
  identical in both themes. The theme only names materials: Real is steel, concrete and hi-vis; Fantasy is timber,
  ashlar, rope, barrels and a brazier. Art never advances a project.
- **Agent status** (`render/px/character.mjs`). `agentStatusOf` derives working, walking, idle, waiting, blocked or
  talking from the canonical activity, the route and the animation intent. Each status has its own clip, standing and
  seated. Waiting and blocked also carry a small status mark in the shared status colours. Only `working` plays a work
  clip, and only a work clip switches screens on (`isWorkClip`; `stage.liveRooms` reports which rooms are lit). The
  skin's live actors use the same path. The stage cache now keys on structure and project state, so an agent status
  change redraws without re-baking.
- **Generalized fallbacks.** These cover agents and content the art has never seen:
  - An agent with no authored look gets a deterministic look. Its role words choose the work clip and tool, a hash
    of its id chooses hair, garment and colours, and the theme chooses the garment family. The three named agents
    keep their authored aliases. Hostile appearance data is still dropped.
  - Unknown room kinds use their base kind's floor (`floorFor`).
  - Unknown furnishing types get a theme-translated cabinet (`recipeOrFallback`).
  - Unknown wall decor gets a panel (`decorFor`).
- **Naming.** Room and site names come from `world.capabilities` (`roomNameOf`, `siteLabelOf`: the capability's
  display name plus the canonical stage label).
- **Harness** (`scripts/px-harness.mjs --v2`). It records evidence for:
  - the same state rendered in both themes
  - a real `placeCapability` change
  - every construction stage and gate, driven through `applyHqEvent`
  - every agent status
  - generic content: a trait-only capability of an unknown kind, and an unknown agent

  `ruleActors` takes any team. See `docs/world/evidence/pass5h-v2/README.md`.
- **Tests:** `tests/px-integration.test.mjs`.
- **V2 follow-up fixes (2026-10-03).**
  - Site labels for colon-containing ids: construction site spots look like `site:<project>:site:<project>:build1`.
    The details card split them at the first colon, so a site had no label. `locationOfSpot` now resolves the whole
    spot through `layout.stationInfo` (falling back to the longest matching location id), and `spotLabelOf` returns
    the canonical room or site label.
  - Status precedence: a resolved controller state (else a resolved intent) is authoritative, explicit `idle`
    included. The productive activity fallback applies only when neither is present. Movement and canonical blocked or
    waiting facts still come first.
  - Per-screen gating: `stage.screens` reports every screen's room, on/off state and sprite box. The tests check gating
    one screen at a time, with pixel crops instead of whole-frame hashes.

Not done here: the V2 PNGs were not rendered (the implementation sandbox has no shell). The command to regenerate them is
in the evidence README.

---

Visual refinement 2, live video:
`/mnt/project-files/pass5h-refine2/`.
