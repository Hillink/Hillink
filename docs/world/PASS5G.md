# World Pass 5G: Fantasy World Foundation

Branch `claude/world-5g`, based on `claude/world-5f-b1 @ a3301fc`. Not merged, not deployed.

Labels used throughout:

- **CANONICAL**: HQ truth, carried as World events and reduced by `core/state.mjs`. Only HQ (or the clearly labelled simulator) writes it.
- **DERIVED**: a pure function of canonical state. It is recomputed and never stored back.
- **THEME**: declarative Fantasy data (names, looks, zones, captions). It has no behaviour.
- **COSMETIC**: time-based motion with no meaning (idle sway, a cart wobble, a cat). It never feeds anything.

## 1. Architecture

```
HQ truth (CANONICAL)
  → World events / WorldStore (CANONICAL, unchanged by 5G)
  → theme interpreter: themes/interpreter.mjs FANTASY (THEME: captions, summoning stages, event cues)
  → kingdom spatial system: world/kingdom-layout.mjs (DERIVED from canonical capabilities and projects)
    + metaphor table: themes/fantasy/metaphor.mjs (THEME)
    + derived entities: themes/fantasy/entities.mjs (DERIVED/COSMETIC)
  → kingdom skin: render/kingdom-skin.mjs (THEME drawing, COSMETIC motion)
```

Fantasy is **not a reskin**. It has its own layout: 12 districts on two rows either side of a road, a summoning circle with six zones, construction plots, 62 stations and 121 navigation edges. It has its own stations, uses, routes and walls. It is **not a second simulation** either. The engine (`IsoWorldView`, `core/behavior.mjs`, motion, the scene) is the same one Real uses. It reads the same `store.world` and places agents from the same canonical activity, task and lifecycle fields. The only thing Fantasy swaps is the layout object and the skin passed to the engine, which is the contract `themes/index.mjs` already had since 5E. Test "the kingdom is its own spatial system" asserts that the station sets differ.

Engine changes are tiny and generic. The layout can now declare:

- `idleRooms`, which `iso-view` wander uses (it used to be hard-coded `['lounge']`)
- `publicRooms`, which ambient NPCs use
- `derive`, which `world-view.syncDerived` uses to upsert and remove `derived:*` entities

Real passes none of these, so Real behaves exactly as before. All 189 pre-5G World tests are unchanged and pass.

## 2. Mappings (THEME, `themes/fantasy/metaphor.mjs`)

Agents go to a **domain** through `DOMAIN_RULES`, an ordered list of literal-word rules. Each rule matches on one of `kind`, `responsibilities`, `capabilities`, `team`, `provider` or `role` of the canonical definition. There is no regex and no code in the data, and no rule names an agent id.

| Domain | District | Matched by (examples) |
|---|---|---|
| owner | Throne | kind `person` |
| orchestration | Throne (idle at the throne) | responsibilities orchestration/coordination |
| implementation | Forge | responsibilities implementation, capability implement/build |
| qa | Oracle Chamber | review/testing/inspection, capability inspect-repo/review-repo/verify-* |
| finance | Vault | team finance/treasury, role treasurer/budget |
| analytics | Observatory | team analytics/data, role analyst/metrics |
| outreach / security | Gate | team outreach/marketing/security, role scout |
| memory | Library | responsibilities research/memory/archive |
| apprentice | Academy | capability summarize/research, provider local/ollama |
| process | Arcane Engine | kind `process` |
| general (default) | Hearth Commons | anything else |

Activities go to district uses. A task's canonical activity picks the kind of station, following the Real mapping: coding → forge `work`, reviewing/testing → oracle `inspect`, researching → library `read`, meeting → throne `meeting`, idle/offline → `relax`. A task pickup uses the plaza quest board (`fixtures.taskBoard`). Finishing a task files at the library (`fixtures.archive`).

## 3. Spatial system and locations (DERIVED + THEME, `world/kingdom-layout.mjs`)

- Rows: the front row runs from z 60 to 440, the Kingdom Road from 440 to 640 (spine z 540), and the back row from 640 to 960. Every district opens its door onto the road.
- Front row: Gate, Summoning Circle, Forge, Hearth Commons, Academy, Builders' Yard.
- Back row: Great Library, Oracle Chamber, Throne Keep, Vault, Observatory, Arcane Engine.
- **Established vs. unbuilt**: a district is *established* when it is marked `always` or a usable canonical capability backs it (`establishedDistricts(world)`). An unbacked district is drawn as a tent on an empty lot, and its label says "no such capability in HQ yet". The kingdom never claims a capability HQ does not have.
- Old Real room ids alias onto kingdom districts (queue→plaza, development→forge, testing→oracle, lounge→hearth, command/comms→throne, archive→library, servers→arcane, deploy→gate, onboarding→summon-arrive). Any engine path that still names a Real room lands somewhere sensible.

