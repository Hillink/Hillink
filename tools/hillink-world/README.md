# Hillink World

A visual engine that shows Hillink's agents and systems as a living map. Design and roadmap: [`docs/world/ARCHITECTURE.md`](../../docs/world/ARCHITECTURE.md). Kyle's brief: [`docs/world/BRIEF.md`](../../docs/world/BRIEF.md).

```sh
npm run world          # http://127.0.0.1:4320 (WORLD_PORT to change)
npm run test:world     # engine tests (node:test, no browser)
```

**Live:** if Hillink HQ is running (`HQ_URL`, default http://127.0.0.1:4312), the World shows HQ's real agents and tasks. The badge reads LIVE: HQ. HQ is only read, never written. `WORLD_HQ=0` turns this off.

**Simulation:** without HQ, or with `?source=sim`, the World uses the dev simulator. Open "Dev simulation" to play scenarios. Simulated events are tagged `sim`, never mix with live data, and never touch Hillink data.

Styles: **Realistic**, **Fantasy** and **Blueprint** (toggle in the header, or `?theme=fantasy`). All three show the same World state.

Controls: drag to pan, scroll or pinch to zoom, click to inspect, arrow keys, `+`/`-`, and Esc for the overview. Use "Go to…" to focus a room or follow an agent.

**The world:** Hillink HQ is built from objects (no background image): a Break Room, Lobby, glass elevator, Engineering and the street outside, drawn in a 2.5D cut-away. The building is data in `world/building.mjs`; skins only change materials and outfits. Agents walk, ride the elevator, sit and work only where their real work is. See "Object-built World" in the architecture doc. With `prefers-reduced-motion`, the world holds still. Press `h` to hide the panels.

Try it in simulation: in "Dev simulation", use Claude builds, Codex reviews, Claude starts coding, Claude messages Codex (the handoff), Start a meeting, and Needs Kyle.
