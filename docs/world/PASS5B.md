# Pass 5B: the generated building is the World

Status: **built by Claude** on branch `claude/world-pass5b` (Kyle's Pass 5B brief in issue #12), on top of Pass 5A (`dd41c74`). Codex review is requested. Not merged, not deployed. Pass 5C is not started.

Code: `tools/hillink-world/` (`procgen/furnish.mjs`, `procgen/view.mjs`, `procgen/construction.mjs`, `world/generated-layout.mjs`, `render/site-skin.mjs`, `sim/construction-demo.mjs`, the bridge in `serve.mjs` and `procgen/contract.mjs`). Tests: `tools/hillink-world/tests/pass5b.test.mjs`. Evidence: `docs/world/evidence/pass5b/` (regenerate with `node tools/hillink-world/scripts/capture.mjs docs/world/evidence/pass5b/shots.json` against a running World server).

## 1. What changed

Pass 5A made the World a generator, drawn only as a plan. Pass 5B makes the generated world the World people see and the agents live in.

- **View frame** (`procgen/view.mjs`). The cutaway camera faces the founding building's entrance, chosen once, canonically. Furniture facing, navigation and rendering all use this frame, so they agree on which side of every room is open.
- **Furnishing** (`procgen/furnish.mjs`). Every generated room is furnished from its capability (or its role, if the kind is unknown), sized by `world/scale.mjs`. Pieces sit inside their walls, never overlap, keep door swings clear, and every anchor (seat, desk, console, rack, printer, counter) is reachable from the door. Anything unreachable is removed, not left as a trap. Same room, same furniture.
- **Generated layout** (`world/generated-layout.mjs`). The canonical world becomes exactly the layout interface the engine already runs on: locations, stations, doors, a nav graph with lifts, `route()`, `planAt()`, places and task slots. Routes follow the furnishing's walk grids, so they never cross furniture or walls. Spaces connect only at doors, and storeys only through a built elevator. **Only built structures are walkable.**
- **Renderer** (`render/site-skin.mjs`). This draws generated sites in the old World's object-built cutaway style, using the same props, figures, labels and cars. Walls come from geometry, and construction is drawn only from canonical project state.
- **Legacy World kept.** `?world=legacy` still loads the hand-built building, for comparison and regression.

## 2. The construction lifecycle (only HQ facts move it)

```
planning ─► site-preparation ─► foundation ─► structure ─► exterior ─► systems ─► furnishing ─► inspection ─► operational
 CAPABILITY_   CONSTRUCTION_      one stage per piece of implementation evidence         TESTING /     approved review
 REQUESTED     REQUESTED          (WORK_COMMITTED), or all at once when HQ reports       REVIEW /      + CONSTRUCTION_COMPLETED
                                  the implementation finished (IMPLEMENTATION_DONE)      INSPECTION_   + CAPABILITY_VERIFIED
                                                                                         STARTED       (or HQ objective COMPLETE)
```

Flags, also only from HQ:

| HQ fact | What the World shows | Rule |
|---|---|---|
| `BLOCKED` (objective or task), or an implementation that ended failed, blocked, uncertain, rate limited or cancelled | STOP sign, builders leave the site | Nothing advances. Completion is refused until HQ reports new evidence. |
| `APPROVAL_REQUIRED`, `DECISION_REQUIRED`, `SPEND_APPROVAL_REQUIRED` | waiting marker, builders wait off site | Completion is refused. The wait lifts only on Kyle's approval (`SPEND_AUTHORIZED`), HQ dispatching the project's work again, or new evidence. |
| Review verdict `request_changes` or `reject` | rework | **Never operational.** HQ completing the objective is refused (`review is not approved`), and the project goes back to systems on the next evidence. |
| Tests while still building | builder testing on site | This is not an inspection, so the stage does not move. |
| `INSPECTION_STARTED` before the fit-out | none | Refused. |

Canonical structure status follows the stage: `planned` during planning, `under-construction` while building, and `built` (walkable, furnished, usable) only on completion. Every applied fact is recorded in `world.history`, so a reload or replay reaches the same state.

## 3. The live HQ bridge

`serve.mjs` `siteFeed()` polls HQ's read-only World contract feed (`GET /api/world?since=`), translates each item with `fromHqActivity()` and applies it through `applyHqEvent()`. That means only `source: 'hq'` events, each id applied once, and every refusal counted. The server saves the world when something changed and keeps its cursor beside the world file, so a restart resumes where it stopped. It never writes to HQ.

New mappings in 5B (`procgen/contract.mjs`):

| HQ activity item (contract v1) | World contract event |
|---|---|
| `HANDOFF_RECEIVED` review, `verdict: approve` | `REVIEW_VERDICT approved` |
| `HANDOFF_RECEIVED` review, `verdict: request_changes / reject` | `REVIEW_VERDICT changes` |
| `IMPLEMENTATION_FINISHED` completed / anything else | `IMPLEMENTATION_DONE` / `BLOCKED` |
| objective `VERIFYING` / `REVIEWING` (no agent) | `INSPECTION_STARTED` |
| objective `COMPLETE` / `FAILED` / `CANCELLED` | `OBJECTIVE_FINISHED` (a project completes only if inspected, approved, unblocked and not waiting) |
| `SPEND_AUTHORIZED` | `APPROVAL_GRANTED` |
| `BLOCKED`, `APPROVAL_REQUIRED`, … | now carry HQ's summary as the reason |

**The one HQ change** is additive. In `tools/hillink-hq/orchestration/activity.mjs`, a review `HANDOFF_RECEIVED` item now carries the handoff's `verdict`, the enum HQ already validated (`approve | request_changes | reject`). It is never model text. No HQ security, broker, verification or approval code is touched.

## 4. The demonstration is a simulation, and says so

`?demo=construction[&step=N][&walk=1]` runs "We need a meeting room" through 16 steps of simulated HQ facts (`sim/construction-demo.mjs`). These go onto a **simulated copy** of the world (`world.simulated = true`), which is never saved. It refuses live HQ events, and the real world refuses its `hq-simulated` events. The page shows the SIMULATION banner and a step-by-step note of each fact and any refusal. The demo includes a block, a rejected review and rework, so every flag in section 2 appears on screen.

## 5. Tests

`tests/pass5b.test.mjs` has 16 tests. Earlier suites are unchanged, and all 113 World tests pass.

- Furnishing validity: inside walls, no overlaps, door swings clear, every anchor reachable, on six seeds.
- Navigation: never through furniture or walls, in through doors, every station reachable, upstairs by elevator. Traffic stays on the generated road lanes.
- Stage transitions only on HQ facts, in order. Out-of-order facts are refused.
- Unfinished structures are excluded from navigation and use, and join both once complete.
- Expansion moves nothing unrelated.
- Persistence and replay of a half-built project.
- The same project in Real and Fantasy: same id, stage and site, different presentation.
- The demo is simulated and labelled.
- Live bridge: applies once, keeps a cursor.
- **Live bridge truth (new):** BLOCKED stops construction. A rejected review is never operational. Kyle's approval means wait. A full HQ journal (implementation, verification, approving review, completion) makes the room operational. These tests drive HQ's own `worldActivity()` with journal events.
- Old baseline behaviours on generated geometry: enter, walk the halls, ride the lift, sit and type, print, rest, meet. Builders build and an inspector surveys.

## 6. Deferred to 5C

- **HQ emitting the capability vocabulary.** HQ does not yet emit `CAPABILITY_REQUESTED` or `CONSTRUCTION_REQUESTED`, so a live project only exists when those facts come in. The World applies them already, but there is no HQ objective type that says "build this capability". Until 5C, a live build shows only through the demo or through those contract events applied directly.
- **Evidence granularity.** Today HQ reports one local commit per implementation run. The live build therefore jumps from foundation to furnishing when the implementation finishes, instead of passing one stage per commit.
- **"Accepted despite review" (Kyle's override) and "reviewer conceded".** HQ can finish an objective after a rejecting review. The World currently refuses to complete such a project. 5C should decide whether Kyle's explicit override counts as approval.
- Multi-building sites, demolition and refits, and the iso plan inspector (`site.html` is still the 5A plan view).
