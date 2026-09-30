# Hillink World

A visual engine that shows Hillink's agents and systems as a living map. Design and roadmap: [`docs/world/ARCHITECTURE.md`](../../docs/world/ARCHITECTURE.md). Kyle's brief: [`docs/world/BRIEF.md`](../../docs/world/BRIEF.md).

```sh
npm run world          # http://127.0.0.1:4320 (WORLD_PORT to change)
npm run test:world     # engine tests (node:test, no browser)
```

**Live:** if Hillink HQ is running (`HQ_URL`, default http://127.0.0.1:4312), the World shows HQ's real agents and tasks. The badge reads LIVE: HQ. `WORLD_HQ=0` turns this off.

**Truthful state:** each live agent's state (Working, Starting, Idle, Waiting, Needs attention, Failed, Offline, Not connected, Unknown) is derived from HQ's runtime facts in `core/truth.mjs`, and the body may only animate work while HQ reports a real, acknowledged run. If HQ stops answering, agents show Unknown rather than their last pose. Click an agent to see its state and the reason; `hillinkWorld.why('claude')` in the console shows the full trace.

**Commands (one real loop):** click Claude, type a question and press "Send to HQ". The World server turns it into one HQ `review-repo` task (read-only: the Claude CLI gets Read, Grep and Glob only) through HQ's own API. It is the only thing the World writes. Claude shows Working only once HQ confirms the run started, and the answer appears under the command. History is kept in `~/.hillink-world/commands.jsonl`.

**Construction:** each development pass is a building project on the plaza. The World server reads the local git clone and the `gh` CLI (your existing login) for plans in `tools/hillink-world/world/passes/*.json`, commits, CI, reviews and the merge, and journals that evidence in `~/.hillink-world/construction.jsonl` (`WORLD_STATE_DIR` to move it) so a reload or restart keeps what was built. The only network command is `git fetch`. A pass advances only on that evidence, never on time, and is accepted when it merges to main. It shows in LIVE mode only. `WORLD_GIT=0` turns it off; `WORLD_GIT_INTERVAL_MS` sets the poll (default 60000). Click the site for its stage, blockers and evidence. In simulation, "Construction: next milestone" walks a clearly labelled simulated pass one milestone per click.

**Simulation:** without HQ, or with `?source=sim`, the World uses the dev simulator. Open "Dev simulation" to play scenarios. Simulated events are tagged `sim`, never mix with live data, and never touch Hillink data.

Styles: **Realistic**, **Fantasy** and **Blueprint** (toggle in the header, or `?theme=fantasy`). All three show the same World state.

Controls: drag to pan, scroll or pinch to zoom, click to inspect, arrow keys, `+`/`-`, and Esc for the overview. Use "Go to…" to focus a room or follow an agent.

**Scale (Pass 2):** one reference person sets every size. `world/scale.mjs` holds the agent (height 50 units, footprint, walk speed), architecture (storey, doors, elevator), street (cars, lanes) and furniture sizes with their seat and surface heights. Furniture takes its size from its type, and interaction spots are anchors derived from the furniture they use. Movement is measured on the floor, so zoom never changes pace or proportions.

**The world:** Hillink HQ is built from objects (no background image): a Break Room, Lobby, glass elevator, Engineering and the street outside, drawn in a 2.5D cut-away. The building is data in `world/building.mjs`; skins only change materials and outfits. Agents walk, ride the elevator, sit and work only where their real work is. See "Object-built World" in the architecture doc. With `prefers-reduced-motion`, the world holds still. Press `h` to hide the panels.

Try it in simulation: in "Dev simulation", use Claude builds, Codex reviews, Claude starts coding, Claude messages Codex (the handoff), Start a meeting, and Needs Kyle.
