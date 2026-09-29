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

**Animation:** Realistic and Fantasy run an animation layer over the painted art. It includes water, the crane, lifts, traffic, screens, lights and staff. Agents are animated characters that walk and ride the lift to where their real work is. Rooms react only to real work. A theme's scenery lives in `themes/*-scenery.mjs`, in image pixels. See "Animation layer" in the architecture doc. With `prefers-reduced-motion`, the world holds still.

Try it in simulation: in "Dev simulation", use Claude starts coding, Claude messages Codex (the handoff), Start a meeting, and Needs Kyle.
