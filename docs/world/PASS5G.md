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

## 19. Agent Office reference findings (addendum, research only)

I studied the reference repository `AgentSystemLabs/agent-office` (MIT, commit `665aeec`) read-only, in a scratch clone outside this repository. **No code was copied, no dependency was added, and nothing in 5E, 5F or 5G changed.** It is a reference for ideas, not a blueprint. Hillink's chain `HQ truth → semantic events → World → theme → 2.5D → renderer` stays authoritative.

Classes: **A** = already solved by Hillink · **B** = small safe 5G improvement · **C** = 5H (unified Real + Fantasy art/readability) · **D** = 5I (living world, physical work, interaction) · **E** = 5J (adaptive, declarative World) · **F** = future · **G** = reject.

**Foundational concern: none.** Agent Office's worker state is the most important contrast. It is driven by agent-CLI lifecycle hooks, plus heuristics that parse terminal escapes and screen text, and a turn-end counts as "done". Hillink's state comes from HQ's canonical run evidence (ACK, FINDING, COMPLETED, verdicts) and lifecycle authority. That is stronger ground truth, so nothing here needs correcting before 5H.

**Category B: none.** No finding fits inside 5G without moving its acceptance criteria.

### Findings by topic

**1. Clickable workers and live sessions.**
- In Agent Office, each visual worker is a real PTY session in a detached host. Clicking attaches a live terminal, a task card, a Changes window (git status and diff against base, commit or open PR) and a "send instruction" box, which is refused while the worker is busy.
- Hillink already has the click-agent inspector: task, stage, provider, HQ state, and a 5F capability-routed "Ask X to …" command that goes through HQ. So the basic linkage is **A**.
- Adding a live output stream, files changed, tests, branch or PR, and run evidence to the inspector, all read from HQ run evidence and never from a raw terminal, is **D (5I)**.
- A raw interactive terminal typed into from the World is **G**. It bypasses HQ authority and ZERO_CREDIT, and any viewer could drive an agent.

**2. Real coding activity → visual activity.**
- Hooks map to working, needs_input or done. Tool names map to poses (read, edit, test, web). Two failed test or build runs trigger a "despair" pose.
- The canonical-event approach is **A**, and stronger.
- The idea worth taking is finer visible actions derived from HQ evidence kinds (editing, running tests, reading, failing checks shown as distress). That is **D**, and the evidence kinds may need adding to HQ first.
- Deriving state from screen text or regex is **G**. It is heuristic truth.
- Confetti or "done" on a turn-end is **G**. Hillink celebrates only canonical completion (task DONE, CONSTRUCTION_COMPLETED).

**3. GitHub issues and PRs as physical objects.**
- Agent Office has Issues and PR boards backed by the `gh` CLI with a 90 s poll, PR windows with checks and merge, a merge "gong", PR-to-worker linking by branch, and an optional leave-on-merge.
- Hillink should treat an issue as a task board in Real and a quest or work order in Fantasy, and a PR as a review board in Real and an inspection order in Fantasy. It is one canonical object, drawn per theme. That is **D**, and it needs HQ to own the GitHub ingest as canonical events.
- A merge ceremony is **C**.
- Auto-dismissing an agent on merge is **F**. It would be an HQ policy, never a World decision.
- Letting the browser merge PRs is **G**. That action stays with HQ and Kyle.

**4. Isolated worktrees.**
- Agent Office gives each worker its own `git worktree` on an `office/<name>` branch fetched fresh from base. A multi-repo worker gets the same branch name in each repo, rolled back all-or-nothing.
- Cleanup refuses to delete dirty or unpushed work, and an offline prune supports dry-run. It has no merge-conflict handling; conflicts surface on the PR.
- This is a good pattern for HQ running several coding agents at once. It is **F**, an HQ concern and not a World one.
- The World only shows it: each agent's bench carries its own branch plaque. That part is **D**.
- Nothing changes in the current workflow.

**5. Agent-to-agent management (hire, message, dismiss).**
- Agents call a loopback endpoint authenticated by a per-worker token held in the environment. It checks capacity and budget, but there is no owner approval, and bypass-permission agents can hire and dismiss freely.
- Hillink's authority model (HQ validates, the owner creates and activates, READY ≠ ACTIVE) is **A**, and stronger.
- "An agent requests another worker → HQ validates → Kyle approves → canonical lifecycle → the World shows the arrival" is **F**. The request would become a new canonical event kind; activation remains Kyle's.
- A token in the environment that grants hire and dismiss is **G**.
- The World, or an animation, spawning a worker is **G**. Tests V1 and C already forbid it.