## 4. Entities (`themes/fantasy/entities.mjs`)

Every entity below is non-canonical and non-selectable. None is an agent, and each is created only through `layout.derive`.

| Entity | Label | Source |
|---|---|---|
| Giant `derived:giant:<project>` | DERIVED | a project at site-preparation, foundation or structure **with builders working** (`buildersWork`) |
| Worker `derived:worker:<project>` | DERIVED (haul motion COSMETIC) | a project with builders working |
| Cart `derived:cart:<project>` | DERIVED | a project from foundation up to inspection |
| Portal `derived:portal:<agent>` | DERIVED | a candidate agent's canonical lifecycle state |
| Ranger, Gate Golem | COSMETIC infrastructure; alert is DERIVED | alert only while canonical open issues exist |
| Cat | COSMETIC | ambient |
| Fairy messenger | THEME drawing of a CANONICAL event | drawn on the existing `message` effect (an `AGENT_MESSAGE`), with no entity |

Specs hold ids, never references. Mutating a spec changes nothing (test I).

## 5. Appearance

This uses the 5E/5F pipeline unchanged. An explicit `appearance.themes.fantasy` on the definition always wins. Otherwise the archetype for the agent's domain is used (`DOMAIN_ARCHETYPE`, with `ARCHETYPE_ALIAS` for words such as elf→ranger or wizard→apprentice). An unknown archetype falls back to the humanoid figure. The kingdom skin adds named overlays (wings, a red bionic eye, goblin ears, a cyclops eye, a hood glow, a regal glow). These are names in data, drawn by fixed code, never executable metadata.

Defaults changed in `core/agents.mjs`:

| Agent | Look |
|---|---|
| ChatGPT | king, green/gold, crown |
| Claude | dwarf, plus `equipment:['hammer']` (the pinned 5E figure is untouched) |
| Codex | cyborg: blue armour, one red bionic eye, human face (no visor, not a full robot) |
| Qwen | apprentice, white/blue |
| Gemma | apprentice, green |
| Kyle | adventurer, brown/red |

Scout (cupid), Treasurer (goblin), Oracle (hooded purple), Cyclops (shaggy orange-brown) and the rest come from `ARCHETYPES` by domain or alias, so a dynamic agent of that role gets the look with no source edit.

`RIG_TARGETS` records which rig each body should eventually get. No new rig profiles are registered: pass5e test 112 pins the golem rig falling back, so the giant and golem are drawn in the skin in 5G.

## 6. Construction (CANONICAL stage → THEME phase)

`CONSTRUCTION_PHASES` maps every canonical stage (planning … operational) to a kingdom phase and label. For example, foundation is "Laying the foundation stones" and furnishing is "Bringing in the furnishings". The site drawing is chosen by the canonical `project.stage` only. Nothing in the kingdom can advance a stage: test G asserts that frames alone never change it, and test H asserts that a Giant or worker loop can never create progress.

## 7. Provisioning: Summon Hero (CANONICAL lifecycle → THEME zone)

| Canonical state | Zone | Portal |
|---|---|---|
| REQUESTED | summon-arrive | forming |
| CONFIGURING | summon-runes | forming |
| CONNECTING_PROVIDER | summon-portal | opening |
| CONNECTING_TOOLS, GENERATING_APPEARANCE | summon-armoury | opening |
| TESTING | summon-trial | trial |
| WAITING | summon-portal | dim |
| ERROR | summon-portal | unstable |
| READY | summon-ready | stable, "Hero ready: awaits the King's word to enter (ready, not active)" |

**READY is not ACTIVE.** A READY hero stays in the ready zone, gets no work station and cannot be routed to work (test C). It enters the kingdom only on canonical `AGENT_ACTIVATED`, which HQ emits when Kyle activates it. The live run shows this: the scout and the tester both waited at summon-ready, only the activated scout entered, and the tester was still waiting after reload.

## 8. Giant

The Giant is a theme entity whose presence and pose come from `GIANT_WORK[stage]` (site-preparation: clearing, foundation: placing stones, structure: raising beams) and `buildersWork(project)`. It is never an agent, never selectable, and never a writer.

## 9. Security vocabulary (THEME only)

`SECURITY_VOCABULARY` maps detect → Ranger, alert → Fairy messenger, enforce → Gate Golem, investigate → Codex, and repair → Claude. It only names things. The ranger's and golem's alert is derived from canonical open issues. **No incident is ever fabricated.** With no open (or only closed) canonical issues there is no alert (test "2.5D", security assertions).

## 10. Layers and 2.5D (`render/kingdom-skin.mjs`)

