# Stand-in test input: NOT Hillink art

`RobotExpressive.glb`:
- **Model:** Tomás Laulhé (Quaternius).
- **Modifications:** Don McCurdy (three morph targets, FBX2GLTF conversion).
- **Licence:** CC0 1.0.
- **Source:** https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive
- **sha256:** `047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319`

This file exists only to prove the Art Factory's downstream pipeline (Step 1, 2026-10-01). It is a **stand-in**.

**It must never become shipping Hillink art.** Every sheet made from it is marked `standIn: true` and `status: candidate`. The World loader refuses stand-in sheets unless the page explicitly asks for them (`?assets=standin`).
