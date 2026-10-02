# Pass 5D-A: Real World visual prototype (art-direction checkpoint)

Status: **built by Claude** on branch `claude/world-pass5d`, from the accepted Pass 5C head (`2690cf9`).

This is a **prototype, not propagated**:
- It is an opt-in art layer: `?art=5d` on the Realistic theme. The default renderer and Fantasy are unchanged.
- **5D-B and Fantasy have not started.**
- Nothing is merged or deployed.

It renders the real running World: the generated HQ, its entrance and road, landscaping, agents, visitors and traffic. Every generated structure it draws from is unchanged, as are navigation, interaction anchors, construction truth, 5C animation, and the separation between live and simulated data.

## The proposed art direction

A polished, stylized management-sim look in clean daylight:
- cool, neutral architecture;
- natural greenery;
- a single Hillink-blue accent.

It is **readable volumes with no black outlines**:
- every surface is shaded by one sun;
- objects sit on soft, baked shadows and contact occlusion;
- materials are procedural rather than flat fills.

## The procedural art system (rules, not a painted map)

```
HQ truth → planner → generated geometry → semantic spaces (room kind, doors, facade side, entrance)
         → visual grammar (render/art5d rules below) → rendered World
```

| Module | Rules |
|---|---|
| `light.mjs` | One sun (front-left, high) and a cool sky fill. Top faces are lit, fronts slightly less, right sides are in shade (shade tints toward blue, not black). Catch-light edges and ground occlusion. A named material vocabulary: grass, soil, asphalt, concrete, pavers, glass, steel, oak, fabric, carpet, screens, Hillink blue. The same numbers would drive later day/night states. |
| `textures.mjs` | Tileable procedural patterns (oak planks, carpet tiles, polished concrete, tiles, pavers, asphalt grain, gravel, grass blades) painted from code. They are mapped **onto the floor plane** through the projection, so planks run along the floor in perspective. |
| `ground.mjs` | **Terrain** is baked once: meadow colour from noise, hillshade from the canonical terrain heights and the sun, water at the water level, a mown lawn apron around each building, and wilder grass beyond it (undeveloped land that looks intentional). **Ways**: roads are drawn along the same rounded curves cars drive, with gravel shoulders, textured asphalt, edge and centre lines; a sidewalk with a curb runs past each building's frontage; paths are pavers; each entrance gets a paved forecourt. **Vegetation**: the canonical environment anchors become species chosen by a noise field (broadleaf groves, conifer stands, birches near buildings, shrubs, rocks) with size and silhouette variation. Each building gets planting beds, and open land gets wildflowers and grass tufts. Plants are cached sprites that sway with the 5C wind, and their shadows are baked into the ground. |
| `furniture.mjs` | The furniture set is rebuilt from the same generated furnishing records and anchors: desks with oak tops, A-frame legs and monitors whose screens run code **only while a real agent works there**; mesh chairs; bookshelves with varied books; server racks with blinking LEDs; a reception desk with the Hillink band; couches, tables, printers, vending, coolers and plants. |
| `figure.mjs` | New characters on the **same 5C pose data**: `poseFor` and the rigs give hands, crouch, lean and props, so every animation intent, blend and walk is unchanged. Stylized proportions (slightly larger heads for readability), shaded limbs and torso, clothing layers, role accessories and a face. |
| `skin.mjs` | Architecture from the generated walls: back walls finished by the room's purpose (oak slats in lounges, a Hillink-blue band in workspaces, concrete panels in halls, acoustic panels in server rooms); interior walls with ribbon windows; a steel-framed curtain wall on the glazed side; glass partitions with slim heads; slab edges, plinth and coping; steel columns carrying the exploded storeys; an entrance canopy with lamps, a bench, a bike rack and planters at every outside door; a flag; sedans. Soft shadows of all fixed objects are baked once per storey; light pools sit under the ceiling fittings. |

**Another seed gives a different, equally coherent World.** Evidence 08 is seed `alpha`: a different building interior, landscape, lake and straight road, in the same visual language.

## Camera positions

`?shot=` values, each computed from the generated layout:

| Shot | What it frames |
|---|---|
| `overview` | the building and its surroundings |
| `entrance` | the entrance, forecourt and road |
| `workspace` | the engineering room |
| `lounge` | lobby and break area |
| `street` | the road and the landscape |
| `corner` | the structure and the curtain wall |

`hillinkWorld.shot(name)` also works from the console.

## Kept, by design

- Canonical scale, generated geometry, navigation, anchors, construction truth, animation intents, movement, agent state, live/simulation separation, persistence and replay.
- The Real/Fantasy shared model.

`tests/pass5d.test.mjs` asserts:
- the art layer leaves the layout, navigation and anchors identical;
- the vegetation rules hold on several seeds (never on roads, paths, forecourts, buildings or water);
- the result is deterministic per seed and different across seeds;
- the new figures and furniture draw every clip and direction.

## Open questions for the art review

- Proportions and faces of the characters.
- Density of the vegetation.
- How much white the architecture should keep versus warmer materials.
- The exploded-storey presentation (columns now carry it).
- The car style.

## Not done yet (by design, 5D-B)

- Generalizing across all generated building types.
- Construction-site art in the new language (sites still draw with the new lighting, but not with bespoke new art).
- Stairs, doors and the lift in the new style.
- Day and night.
- Performance tuning for large worlds (the rules already bake and cache: terrain, plant sprites and per-storey shadows).
- Fantasy.
