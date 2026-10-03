# World art status

**CURRENT 5H ART IS EXPERIMENTAL AND NOT STYLE-LOCKED.** Recorded 2026-10-01 at Kyle's direction (consolidation pass, branch `claude/dev-baseline` from `52d1516`).

## Keep: the architecture

These are approved to stay as the foundation:

- the renderer architecture
- canonical state integration: one canonical agent, with Real and Fantasy as visual aliases that own no state
- the alias architecture
- the animation and state plumbing (Pass 5C, Alive HQ)
- the Sprite Lab and evaluation tooling: comparison sheets, gameplay-scale scenes, lineups
- deterministic composition
- procedural fallback

## Not approved: the current visuals

None of these is a style reference for future work:

- the current character art
- the Real (5D-A) and Fantasy (5G/5H) environment visuals
- the proportions
- the composition

The evidence screenshots in `docs/world/evidence/` document what was built. They are not approved targets.

## Future pipeline

1. **Kyle** authors the art and supplies it as PNG assets.
2. The **Sprite Lab** validates the assets and renders comparison sheets at gameplay scale.
3. **Kyle** approves or rejects.
4. **Claude** integrates the approved assets: loader, compositor, anchors, state mapping, animation.
5. **HQ** verifies.

Claude is the integrator and tooling engineer, not the pixel artist. Claude does not author character art.

The proposed technical conventions are in the Pass 5H art-pipeline report (`/mnt/project-files/pass5h-art-pipeline/REPORT-character-grammar.md`): an 80×80 cell, anchor (40,72), binary alpha and ≤32 colours. They are **proposed, not locked**.
