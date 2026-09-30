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
