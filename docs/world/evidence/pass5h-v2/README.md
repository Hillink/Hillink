# Pass 5H: px renderer V2 integration evidence

The px renderer (`?art=px`) now draws live canonical state rather than a static slice: construction projects at their
canonical stage, agent status, and content it has never seen. Nothing new simulates anything. Every World below comes from
`createWorld`, `placeCapability` or the HQ contract (`procgen/contract.mjs` `applyHqEvent`). The renderer only reads it.

## How to regenerate

```
cd tools/hillink-world
node scripts/px-harness.mjs ../../docs/world/evidence/pass5h-v2 --v2
```

The command writes the PNGs and `manifest.json`. The `v2` section of the manifest is `v2Evidence()` from
`scripts/px-harness.mjs`, plus one image record per shot (`file`, pixel `hash`, and `live`, the rooms whose screens
the frame switched on). Runs are deterministic, so the same inputs always give the same hashes.

Not committed yet: these PNGs were not rendered in the implementation sandbox, because it has no shell. The acceptance
test `tools/hillink-world/tests/px-integration.test.mjs` runs the same `v2Evidence()` records.

## What the manifest records

| Section | What it shows | Source of truth |
|---|---|---|
| `themes` | One World (T0 plus the drone lab at the exterior stage) composed in Real and Fantasy. Walls, props, rooms, construction pieces, sites and every agent's rule placement are identical (`identical: true`). Only the material hashes differ | `createWorld` + HQ events |
| `procgen` | A real `placeCapability` call (the planner's add-wing), before and after, in both themes. It lists the rooms and props it added | planner |
| `construction.stages` | The drone lab driven by HQ events through planning, site preparation, foundation, structure, exterior, systems, furnishing and inspection. Each stage has its canonical label, its pieces and a pixel hash per theme | `world.projects[...].stage` |
| `construction.gates` | The same project blocked (barrier) and waiting for Kyle (sign) | project gates |
| `agents` | For every agent in both themes (the three founders and one unknown agent): the clip each canonical status plays, its sprite hash, and whether that clip may light screens (`working` only) | `agentStatusOf` |
| `generic` | A built capability of an unknown kind with traits only (`signal-garden`). It records the canonical name (from `world.capabilities`), the derived room kind, props in both themes, and the unknown agent working in the World through the fallback look | planner + fallbacks |
| `images` | `v2-construction-<stage>-<theme>.png`, `v2-gate-<gate>-<theme>.png`, `v2-generic-<theme>.png`, `v2-status-<status>-<theme>.png` | full renders |

## V2 follow-up fixes

- Site labels: an agent's spot is `<location id>:<station id>`, and both contain colons on construction sites
  (`site:drone-lab:site:drone-lab:build1`). The details card split the spot at the first colon, so it found no location
  and showed no site label. `skin.mjs` `locationOfSpot` now looks the whole spot up in `layout.stationInfo` (falling
  back to the longest location id that prefixes it), and `spotLabelOf` gives the canonical room or site label.
- Status precedence: `agentStatusOf` treats a resolved controller state (else a resolved intent) as authoritative,
  explicit `idle` included. The productive activity fallback (for example `coding` to `working`) applies only when
  neither is present. Movement and canonical blocked or waiting facts still come first. The harness passes no state when
  placement only substituted an `idle` clip, so its recorded statuses are unchanged.
- Regression coverage: `px-integration.test.mjs` checks both fixes. It also checks screen gating one screen at a time
  through `stage.screens` (each screen's room, on/off state and sprite box) and per-screen pixel crops, not whole-frame
  hashes.
