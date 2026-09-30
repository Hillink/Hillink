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
Gates, also only from HQ. They fail closed (corrected after Codex's audit of `deb5cca`):

| Gate | Set by | What the World shows | Cleared only by | While it is open |
|---|---|---|---|---|
| blocked | `BLOCKED` (objective or task), or an implementation that ended failed, blocked, uncertain, rate limited or cancelled | STOP sign, builders leave the site | new implementation evidence **newer than the block** | no stage change, no inspection, no verdict counts toward completion, no completion, no verification |
| waiting | `APPROVAL_REQUIRED`, `DECISION_REQUIRED`, `SPEND_APPROVAL_REQUIRED` | waiting marker, builders wait off site | authority to continue **newer than the wait**: Kyle's approval (`SPEND_AUTHORIZED`) or HQ dispatching the project's work again. Evidence of work is *not* authority and is refused while waiting; inspection never clears a wait | same |
| rework | review verdict `request_changes` or `reject` | rework | new implementation evidence newer than the verdict (then re-inspection and a new approval) | **never operational**: completion and verification are refused, and even a newer approval cannot clear rework |

- Tests the builders run mid-build are site work, not an inspection, so the stage does not move. `INSPECTION_STARTED` before the fit-out is refused.
- **Chronology.** Every fact carries its HQ provenance: the journal `seq`, which the adapter now passes through, or its time. The project keeps a revision number (one per piece of evidence) and the provenance of its latest evidence, verdict and gates. A verdict counts only for the revision under inspection, and only if it is newer than the inspection, the latest evidence and the latest verdict. An older verdict delivered late, in either direction, is refused as stale. Facts whose order cannot be proven are not newer.
- **Completion and verification** both require: stage inspection, an approving verdict of the current revision, and no open gate. Verification additionally requires completion.
- **Atomic.** `applyHqEvent` applies each event as a transaction. A refused (or throwing) event leaves the canonical world, its history, fingerprint and applied-event set exactly as they were.

Canonical structure status follows the stage: `planned` during planning, `under-construction` while building, and `built` (walkable, furnished, usable) only on completion. Every applied fact is recorded in `world.history`, so a reload or replay reaches the same state.

**Planned is not usable.** A capability shapes a room (its furnishing, its semantic place such as `comms`, and where activities send agents) only once it is built or operational. When the planner puts a new capability into an existing built room, that room keeps its previous purpose until the capability is complete. Its inspector label names the capability as "Planned: … (not usable yet)".

**Site access.** A construction site is entered only through its real door: a site gate at the project's door, reached on the walk grid of the built space it opens from, on a storey the built lift serves. From there the builders walk the project's own grid. A site with no such entrance has no stations and is unreachable, so no builder is sent there. Routes fail closed: `route()` returns `null` when the graph is disconnected, and the engine keeps the character in place (`entity.unreachable`). The stretch between a free point and the graph is used only after it is checked against the walk grid.

## 3. The live HQ bridge

`serve.mjs` `siteFeed()` polls HQ's read-only World contract feed (`GET /api/world?since=`), translates each item with `fromHqActivity()` and applies it through `applyHqEvent()`. That means only `source: 'hq'` events, each id applied once, and every refusal counted. Each translated event carries HQ's journal `seq` as its provenance. It never writes to HQ.

**Durability (corrected).** The durable cursor never runs ahead of the durably saved world. Applying facts marks the world dirty. The cursor file is written (atomically) only after the world holding those facts has been saved. A failed save keeps the world dirty and the durable cursor where it was, and every later tick retries the save first, even when HQ has nothing new. After a restart the older world and older cursor are loaded, and HQ delivers the lost facts again. A crash between the two writes leaves the cursor behind, and the applied-id set makes redelivery a no-op. Each fact ends up in the durable world exactly once.

**Startup (corrected, `ui/site-sync.mjs`).** Polls compare against the signature of the world actually displayed, so a newer world returned by the very first poll is applied. If the generated world cannot be loaded at boot, the page retries. If it still fails, the page shows the hand-built building **only** under a red "GENERATED WORLD UNAVAILABLE … fallback" badge, and the LIVE label adds "(fallback building, not the generated World)". It keeps retrying and switches to the generated world when it recovers. The legacy building is the normal World only with `?world=legacy`, where it is labelled as selected.

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

`tests/pass5b.test.mjs` has 16 tests. `tests/pass5b-correction.test.mjs` adds 17 regressions for Codex's seven findings, each verified to fail at `deb5cca`; `tests/route-check.mjs` validates complete emitted routes against walls and solid furniture. All 130 World tests pass.

Evidence capture fails closed: a shot whose `until` prerequisite never holds, or whose `expect` assertion is false, writes no image and makes the run exit 1. `notes.json` records for every image which world was shown (generated, legacy or fallback; simulated or not; generator, seed and fingerprint).

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