**6. "Needs you" and attention.**
- Status `needs_input` comes from permission and question hooks, plus a boot timeout.
- An **ack model** (`acked`, `waitingSince`): "done" nags until someone looks, while "needs input" nags until someone answers.
- Sticky desktop notifications for needs-input, self-closing ones for done.
- On the castle map, waiting workers physically **queue before the throne, longest-waiting first**.
- Hillink's canonical attention states (the attention panel, BLOCKED_REQUIRES_SPEND_APPROVAL, provisioning WAITING, and review verdicts) are **A**.
- A unified **NEEDS KYLE** concept is **D**: approval, decision, credentials, permission, spend or blocked deploy, with `waitingSince`, shown as the agent visibly waiting in Real and a fairy messenger or a line before the King's Command in Fantasy. It needs a canonical HQ reason field. Separating "seen" from "resolved" (the ack model) belongs with it.
- The notification sound and tone are **C**.

**7. Projects as physical space.**
- Agent Office maps one repo to one floor, each with its own palette, desks, boards and queue.
- Hillink's model (a capability or project becomes a construction site that grows into an established district) is **A** for features.
- The general hierarchy (major feature → site, separate product → building, separate organization → district or region) is **E (5J)**.
- Hard-coding one repo per floor is **G**. It would fix the World to repository structure.

**8. Data-driven maps.**
- JSON `MapConfig` with `extends`, and prototype-pollution-safe merging.
- Typed validation with readable errors and hard limits: bounds, 40 tables, 400 props, 24 files of 256 KB, reserved ids.
- The invariant **"every map places the same seat ids"**, so workers keep their seat across map switches.
- Hillink's metaphor table, the kingdom layout and semantic places (room and station ids carried across themes) are **A**. The 5G switching tests prove the same invariant.
- Worth taking for **E (5J)**: declarative theme or map definitions loaded as data, with a validator that has limits and human-readable errors. It must stay non-executable, with literal words only and no regex or code, as in 5E and 5F.
- Scripted theme interactions such as the castle's Kingsguard escort to a dungeon cell are **G**. They display dismissed agents as prisoners indefinitely, which is flavour showing a state HQ doesn't hold. A disabled agent in Hillink simply leaves (test K).

**9. Status readability.**
- A bulb colour per state (idle blue, working yellow, **needs-you red, pulsing**, done green, asleep grey) plus a small task chip.
- The bubble shows "PR #n open/merged" when the agent isn't working.
- A needs-you pose: jump, then crossed arms and a foot tapping.
- The pose calms when a viewer comes close.
- These are **C (5H)**, in both Real and Fantasy:
  - a consistent state-colour language across the state rings and HUD;
  - a distinct, persistent "needs Kyle" pose and marker;
  - a PR or quest chip on idle agents;
  - a calmer pose once acknowledged, driven by canonical ack, not camera proximity.
- Hillink's state rings, captions and inspector are **A** as a base.

**10. Multi-agent coordination.**
- Meeting patterns: debate, lead and team, map-reduce, red and blue, review panel. Each has role cards, a shared worktree, and a live wall board.
- **Turns advance only when the named output file exists.** That is the best idea found: "check the files, not the talk".
- Living HQ meetings, handoff messages (the fairy in Fantasy) and the canonical AGENT_MESSAGE are **A**.
- Evidence-gated collaboration is **F**, as HQ policy: a shared task advances on artifacts HQ verifies, and the World shows each step.
- Role cards over heads and a shared wall board or war-table showing the canonical output are **D**.
- A "speaking" animation inferred from active turns, not real messages, is **G** for Hillink. Only canonical messages are drawn.

### Carry-forward summary
- **5H (C):** unified state-colour language; a persistent needs-Kyle marker and pose; a PR or quest chip on idle agents; calm-on-acknowledged poses; a merge or completion ceremony only on canonical completion; attention sound design.
- **5I (D):** an inspector with live HQ run evidence (output, files, tests, branch, PR); evidence-driven poses (editing, testing, reading, failing checks); issues and PRs as boards in Real and quests or inspection orders in Fantasy; a NEEDS KYLE line or messenger with `waitingSince` and ack; per-agent branch plaques; meeting role cards and a war-table board.
- **5J (E):** declarative, validated map and theme definitions with limits and readable errors, non-executable; the project → site, building, district or region hierarchy.
- **Future (F):** per-agent git worktrees in HQ with dirty/unpushed-safe cleanup and a dry-run prune; agent-requested hiring through HQ validation and Kyle's approval; evidence-gated multi-agent sessions; auto-dismiss on merge as an HQ policy.
- **Rejected (G):**
  - raw terminal input from the World;
  - heuristic or screen-parsed state;
  - celebrating a turn-end;
  - browser merges;
  - env-token hiring or dismissing;
  - World- or animation-spawned workers;
  - one repo per floor;
  - the dungeon/prisoner display;
  - inferred "speaking";
  - 3D, first-person or WASD, and Agent Office's camera, style and scale.
