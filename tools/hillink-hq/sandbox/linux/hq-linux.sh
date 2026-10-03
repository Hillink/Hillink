#!/bin/bash
# HQ Linux sandbox (Pass 4.5): run one sandbox step for an instance, as root, in fresh namespaces (network with no
# interfaces up, PID, IPC, UTS, private mounts). The step then chroots into a minimal tmpfs root that holds only
# read-only system directories, Node, HQ's guest scripts and this instance's own tree. Repository-derived code and
# broker file operations run there as unprivileged users with no new privileges and no capabilities. Nothing of the
# host (home directories, credentials, Claude configuration, environment, HQ state, other instances) is inside.
#   hq-linux.sh <instance-dir> <stage|diff|broker|test> [args...]   (stdin passes through to the step)
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "HQ-SANDBOX: the Linux sandbox needs root" >&2; exit 97; }
INST="$1"; ROLE="$2"; shift 2
[ -d "$INST/work" ] && [ -d "$INST/base.git" ] || { echo "HQ-SANDBOX: unknown instance" >&2; exit 97; }
: "${HQ_NODE_DIR:?}" "${HQ_GUEST_DIR:?}"
exec unshare --net --pid --ipc --uts --mount --propagation private --fork \
  /bin/bash "$(dirname "$0")/hq-linux-inner.sh" "$INST" "$ROLE" "$HQ_NODE_DIR" "$HQ_GUEST_DIR" "$@"
