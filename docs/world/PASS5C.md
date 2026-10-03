# Pass 5C: animation modernization

Status: **built by Claude** on branch `claude/world-pass5c`, from the closed Pass 5B head (`e6dc9aa`). This pass is about motion, not the graphical overhaul (5D). Nothing is merged or deployed. Pass 5D has not started.

The old World already moved: agents walked, sat, rode the lift and built, and cars drove. 5C makes that same movement continuous and readable:
- characters now accelerate, brake, round corners and turn through their facings;
- they face what they use before sitting;
- they blend between poses;
- construction shows a different job for each real stage;
- cars turn with the road;
- the world keeps moving around idle characters (wind, clouds, a flag, machinery, visitors).

Evidence: continuous videos in [`docs/world/evidence/pass5c/`](evidence/pass5c/), including a side-by-side 5B vs 5C comparison of the same scenario. Tests: `tools/hillink-world/tests/pass5c.test.mjs`.

## 1. Architecture: simulation state → animation intent → rendered animation

```
 HQ truth + World state            engine/animation.mjs                  render/rigs.mjs + render/figure.mjs
 (activity, truth.state, place,  ─►  intentOf(): one of 14 INTENTS   ─►   rig.dress(): clip + props for one visual
  motion, project stage)              + variant (e.g. the build stage)     identity; drawFigure() draws the clip,
 engine/iso-view.mjs resolveState()   setClip(): remembers the previous    blending from the previous one
   → the body clip                    clip for blending (BLEND_MS)
```

- **Intents** (`INTENTS`): idle, walking, working, building, investigating, testing, reviewing, meeting, waiting, blocked, onBreak, attention, recovering, completed. Each one pictures canonical state:
  - productive intents only follow a productive body clip, which the controller plays only for a verified activity, at the assigned station, after arriving;
  - waiting, blocked, attention and recovering come from HQ truth (`core/truth.mjs`) or the task's own status;
  - building takes its variant from the project's real stage.
- **Rigs** map an intent and variant to what one identity draws. Real builders use a hammer, shovel, roller, wrench and crate. Fantasy uses a mallet, spade, brush, rune staff and scroll for the same canonical stages. A sprite sheet or 3D character only needs a new rig; no behaviour changes.
- **Blending.** `drawFigure` computes a pose (hands, held prop, crouch, lean) per clip and interpolates from the previous clip's pose over 280 ms, so poses no longer switch abruptly.

## 2. Locomotion (`engine/motion.mjs`, `world/generated-layout.mjs`)

- **Routes shaped for walking.** The graph path follows the furnishing grid, so a diagonal crossing used to be a staircase of little L-steps. It is now string-pulled: a run of points inside one space becomes a straight stretch wherever that stretch is checked clear on the walk grid. Doors, lift landings and storey changes always stay. Remaining corners are rounded with a short curve, but only where the curve is also checked clear. Sharp turns (over 60°) fell from about 12.7 to 1.7 per route. Every route still passes the 5B wall and furniture checks.
- **Momentum.** Speed ramps up from a standstill (0.38 s to full pace) and brakes into the destination, lift call points and sharp corners (0.42 s to a stop). Corners are taken more slowly the sharper they are. `gaitAmount` scales the stride and arm swing with speed.
- **Heading.** The heading turns toward the direction of travel at a limited rate (11 rad/s). The four drawn facings follow the smoothed heading, so a character turns *through* its directions and never flips to the opposite one.
- **Arrival.** On arrival the character turns to face what the station is for (desk, printer, console, seat), then sits if it is a seat, then works. The sitting and standing beats from 5B remain.
- **Lifts.** A character waits facing the car, steps in at a careful pace, rides, then steps out onto the landing.
- **Camera follow** is frame-rate independent (the same glide at 30 or 144 fps).

## 3. Construction activity (truthful)

| Canonical stage | Builder clip (Real / Fantasy prop) | Site loop |
|---|---|---|
| site preparation | measure (tablet / scroll), pointing out the site | fetches materials from the site entrance |
| foundation | dig (shovel / spade), crouching into it | |
| structure | assemble (hammer / mallet) | |
| exterior | paint (roller / brush) | |
| systems, or repair after a rejected review | install (wrench / rune staff), crouched | |
| furnishing | lift (crate) | carries furniture in from the entrance |
| inspection | builders pause; the inspector surveys (tablet) | the inspector walks the site's points |

- A crane (swinging jib, rising load) and a mixer (turning drum) move **only while `buildersWork(project)` is true**. Blocked or waiting sites, and sites under inspection, stand still.
- Stages advance only from canonical facts, never from animation timers. Loops repeat while a stage is active, and they start only from the builder's assigned station. They end the moment the builder's place changes, which happens when HQ blocks, pauses or finishes the project.

## 4. Traffic, environment, ambient people

- **Vehicles** (`engine/ambience.mjs`, `render/site-skin.mjs`):
  - road bends are rounded, and cars slow into them;
  - heading is interpolated;
  - a car is an oriented box, so it no longer snaps between two axis-aligned shapes;
  - cars fade in and out at the map edge;
  - stopping trips brake and pull away;
  - brake and tail lights are drawn.
- **Environment layer** (`engine/environment.mjs`): wind with gusts rolling across the map (trees; the crown sways more than the base), a flag by each entrance, drifting cloud shadows, and site machinery. All of it is pure functions of time, evaluated only for what is on screen.
- **Ambient people** (`engine/npcs.mjs`): a few deterministic visitors.
  - Their loop is to arrive, walk to a public spot (a lobby seat, the break room, coffee, outside), turn, sit, stay, move on, and eventually leave.
  - Each is staggered by a hash, so they never move in lockstep, and they use the same locomotion and checked routes as agents.
  - **They are never agents.** They use only resting or waiting spots, never a desk, console, printer, rack or site. They give way to agents, have no name or badge, are not in the roster, and never count toward a room being in use.

## 5. Truthfulness

Animation invents atmosphere only: gestures, stride, visitors, wind, clouds, traffic and machinery motion. It never makes an agent look productive, and it never advances or stops construction; the machinery stands still with the site. Tests assert the following:
- intents come only from the canonical state they picture;
- productive intents never appear away from the assigned station;
- construction clips follow the real stage;
- blocked or waiting sites have no builders and no moving machinery;
- visitors never take an agent's spot or a working station.

## 6. Watchable scenarios (simulation only, labelled SIMULATION)

- `?play=office`, `?play=workstation` and `?play=meeting` loop a scripted sequence of simulated events.
- `?demo=construction&autoplay=<seconds>` steps the construction demo on its own.
- None of them runs against live HQ.

## 7. Performance

Simulation stepping measured in Node: 0.03 ms per frame with 4 ambient people, 0.09 ms with 40, and 0.18 ms with 200. Traffic costs microseconds.
- Environmental motion is computed while drawing, only for the pieces already culled to the screen.
- Idle frames are throttled to about 30 fps, as before.
- Route shaping costs a few checked segments, once per trip.

## 8. Deferred to 5D (visual quality) and later

- Figure art is still the procedural 2.5D character. The walk cycle, poses and props are better timed, but not re-drawn.
- There are no door leaves (doors are openings). Stairs are drawn but not walked (routes use the elevator).
- Tools are held as props; there is no inverse kinematics.
- Lighting, shadows, materials, vegetation and terrain are unchanged (5D).
- Traffic has no interaction between cars (no queueing or overtaking), by design ("not GTA").
- Meetings keep 5B's architecture. The team walks there, sits, meets, stands and leaves, but live HQ cannot yet start a meeting (5B/5C deferral).
