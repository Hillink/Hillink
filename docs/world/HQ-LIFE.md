# Living HQ pass

Branch `claude/world-hq-life` (from Pass 5D-A `1fdaf25`). Nothing merged or deployed.

## Extension point

This pass adds a behaviour layer on top of the existing pipeline. It does not rewrite any visuals. The pipeline is: simulation state, then `resolveState` (engine/iso-view.mjs), then `intentOf` (engine/animation.mjs), then the rigs, then the figure.

- **Journeys.** They live in a new pure module, `engine/journey.mjs`. `IsoWorldView.goTo` runs them as legs before the agent's canonical destination.
- **Fixtures.** The places journeys visit (the task board and the archive) come from the generated layout: `layout.fixtures`.
- **Idle variety.** It lives in `resolveState`'s idle branch.
- **Station reactions.** They are drawn by the 5D-A furniture from a few new frame facts: `stationState`, `busyUse` and `rushing`.
- **Refit sites.** They are added in `generated-layout.mjs`, next to the existing construction-site code, and drawn in `render/art5d/skin.mjs`.

## What changed

**Journeys, from real transitions only.**
- **Start** (idle or waiting to productive, with a task): the agent walks to the lobby task board, picks the task up, carries it to the workstation, sets it down and types.
- **Finish** (completed, then released with outcome `done`): the agent carries the task to the archive shelf, files it, then goes to the break room.
- **Block** (productive to waiting, with outcome `blocked`): a frustrated beat at the desk, whose screen turns red, then the agent walks to the waiting area.
- A new real change cancels a journey in progress. A rebuild or a first sighting never starts one.

**Idle life, only while the agent is truly idle and at rest.**
- Checking a phone when seated, stretching when standing.
- Chatting: two idle agents at rest in the same room turn to face each other and talk. The chat ends the moment either one leaves.
- Waiting agents glance at the time now and then.

**Readability.**
- A coloured ring at the agent's feet shows its state:
  - green: working;
  - blue: travelling with a task;
  - amber: waiting;
  - red, pulsing: blocked;
  - done: completed;
  - no ring when idle.
- Below zoom 0.95 an agent shows only a status pip. Closer in, it shows a compact name chip. The status line appears only on hover or selection.

**Workstations react to real occupancy.**
- Desk monitors glow, spill light and flicker the keyboard while the agent at them is working. They turn red during the blocked beat.
- The printer feeds a sheet and the coffee machine steams while someone is at them.
- Server LEDs race while a test run, deploy or build is running.
- The review console strip shows the last real test state.
- The meeting table glows during a meeting.

**Room identity.**
- Lounge and meeting rugs, a corridor runner and a lobby inlay.
- Accent light for the server room, lounge, test lab and meeting room.
- Wall lettering on tall back walls.
- The task board stands freestanding in the lobby again.

**Refit construction.** Before this pass, a capability that the planner puts into an existing room showed no construction at all.
- The room now becomes a refit site (`site:<project>`, `refit: true`), with builder and inspector stations on the room's own walk grid, entered through its own door.
- It is drawn stage by stage from the project's canonical stage:
  - drop cloths and tape;
  - crates and a ladder;
  - a stud frame;
  - partition panels, with a paint stripe going on;
  - cable reels and conduit;
  - crated furniture;
  - glass and installed furniture, with an inspection clipboard.
- Blocked or waiting work shows a barrier, and builders are not sent.
- The room keeps its previous purpose until the capability completes (the 5B finding 4 invariant still holds).
- `?demo=refit` runs this with a simulated focus booth, which the planner places in room-2. `?demo=construction` is unchanged.

## Real state versus cosmetic

**Real-state-driven:**
- Journeys: which journey runs, and when.
- Carrying a task.
- Desk, printer and coffee reactions: driven by the agent actually at that station and its state.
- Server LED speed: running test runs, deploys and builds.
- Review console: the last test state.
- Meeting table glow.
- Ring and pip colour: canonical activity and intent.
- Refit sites: placement, stage, blocked, waiting, completion; builders are sent only when `buildersWork`.
- Task board contents.

**Cosmetic:**
- Timing and choice of idle variants: deterministic per agent, and only while idle.
- What a chat looks like. Who chats comes from real idleness and proximity.
- The waiting glance.
- Beat durations: pickup 1.3 s, file 1.4 s, frustrated 1.8 s.
- The water cooler bubble.
- Room rugs, inlays, lettering and accent lights.
- The exact geometry of the refit zone: the capability's area in the room's back corner, chosen by the art layer. The planner does not own a sub-rectangle.

## Tests

- New file `tests/hq-life.test.mjs` with 7 tests:
  - the transition truth table and journey plans;
  - the fixtures are reachable on clean routes from every station;
  - the start journey order (board, pickup, carry, desk, set down, type), and no journey for an unchanged agent;
  - finish files at the archive, and block shows the frustrated beat first, then waiting;
  - idle variety and chat only while idle, and a chat partner is always idle and at rest;
  - state and label level-of-detail mapping;
  - refit: no new structure, the room keeps its purpose until complete, over 100 clean routes, builders never sent while HQ stops the work, and the room takes on its new purpose after completion.
- Full World suite: **151/151 pass**, with no existing test changed.

## Evidence (`docs/world/evidence/hq-life/`)

Every shot and clip is gated fail-closed by `until`/`expect` on real World state; see `notes.json` and `video-notes.json`.

- **Screenshots:**
  - 01: zoomed out, pips only;
  - 02: working at the desk (ring, screen);
  - 03: pickup at the board;
  - 04: carrying the task to the desk;
  - 05: blocked (red screen and ring);
  - 06: filing at the archive;
  - 07: idle life in the lounge;
  - 08: refit, walls going up;
  - 09: refit, blocked with a barrier;
  - 10: refit, inspection;
  - 11: room identity overview.
- **Videos:**
  - 1: task lifecycle, from board to desk to archive, 80 s;
  - 2: blocked task, 60 s;
  - 3: idle life, 40 s;
  - 4: the full refit demo, 88 s.

## Incomplete or limits

- Room-2 sits behind the staircase, so part of the refit is hidden at the fixed iso angle.
- Journeys cover start, finish and block only. Switching between productive activities (for example coding to testing) and review handoffs still go directly, as in 5C.
- Rings, pips and refit visuals exist only in the 5D art layer (`?art=5d`). The default renderer has the journeys and poses but not the new overlays.
- There is no wall clock and there are no idle monitor screensavers.
- This was not exercised against live HQ, because HQ on 4312 was offline. The live viewer on 4340 has been restarted with this code.
