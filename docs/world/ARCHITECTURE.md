# Hillink World: architecture proposal

Status: **proposed by Claude**, answering Kyle's brief in [`BRIEF.md`](BRIEF.md). The brief is **confirmed by Kyle**. Everything below is the agent's proposal unless marked otherwise, and Codex review is requested in issue #12.

The prototype lives in `tools/hillink-world/` (`npm run world`, then open http://127.0.0.1:4320). It is a new engine and does not reuse the HQ World SVG from PR #34, which Kyle's brief supersedes.

## What exists in Hillink today (observed in current code)

- **The Hillink app** (`main`): Next.js 15 App Router, Supabase (Postgres + RLS), Stripe and Vercel. It has no agent or activity feed. Admin pages sit under `/admin` with server-side admin checks.
- **HQ** (`tools/hillink-hq`, PRs #31, #33 and #34, not merged):
  - A local, loopback-only Node server with an event-sourced journal of agents, tasks, reviews and handoffs.
  - `GET /api/state` requires a session token plus same-origin headers.
  - HQ is the only place real agent activity exists today (Claude and Codex CLI runs, reviews, task status).
- **GitHub** carries PRs, CI and issues. **Vercel** carries deploys. **Supabase** carries platform data. None of these push activity anywhere the World could read yet.

The World therefore starts in simulation and gets its first real feed from HQ (Phase 4 below).

## 1. World architecture

```
 sources            adapters              core (pure)                 engine                     render          UI overlays
 ─────────          ────────              ───────────                 ──────                     ──────          ───────────
 HQ /api/state ─┐
 GitHub (later) ├─► adapter ─► World events ─► WorldStore ─► WorldView + behavior ─► Scene ─► Renderer(skin) ─► canvas
 Vercel (later) │   (translate,  (validated,    (reducer,     (activity → room,       (entities,   (Canvas 2D     inspect panel,
 Simulator ─────┘    never write)  versioned)    batching,     station, clip; paths)   spatial      today)         nav, tooltip,
                                                 dedupe)                                 index)                     sim panel
                                                      ▲                                    ▲
                                                 Camera (pan, zoom, focus, follow) ────────┘
```

Rules that keep it separable:

- **Adapters are the only code that knows a backend.** They translate backend state into World events and never write back.
- **Core is pure.** `core/` has no DOM, no timers and no network. It runs in Node tests.
- **Behavior is visual policy, not agent logic.** An agent says `testing`. `core/behavior.mjs` decides that means "Testing Lab, bench 2, play `test`".
- **The renderer never queries anything.** It receives a frame (camera, culled entities, signals, time) and draws it.
- **Art is a skin.** `render/skin-placeholder.mjs` draws primitives. A sprite skin replaces it without touching state or the engine.

## 2. Renderer and technology choice

**Proposed: Canvas 2D now, behind a renderer interface. PixiJS (WebGL) later if and when sprite art needs it.**

- Canvas 2D has zero dependencies and works in every browser. It easily draws hundreds of primitives at 60fps with culling. Text is simple.
- The renderer contract is small: `resize(w, h, dpr)` and `draw(frame)`. A Pixi renderer can implement the same two calls.
- Not a game engine (Phaser and similar). It would own the loop, scene and input, which would break the required separation and add a large dependency for features we don't need.
- Not DOM or SVG for the world. The #34 attempt showed layout fighting and per-node cost as entity count grows.
- The UI overlays (inspect panel, nav, tooltip) stay as HTML over the canvas, for accessibility and text quality.

## 3. State model

`core/state.mjs` `emptyWorld()`:

| Slice | Shape (abridged) |
|---|---|
| `agents[id]` | name, role, kind, `activity` (one of 11), `taskId`, `since`, `lastEvent`, `source`, `appearance`, `talkingTo` |
| `tasks[id]` | title, `status` (queued/active/done/failed), `agentId`, `progress`, history |
| `systems[id]` | name, kind (database/tests/deploy/build/platform/hq), `state` (ok/busy/degraded/down/unknown), metrics, detail |
| `prs`, `builds`, `deploys`, `testRuns`, `issues` | lifecycle state per id |
| `messages` | last 50 agent-to-agent messages |
| `log` | last 500 events, for replay and inspection |

- **Only events change state**, through `applyEvent(world, event)`, which returns a set of changed keys (`agent:claude`, `task:t1`, …).
- `WorldStore` queues events and applies them once per frame (batching). It sorts by `at`, dedupes by event id (adapters may redeliver), quarantines invalid events in `rejected`, and notifies subscribers once with the union of changed keys.
- `replace(world)` swaps in backend truth wholesale. This is how a live source overrides a cached or simulated world.
- **Visual state is separate** (`engine/`): positions, paths, clips, effects and camera. It can always be rebuilt from World state, so no animation is ever the source of truth.

## 4. Event schema

`core/events.mjs`, `SCHEMA_VERSION = 1`. Every event has:

```js
{ v: 1, id: 'hq-…', type: 'TASK_STARTED', at: 1759110000000, source: 'hq' | 'github' | 'platform' | 'sim' | 'replay', ...fields }
```

- **Types:** AGENT_REGISTERED, SYSTEM_REGISTERED, TASK_CREATED / STARTED / PROGRESS / COMPLETED / FAILED, AGENT_STARTED_WORK / THINKING / RESEARCHING / REVIEWING / TESTING / WAITING / IDLE / ERROR / OFFLINE, AGENT_MESSAGE, PR_CREATED / REVIEWED / MERGED, BUILD_STARTED / SUCCESS / FAILED, DEPLOY_STARTED / SUCCESS / FAILED, TESTS_STARTED / FINISHED, ISSUE_FOUND / RESOLVED, SYSTEM_STATUS.
- Each type declares its required fields, and `validateEvent` enforces them along with the version and source.
- **Progress must be evidence.** It is either `{kind:'ratio', done, total}` from a real counter, or `{kind:'stage', stage:'Implementing'}`. A bare percentage is rejected, so the World can't show invented progress.
- `source: 'sim'` marks simulated events. The UI labels sim mode on screen at all times.

## 5. Folder and module structure

```
tools/hillink-world/
  core/        events.mjs, state.mjs, behavior.mjs (activity → place/clip)
  world/       building.mjs (the HQ as data: rooms, walls, furniture, points, nav, elevator), layout.mjs (building → layout interface)
  engine/      camera.mjs, scene.mjs, motion.mjs, lift.mjs, ambience.mjs, iso.mjs (projection, depth sort), world-view.mjs, iso-view.mjs (character controller)
  render/      canvas2d.mjs, iso-skin.mjs (scene renderer), props.mjs (furniture), figure.mjs (characters), looks.mjs (skins)
  themes/      index.mjs (Realistic / Fantasy / Blueprint pick a skin over the same layout)
  ui/          inspect.mjs (hover + inspect content)
  sim/         simulator.mjs (dev scenarios, sim events only)
  adapters/    (Phase 4) hq.mjs: HQ state → World events
  tests/       node:test, `npm run test:world`
  main.mjs     wiring, input, loop, persistence
  index.html, style.css, serve.mjs (loopback static server, strict CSP, allowlisted files)
```

Everything is plain ESM with no build step and no dependencies. It sits outside the Next.js tsconfig, so it cannot affect the app build.

## 6. Integration boundaries with existing Hillink

- **The World never touches Supabase, Stripe or GitHub directly**, and never writes anywhere. It only consumes World events.
- **Phase 4, HQ adapter (proposed next):**
  - HQ exposes a read-only World feed: its state translated to World events or a snapshot.
  - The World is served from HQ's own origin so HQ's same-origin and token checks still apply. Alternatively, HQ adds one read-only route.
  - The adapter maps HQ agents, tasks, reviews and handoffs to AGENT_*, TASK_* and AGENT_MESSAGE events.
- **Later, GitHub and Vercel:** these arrive through HQ or a server-side collector, never from browser tokens.
- **Later, in the app:** an `/admin/world` page could host the same engine. It would be fed by a server route that checks admin auth and returns World events. **Unresolved question for Kyle:** should the World ever be visible inside the Hillink app, or stay an internal HQ tool?
- **Simulation isolation:** the simulator has no adapter and no network. Sim events are tagged `sim`, and sim state is stored under its own localStorage key.

## 7. First minimal playable prototype (built, this PR)

- Nine meaningful rooms: Development, Command Center, Testing Lab, Deployment Bay, Operations, Server/Data Room, Task Queue, Communications and Archive. Corridors connect them with routed walking.
- Primitives: colored squares for agents, a cylinder for the database, dots for tasks, triangles for issues, and envelopes for messages.
- Status drives placement and animation: coding at desks, testing in the lab, waiting in the queue, talking in Communications, errors shaking in place.
- Camera: drag or pinch to pan, wheel or pinch to zoom around the cursor, arrow keys, `+`/`-`, and Esc for the overview. "Go to…" focuses a room or follows an agent.
- Click anything to inspect it: agent, task, system, issue or room. Hovering shows a short tooltip.
- Dev simulation panel with the brief's scenarios: Claude codes, Codex tests, a message, test fail and pass, task completes, deploy begins and succeeds, many agents, queue, idle, system error and recovery, and a full tour.
- Persistence: camera and sim world survive refresh. Reset clears the sim.

## 8. Performance risks and mitigations

| Risk | Mitigation (in place unless noted) |
|---|---|
| Full-canvas redraw every frame | The loop runs only while something moves. Ambient idle animation is throttled to about 20fps. The loop stops when nothing changes and pauses when the tab is hidden. |
| Many entities | Uniform-grid spatial index (256px cells). Only the camera view plus a margin is queried and drawn. Picking uses the same index. |
| Text rendering cost | LOD: far zoom hides names and activity labels, and mid zoom hides secondary text. Labels claim screen space, so stacked agents don't overdraw. |
| Event storms | Store batching (one apply and notify per frame), dedupe by id, changed-key diffs so only touched entities re-sync, and capped log and message ring buffers. |
| High-DPR screens | DPR is capped at 2. |
| Memory growth | Seen-id set trimmed at 5000, log at 500 and messages at 50. Archived task dots are capped at 60. |
| Reduced motion | `prefers-reduced-motion` makes movement instant and turns off ambient animation. |
| Future: hundreds of animated sprites | Swap to the Pixi renderer (batched GPU sprites) behind the same interface. (Proposed, not built.) |

## 9. Migration path from placeholders to final artwork

1. **Now:** `placeholderSkin` draws everything from primitives. Each `draw` function receives the entity plus a clip name (`work`, `think`, `test`, `talk`, `walk`, `error`, `success`, …) and a clip start time.
2. **Skin registry:** a skin is a plain object with `background`, `corridors`, `room`, `agent`, `task`, `system`, `issue` and `effect`. Adding `skin-sprites.mjs` means loading an atlas and mapping clips to frame sequences. State, behavior, camera and scene don't change.
3. **Per-agent appearance:** `AGENT_REGISTERED.appearance` already exists (color today). It extends to `{sprite, palette}` for character art.
4. **Themes:** the Real and Fantasy looks from #34 become themes and skins, not new engines.
5. **Renderer upgrade (only if needed):** implement `createPixiRenderer` with the same `resize` and `draw` contract, and choose the renderer at boot.
6. **Room art:** layout rectangles and stations stay the coordinate system. Room art is drawn to match them, so art can land one room at a time.

## Phase 4: live from HQ (built)

- **Default decision** (proposed by Claude; Kyle hasn't decided): the World is a local HQ-side tool for now, not an `/admin/world` page in the app.
- **Flow:** `serve.mjs` → `GET /api/hq` → `adapters/hq-client.mjs` → `adapters/hq.mjs` → WorldStore.
  - The World server does HQ's local session handshake server-side and relays a trimmed snapshot. Task descriptions, evidence bodies and usage are dropped.
  - The browser never holds the HQ token. The route is GET-only and needs an exact loopback Host; cross-site requests are refused.
  - The page opens live when HQ answers (badge "LIVE: HQ", simulator hidden). Otherwise it falls back to simulation. `?source=sim` forces the simulator.
- **Translation** (`adapters/hq.mjs`, pure, tested):
  - The first poll, or any gap in HQ's sequence, rebuilds the World from HQ's snapshot. After that, each HQ journal event maps to World events with ids `hq-<event id>-<n>`, so redelivery is a no-op.
  - Agent status: HQ UNKNOWN is shown as offline (no evidence the agent is present). RATE_LIMITED is shown as waiting.
  - Tasks: DISPATCHED becomes started, and COMPLETED, FAILED and BLOCKED keep their meaning. RATE_LIMITED, PARKED and UNCERTAIN become blocked, and TASK_REQUEUED puts the task back in the queue.
  - Test counts come from HQ's own `"N passed; M failed"` summary.
  - HQ alerts become World issues. "Cycle complete" is not an issue.
- **Schema:** added `TASK_BLOCKED` and `TASK_QUEUED`, because HQ distinguishes "waiting on a person" from "failed".
- **Checked:** a real HQ from #34's branch was run in the container and a `verify-hq` task queued. The World showed the local verifier walk to the lab, test, and finish with 30 passed / 0 failed, with 0 rejected events and no console errors.

## Object-built World: full visual redesign (built, vertical slice)

Kyle's directive (2026-09-29, confirmed by Kyle): the concept images are reference only. Rebuild the presentation as a stylized 2.5D tycoon world made of independent scene objects, with no runtime background image. "Keep the brain, rebuild the body." Start with a vertical slice and do not expand until it proves the architecture.

What was kept (unchanged interfaces): events, `WorldStore`, the HQ adapter and LIVE vs DEV SIM separation, `behavior.mjs` placement, `WorldView` (state → places → paths), `motion.mjs`, `lift.mjs`, camera, scene, inspect, HUD. The only brain change: `PR_*` events keep `agentId` and `taskId` so the handoff folder knows whose work it is.

What was removed: the painted base plates and portrait crops (`art/`), the image-pixel theme files, `render/skin-art.mjs`, `render/scenery.mjs`, `render/character.mjs`, and the old primitives layout (`core/layout.mjs`). Kyle's two concept images are kept under `docs/world/concept/` as reference only; the server does not serve them.

Three layers, cleanly separated:

1. **Simulation data** (`world/building.mjs`). Pure data in plan coordinates `(x, z depth, floor)`: floors, rooms, walls with doorways, furniture footprints, wall decor, interaction points (pose sit/stand, facing, use), the nav graph, the elevator and the street.
2. **Layout** (`world/layout.mjs`). Projects the building into the layout interface the engine already used (locations, stations, doors, nav nodes, `route`, lifts, `locationAt`, task slots, system spots). Semantic rooms the slice has not built yet map through aliases (command → Lobby, comms → Break Room, archive/testing/servers → Engineering, deploy → roof).
3. **Rendering** (`render/iso-skin.mjs`, `props.mjs`, `figure.mjs`, `looks.mjs`). Draws every object procedurally. A skin is materials plus a look per agent; Realistic and Fantasy are skins over the same simulation, Blueprint is the debug view (rooms, walls, doors, footprints, nav edges, points with pose and facing, lift state, agent paths and states).

Decisions (proposed by Claude):

- **Projection: dollhouse cut-away oblique**, not true isometric: `screen x = x + 0.5z`, `screen y = base − floor·132 − 0.4z − h`. Stacked floors and the glass elevator stay readable, and every room's front is open like a tycoon game.
- **Depth:** per floor, a topological sort of objects whose screen bounds overlap (`engine/iso.mjs`, `depthSort`). Characters, furniture, walls, the lift car and street life share one pass. The lift car is clipped behind the floor slabs and draws its riders inside it.
- **Characters** (`render/figure.mjs`): procedural chibi figures with outlines, four facings, sitting and contact shadows. The same figure is dressed per skin: Claude engineer / dwarf builder, Codex inspector / cyborg, ChatGPT orchestrator / king, Qwen analyst / wizard, Gemma utility worker, Local Verifier (minor), Kyle (later). Unknown agents get a plain outfit in their registered colour.
- **Character controller** (`engine/iso-view.mjs`): a semantic `play(entity, state)` with idle, react, stand, sit, walk, carry, work, type, inspect, read, talk, meeting, blocked, waiting, celebrate, offline. `resolveState` is pure. On a new assignment a character reacts, stands up if seated, walks (riding the elevator if needed), sits or stands at the point, then works.
- **Truth rule (tested):** work, type, inspect and read play only for a productive activity, at the agent's assigned station, after arriving and not moving. Assigned is not working; riding the lift is not reviewing; idle, offline and unknown are never productive.
- **Navigation:** nodes, doorways, landing nodes on each floor and interaction points. Routes follow the graph (tested: no walkway crosses solid furniture). Idle agents in the Break Room drift between free spots every 18–48 s.
- **Elevator:** state is `currentFloor`, `targetFloor`, `doorState`, `occupants`, `moving`, `requestedFloors` (`Lift.status()`). The car holds its doors until the rider reports boarded or out, and never moves with doors open.
- **Room reactions come only from real state:** desk monitors light for the working agent, the code wall follows Engineering activity, the review console shows the last test run and one folder per open PR (unreviewed, then checked), the lobby task board shows real queued and blocked tasks, the rack LEDs follow the database system, the shelf shows real archived counts, and the crane and scaffold animate only while construction is real.
- **UI hidden:** press `h` to hide every panel and see only the world.

DEV SIM scenario "Claude builds, Codex reviews" (`sim/simulator.mjs`, `reviewJourney`): Claude, idle in the Break Room, is given a task, reacts, stands, walks, rides the elevator, sits at a workstation and types. A handoff folder appears on the review console, Codex rides up and inspects it, the review passes ("Review passed" chip, check-marked folder), and both go idle. A headless test drives this timeline and checks the state order.

Checked (observed, 2026-09-29, headless Chromium in the container):

- Background independence: 35 requests on load, 0 images; `/art/*` returns 404.
- LIVE HQ truth: against a local HQ test instance every agent HQ reports as UNKNOWN showed `offline`, the verifier `idle`, and none showed a productive state.
- About 55 fps in headless Chromium; no console errors in Realistic, Fantasy or Blueprint.

Not in the slice yet (proposed next): the remaining semantic rooms as real rooms (Command, Testing lab, Server room, Archive, Deploy), Kyle's character, sprite-quality art, construction stages mapped to task stages, lift batching, and day/night.

## Pass 2: truthful state and pass-by-pass construction (built)

Kyle approved the correction plan in issue #12 (comment 5895635191) on 2026-09-29 with "Keep / use existing / merge to main". Confirmed by Kyle: today's two-floor HQ is the V1 baseline; GitHub reads use the laptop's existing `gh` login; a pass is accepted when it merges to main.

**P0, truthful state (observed in code after this change).** Labels separate what the body is doing (`actionText`: "Walking to Engineering", "Riding the elevator") from the job's stage (`core/job.mjs`), and the status dot is green only while the body does productive work. Tasks keep an evidence list (commit, PR, tests, review, handoff, finding), an outcome, and agents keep `lastTask`. Failures carry the agent, task, failing checks and the next action as reported by the source. Meetings are clickable objects with topic, participants, decision, evidence and outcome, and idle or waiting no longer ends them. Simulator scenarios own their timers: starting one cancels an older one that drives the same agents, and says so. Snapshot events collapse into one "Loaded" feed line.

**P1, construction.**
- A pass is data: `world/passes/<id>.json` (`id`, `order`, `title`, `branch`, `pr`, `since`, `scope`, `structures[]` with a plan footprint and site points).
- `adapters/git.mjs` (server side, read-only) turns git and `gh` output into `PASS_PLANNED` and `PASS_EVIDENCE` events (branch, commit, pr, ci, review, merge). Event ids come from the evidence itself, so polling is idempotent. Commits map to agents by co-author trailer or author. Without `gh`, plans and commits still come from git; CI and reviews are simply absent (never guessed).
- `serve.mjs` journals the events append-only (`~/.hillink-world/construction.jsonl`) and serves them at `/api/construction` (same-origin, loopback).
- `core/construction.mjs` derives the stage from the whole evidence set: planned, claimed, implementing, testing, review, changes requested, rework, approved, accepted, and blocked (the latest commit's CI failed). One structural piece per commit; the final "active" piece only with the merge. Time moves nothing, and duplicate or out-of-order evidence gives the same result.
- The browser keeps these as sticky events (`WorldStore.keep`), so an HQ reconnect or snapshot reset never demolishes the building.
- `render/construction.mjs` draws the site from that state only: survey tape, slab, frame, beams, walls, glass, roof, fit-out boards, the lit sign once accepted, a test rig lamp that blinks only while CI runs, a stop sign when blocked (nothing is removed), a FIX/REWORK tag, an approval flag, and a plaque with the stage and counts.
- Builders: a new commit or review (from the last 20 minutes, not history on load) sends its agent, if free, to the site to assemble or inspect for a few seconds, then back. An agent doing its own work never leaves it; offline agents never walk.
- LIVE shows only real passes; simulation shows only the simulated pass ("Construction: next milestone", one milestone per click, no timers, labelled SIMULATED).

**Tests:** `tests/truth.test.mjs` (labels, continuity, failures, overlapping scenarios, meetings, history) and `tests/construction.test.mjs` (milestones, time, out-of-order evidence, blocked keeps work, rework, acceptance, sticky reset, journal reload, git adapter with fake git/gh, the simulated pass, builder visits).

## Phases (from the brief) and where this PR stops

| Phase | State |
|---|---|
| 1. World state and event schema | Done |
| 2. Rooms, navigation and camera | Done |
| 3. Agents, placement, movement and clips | Done: animated procedural characters, lift rides, handoffs and meetings |
| 4. Real data adapter (HQ) | Done: live from HQ via a read-only feed |
| 5. Interaction: inspect, focus and follow | Done |
| 6. Art skin | Rebuilt: object-built 2.5D vertical slice, Realistic and Fantasy skins over one simulation, no background image |
| 7. Polish: sound, weather, day/night, ambient life | Ambient life and animation built (see Animation layer); sound, weather and day/night not started |
| 8. In-app hosting | Not started. Unresolved question above. |

## Open questions

- **Unresolved:** should the World be internal to HQ only, or also an `/admin/world` page in the app (Phase 8)?
- **Confirmed by Kyle (2026-09-29):** art direction is a stylized 2.5D tycoon world built from objects, with Realistic and Fantasy skins.
- **Proposed:** Phase 4 serves the World from HQ's origin with a read-only feed, rather than opening HQ to cross-origin reads.