`KINGDOM_LAYERS = ['farBackground','background','ground','building','agent','foreground','overlay']`. Items are banded by layer rank. Building and agent share a rank and are depth-sorted by footprint (engine `depthSort`), so a hero inside a back-row hall is behind its front wall and a hero on the road is in front of it. Front-row road fences are on the foreground layer, over heroes inside the front districts, and back-row side walls are cut low. Tested in "2.5D". Visible in `8-overlap-sim.png` and `8b-overlap-hero-inside-frame-sim.png`, where Claude is drawn inside the half-built frame.

## 11. Navigation

There is one node graph: district doors, the room interior node, stations, road spine nodes and site gates. A route attaches to the nearest node through a straight segment that stays inside one walk area and clears solids, then runs Dijkstra. An unreachable destination returns `null`, never a teleport. Test N checks that every station, overflow spot and site is reachable from the gate door and that no route segment crosses a wall or furniture.

## 12. Dynamic agents

These need no source edit. Test D registers `agent-5g-unknown-318`, with fantasy archetype `elf`, which is not in any table. The agent is summoned through the zones, stays READY, is activated, is placed by its domain, picks up work, travels, works (library `read`), and survives a store reload. Test E/M places many agents of different roles on distinct reachable spots. The live run did the same through the real HQ owner API with `agent-5g-unknown-512`: REQUESTED → CONFIGURING → CONNECTING_PROVIDER → CONNECTING_TOOLS → TESTING → READY → (Kyle's activation) ACTIVE → task DONE ("Inspected 164 repository source paths") → at the Oracle Chamber after reload.

## 13. Truth equivalence and switching

The same events give the same canonical World in either theme (test A). Viewing does not change it. Real↔Fantasy switching, repeated six times and also mid-work, leaves the canonical World byte-identical with no duplicate entities (tests B and O, and live `switching` in `pass5g-live-results.json`: 28 entities in Real and 36 in Fantasy, where the extra 8 are derived kingdom entities, with 0 duplicates and `truthUnchanged: true` on every switch).

## 14. Determinism

Layout, placements, derived entities and paths are pure functions of the canonical state and seed (test J). Cosmetic motion is a function of the time argument only.

## 15. Preserved

- READY ≠ ACTIVE
- the read-only renderer (`readonly()` throws on writes)
- live/sim isolation (test L; the live page exposes no simulator)
- replay
- the dynamic registry and provisioning
- capability routing
- disable/requeue from a3301fc (test K: the task goes back to the queue, the hero leaves the kingdom, nothing is marked failed)

## 16. Tests and evidence

- `tests/pass5g.test.mjs`: 15 tests covering A–O, kingdom-is-own-system and 2.5D. **World 204/204** (189 before 5G plus 15). **HQ 201/201.**
- Live evidence script: `tools/hillink-world/live/pass5g-live.mjs`, with real HQ, the real World server and headless Chromium.
- Evidence in `docs/world/evidence/pass5g/`:
  1. `1-kingdom-overview-live.png`: kingdom overview (live HQ)
  2. `2a-same-state-fantasy.png` and `2b-same-state-real.png`: the same live state in both themes
  3. `3-claude-forge-sim.png`: Claude working at the Forge (simulated events, labelled)
  4. `4-codex-inspect-sim.png`: Codex inspecting at the Oracle Chamber (simulated)
  5. `5a-summoning-in-progress.png` and `5-summon-ready-not-active.png`: live provisioning; both heroes wait at the ready zone
  6. `6-dynamic-agent-active-fantasy.png` and `6b-after-reload.png`: the live dynamic agent activated, then at its work area after reload
  7. `7-construction-step{1,3,5,8}-sim.png`: construction at several canonical stages (simulated demo; the Giant appears only at the stages allowed to have one)
  8. `8-overlap-sim.png` and `8b-overlap-hero-inside-frame-sim.png`: 2.5D overlap
- Live results: `pass5g-live-results.json`.

## 17. Limitations (honest)

- Art is structural. Figures reuse the procedural humanoid with overlays. The giant, golem, fairy and cart are simple skin drawings. District labels are small at overview zoom.
- Claude's working animation label still reads "Typing" (a Real verb), because the activity label comes from the shared interpreter. The kingdom caption overrides exist for lifecycle and events, not per-activity verbs yet.
- The kingdom is large. Heroes arriving from the gate take about 20–30 s to reach back-row districts at the current walk speed.
- The live `inspect-repo` run finishes faster than one World poll, so the live shot shows the hero heading to the Oracle Chamber rather than mid-work. Working at a station is proven in tests D and F and in the simulated shots 3 and 4.
- There is no dedicated rig for giant, golem or fairy (see RIG_TARGETS). The pass5e fallback test pins that for now.

## 18. Left for 5H / 5I

- **5H (art)**: final kingdom art, dedicated bodies for RIG_TARGETS, readable district signage, per-archetype animation sets, per-activity Fantasy verbs.
- **5I**: cinematics and camera moves for summon, activation and construction milestones, plus a shorter or faster travel model for the large kingdom.
