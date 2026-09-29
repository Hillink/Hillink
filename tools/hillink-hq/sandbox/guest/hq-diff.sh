#!/bin/bash
# HQ sandbox: print everything that changed under /work since staging as one binary git patch (run as root).
# Includes new, deleted, renamed and gitignored files (-f). HQ treats the output as data: it validates, applies and
# scope-checks it on the host; nothing from the sandbox is ever executed there.
set -euo pipefail
# Claude is finished: nothing it started may keep changing /work after the diff, and its key is no longer needed.
pkill -KILL -u claude 2>/dev/null || true
shred -u /run/hq/anthropic.key 2>/dev/null || rm -f /run/hq/anthropic.key
G=(git -c 'safe.directory=*' --git-dir=/var/hq/base.git --work-tree=/work -c core.hooksPath=/dev/null -c core.fsmonitor=false -c core.symlinks=true)
"${G[@]}" add -A -f
exec "${G[@]}" diff --cached --binary --no-color --no-ext-diff --no-textconv --full-index base
