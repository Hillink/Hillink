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
  core/        events.mjs, state.mjs, layout.mjs (rooms, stations, nav graph, routing), behavior.mjs (activity → place/clip)
  engine/      camera.mjs, scene.mjs (entities + spatial grid), motion.mjs (paths, effects), world-view.mjs (state → scene)
  render/      canvas2d.mjs (renderer), skin-placeholder.mjs (primitives, themes)
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

## Realistic and Fantasy themes (confirmed by Kyle: "We want a toggle for fantasy world or realistic world", 2026-09-29)

- Kyle shared two concept images, a night-time HQ tower (Realistic) and a fantasy realm (Fantasy). The header toggle switches between Realistic, Fantasy and Blueprint (the primitives view). The choice is remembered per browser.
- **Themes are data.** `themes/real.mjs` and `themes/fantasy.mjs` place the same nine semantic locations (plus a Realistic-only Break Room for idle agents) onto rooms painted in each image. Each theme also defines its walkways, task slots, system beacons and signal badges. Tests check that every theme has every location, and that every station and route resolves.
- **Interim art is Kyle's concept images** (`art/*.jpg`). They are cropped to remove the mock HUD, and any mock panel left inside the scene is hazed out. Portraits for agent tokens and the roster are cropped from the same images.
- **Real activity only:**
  - The Fantasy image's painted name cards ("Builder (Dwarf)…") are covered at runtime by live plaques. Each plaque shows the bound agent's real status, or "No agent connected".
  - The painted people are scenery. Live agents are the portrait tokens.
  - The HUD shows no cost or usage numbers, because no source reports them yet.
- **Proposed:** which persona each agent gets (Claude = Builder (Dwarf) and the Claude portrait; Codex = Inspector (Cyborg) and the Codex portrait). These pairings are data in the theme files.
- **Next for art:** replace the concept images with clean layered art (backdrop without baked labels, plus character sprite sheets with walk and work clips). The theme files keep their coordinates if the new art keeps the composition.

## Phases (from the brief) and where this PR stops

| Phase | State |
|---|---|
| 1. World state and event schema | Done |
| 2. Rooms, navigation and camera | Done |
| 3. Agents, placement, movement and clips | Done, with primitives |
| 4. Real data adapter (HQ) | Done: live from HQ via a read-only feed |
| 5. Interaction: inspect, focus and follow | Done |
| 6. Art skin | Started: Realistic and Fantasy themes on Kyle's concept art, with live plaques and portrait tokens |
| 7. Polish: sound, weather, day/night, ambient life | Not started |
| 8. In-app hosting | Not started. Unresolved question above. |

## Open questions

- **Unresolved:** should the World be internal to HQ only, or also an `/admin/world` page in the app (Phase 8)?
- **Unresolved:** is there a preferred art direction (pixel, isometric, flat) before Phase 6 starts? The engine doesn't depend on the answer.
- **Proposed:** Phase 4 serves the World from HQ's origin with a read-only feed, rather than opening HQ to cross-origin reads.
