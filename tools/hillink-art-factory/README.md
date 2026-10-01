# Hillink Art Factory (Step 1)

Turns a rigged, animated 3D character into a Hillink World sprite sheet, unattended and deterministically.

```
rigged/animated glTF (inputs/, allowlisted in recipes.json, sha256-pinned)
  → headless Blender (bpy 5.0.1, Cycles CPU, fixed seed and threads)
  → fixed Hillink camera: orthographic, 30° pitch, four diagonal facings (fr, fl, br, bl)
  → every clip × facing × frame, supersampled 4× on a transparent background
  → pixel pass (pixel.py): box downsample, sole point onto the anchor, binary alpha,
    one shared palette for every frame, 1 px outline
  → sheet.png + sheet.json (tools/hillink-world/assets/characters/<agent>/<theme>/x<scale>/)
  → the World's authored-sprite loader (tools/hillink-world/render/px/authored.mjs)
```

Nothing in the chain is manual: no GUI, no frame or sprite editing, and no paid service or network call.

## Running it

HQ runs it for an `asset` objective. See `tools/hillink-hq/art-factory-adapter.mjs` and `tools/hillink-hq/live/art-factory-proof.mjs`.

To run it by hand (Python 3.11 with `requirements.txt` installed):

```
python factory.py --recipe standin-robot --scale 1 --out /tmp/sheet
python verify.py /tmp/sheet --expect-scale 1
```

- `--scale N` (1–4) multiplies the cell, the anchor and the character's on-screen height. The body-plan height is in `config.json`; the dwarf body plan is 21 px at 1×. This lets 1× and 2× presentation be compared without changing the pipeline. In the World, `?charscale=2` selects the x2 sheets.
- The same inputs give byte-identical `sheet.png` and `sheet.json` files. HQ renders twice and compares them.

## Files

| File | Purpose |
| --- | --- |
| `recipes.json` | The only inputs the factory accepts: the input file and its sha256, the clip→action map, the agent, theme and status. |
| `config.json` | The camera, cell, anchor, body heights and pixel rules (shared by every recipe). |
| `factory.py` | Blender rendering, then the pixel pass. Prints `HQ-ART <json>`. |
| `pixel.py` | The deterministic pixel pass and sheet writer. |
| `verify.py` | Sheet checks: meta, sha, size, facings, alpha, palette, anchor, height, edges. Prints `HQ-ART-VERIFY <json>`. |
| `inputs/standin-robot/` | The CC0 stand-in test fixture (see its LICENSE.md). It must **never become shipping Hillink art**. |

## Stand-in rule

`standin-robot` is a free CC0 test model used only to prove the pipeline. Its sheet is `status: candidate` with `standIn: true`:

- The World never shows it by default. It is shown only with `?assets=standin`.
- The World loader and HQ's verifier both refuse a stand-in marked `approved`.
