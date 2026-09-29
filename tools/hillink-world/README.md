# Hillink World

A visual engine that shows Hillink's agents and systems as a living map. Design and roadmap: [`docs/world/ARCHITECTURE.md`](../../docs/world/ARCHITECTURE.md). Kyle's brief: [`docs/world/BRIEF.md`](../../docs/world/BRIEF.md).

```sh
npm run world          # http://127.0.0.1:4320 (WORLD_PORT to change)
npm run test:world     # engine tests (node:test, no browser)
```

Today it runs in **simulation mode only**. Open "Dev simulation" to play scenarios. Simulated events are tagged `sim` and never read or write Hillink data. The first real feed is the HQ adapter (Phase 4).

Controls: drag to pan, scroll or pinch to zoom, click to inspect, arrow keys, `+`/`-`, and Esc for the overview. Use "Go to…" to focus a room or follow an agent.
