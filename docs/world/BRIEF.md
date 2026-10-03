# Hillink World / HQ — Visual System Brief

Status: **confirmed by Kyle** (project chat, 2026-09-29 03:49Z). Transcribed faithfully for agents that can't read the project chat. It supersedes the earlier HQ World card/SVG visuals (draft #34). The truth rules in the locked HQ spec (#12 comment 5877991295) still apply.

Hillink backend = reality. Hillink World = the visual representation of that reality. The existing app, database, APIs, agents, jobs and business logic stay the underlying systems; the World is a new presentation layer on top. Do not approach it as "make the existing dashboard look cooler."

## 1. Clean visual architecture
It is a dedicated World/HQ system, not a set of dashboard components. It separates world state, application state, rendering, animation, agent state, interaction, camera, UI overlays and backend events. The visual layer is replaceable without affecting business logic, and backend changes must not require rewriting the renderer. An adapter/state layer sits between the two:

Hillink systems / DB / agents → World event + state adapter → World state → Renderer → Animations / characters / buildings / effects → User

Visual components never query backend systems directly.

## 2. Primitives first
Build the world itself before any art:
- coordinate system, world boundaries, camera, zoom and pan
- object placement, layering and depth, collision if needed
- selectable objects, with hover and click states
- animation system, entity registry and event system

Use placeholder geometry: Claude and Codex are colored squares, HQ is a rectangle, the database is a cylinder, tasks are dots. Function comes before artwork.

## 3. Data-driven world state
Nothing is hardcoded like "Claude walks to computer." The underlying system emits semantic states, and the renderer decides how each one looks.
- **Agent state:** id, name, type, currentTask, status, location, targetLocation, progress, activity, lastEvent.
- **Statuses:** idle, thinking, coding, researching, testing, reviewing, communicating, waiting, completed, error.
- **How statuses look:**
  - CODING: the agent goes to its workstation, types, its monitor is active and a task label appears.
  - TESTING: the agent goes to the testing area, test equipment activates and progress shows.
  - COMMUNICATING: the agents approach each other, or a communication animation plays.
  - IDLE: subtle idle behavior.

## 4. Represent real activity
Never fake activity to look busy. Show reviewing, working, waiting and calm exactly as they really are. Ambient animation can be fictional: walking, screens, lights, machinery, particles, idle animations. Work and status information cannot be fictional.

## 5. World event system
Semantic events update World State. The renderer never needs to understand GitHub, Supabase and so on. Events:

`TASK_CREATED` `TASK_STARTED` `TASK_PROGRESS` `TASK_COMPLETED` · `AGENT_STARTED_WORK` `AGENT_IDLE` `AGENT_REVIEWING` `AGENT_TESTING` `AGENT_WAITING` · `PR_CREATED` `PR_REVIEWED` `PR_MERGED` · `BUILD_STARTED` `BUILD_SUCCESS` `BUILD_FAILED` · `DEPLOY_STARTED` `DEPLOY_SUCCESS` `DEPLOY_FAILED` · `ISSUE_FOUND` `ISSUE_RESOLVED` · `AGENT_MESSAGE`

## 6. Visual language
Each category has a consistent representation:

| Activity | Shown as |
|---|---|
| Agent work | Workstation activity |
| Testing | Lab or testing station |
| Database | Server or data room |
| Deployments | Deployment or build area |
| Communication | Characters meeting, or a message animation |
| Completed work | The object moves into a completed state |
| Errors | A localized warning |
| Queued tasks | A visible queue or staging area |

Don't cover the screen with text. The environment communicates, and text gives detail on request.

## 7. Characters
Eventually Claude, Codex and future agents become animated characters. Each has an identity, a sprite or model, and idle, walking, working, thinking, communicating, success and error/confusion animations. Character visuals stay separate from agent logic: logic says `status = TESTING`, and the character system plays the testing animation and moves to the station.

## 8. Meaningful locations
Each location maps to a real system:

| Location | Represents |
|---|---|
| Command Center | Overall status |
| Development Area | Claude and Codex engineering |
| Testing Lab | Tests, simulations, QA, security testing |
| Server/Data Room | Supabase and the backend |
| Communications Room | Agent-to-agent communication and integrations |
| Operations Room | Live platform activity |
| Analytics Room | Platform metrics |
| Deployment Bay | Builds and releases |
| Archive/Knowledge Area | Documentation and history |

## 9. Camera
The camera supports pan, zoom and smooth transitions, focusing on an agent, a task or a room, and returning to the overview. The architecture must allow later commands like "Show me what Codex is doing", "Where is the problem?" and "Show the whole company."

## 10. Interaction
Objects can be inspected:
- **An agent:** status, task and progress.
- **A workstation:** current task, files, agent, elapsed time and recent events.
- **The testing area:** tests running, passed and failed, and issues found.
- **The server room:** database health, requests, jobs and status.

The World is another interface into Hillink, not decoration.

## 11. Information density
It is not a SaaS dashboard floating over a game. The default view is visual. Information appears in context: hover, click, small labels, status indicators, contextual panels and notifications. You can sit back and watch Hillink operate, then inspect what interests you.

## 12. Art direction
The architecture is not coupled to one style. The likely final look is polished 2D/2.5D: a miniature headquarters that is slightly stylized, clean, modern, playful without being childish, strongly animated and readable at every zoom level. Build the engine first.

## 13. Performance
Design for:
- many entities and many simultaneous animations
- event batching, animation throttling and offscreen culling
- efficient rendering
- reduced-motion mode
- pausing in the background

Never rerender the whole world because one agent's progress changed.

## 14. Persistence
Important world state survives refreshes: agent positions, room configuration, current tasks, system states, completed structures and camera preferences. Ephemeral animation does not. Backend truth always overrides stale visual state.

## 15. Development order
1. **World Engine:** a dedicated World route or environment with world coordinates, camera, renderer, entity registry, object placement, selection, basic animation and a world-state store, using ugly placeholders.
2. **Agent Simulation:** Claude and Codex placeholders fed simulated states (idle, working, testing, communicating, completed). Verify that state changes cause movement and animation.
3. **Environment:** the first HQ layout with Command Center, Development, Testing, Servers and Operations. Structure over art.
4. **Real Data Adapter:** real task, test, agent status and completion events become World events.
5. **Character System:** animated characters replace the placeholders.
6. **Environmental Art:** polished rooms and objects.
7. **Interaction:** detailed inspection, contextual panels, camera focus and task history.
8. **Polish:** lighting, particles, transitions, ambient animation, sound if appropriate, microinteractions and performance.

## 16. Dev / simulation mode
Trigger any scenario without waiting for real events: Claude starts coding, Codex starts testing, Claude messages Codex, a test fails or succeeds, a task completes, a deployment begins or succeeds, several agents work at once, an agent goes idle, a system error occurs. Simulation mode must **never** alter production Hillink data.

## 17. Many agents
The design is not built around exactly two characters. Engineering, sales, support, research, marketing, security, operations and other specialized agents may follow.

## 18. World expansion
Coordinates and architecture must allow new rooms, floors, buildings, departments, external locations, the athlete and business ecosystems, the marketplace, events, data infrastructure and special projects. Don't build these now, but don't prevent them.

## 19. Most important rule
Don't start pretty. Build a clean visual engine that can represent Hillink's actual state, in the order DATA → STATE → WORLD → MOVEMENT → INTERACTION → ART → POLISH. Never go art → hardcoded animations → hacks to connect real systems later. The World should become a major interface into the whole company: watch agents work, see systems operating, inspect tasks, watch builds and tests, find problems and navigate Hillink spatially.

## Kyle's requested first step
Inspect the current architecture, then propose:
1. the World architecture
2. the renderer and technology
3. the state model
4. the event schema
5. the folder and module structure
6. the integration boundaries
7. the first minimal interactive prototype
8. the performance risks
9. the migration path from placeholders to art

Then begin implementation from that foundation. See `ARCHITECTURE.md`.
