#!/bin/bash
# HQ sandbox (Pass 4.5): run one split-broker file operation (hq-broker.mjs) on /work. Run as root by HQ; stdin is the
# JSON request HQ validated. The operation runs as the unprivileged claude user (who owns /work), with no network at
# all (its own network namespace, loopback down), WSL's Windows shares hidden (hq-harden.sh), a clean environment and
# bubblewrap PID/IPC isolation. No Claude process and no credential exists in the sandbox in this mode: Claude runs on
# the host under Kyle's subscription and reaches /work only through these operations.
set -euo pipefail
[ ! -e /run/hq/anthropic.key ] || { echo "HQ-SANDBOX: a key is present; broker mode never holds one" >&2; exit 96; }
cd /work
exec timeout --kill-after=5 60 unshare --net --mount --propagation private --fork /bin/bash -c '
  set -euo pipefail
  HQ_PRIVATE_NS=1 /opt/hq/hq-harden.sh
  exec setpriv --reuid=claude --regid=claude --init-groups --no-new-privs --inh-caps=-all \
    env -i PATH=/opt/node/bin:/usr/bin:/bin HOME=/tmp LANG=C.UTF-8 HQ_BROKER_ROOT=/work \
      bwrap --unshare-user --disable-userns --unshare-pid --unshare-ipc --die-with-parent \
        --dev-bind / / --proc /proc --chdir /work -- \
        /opt/node/bin/node /opt/hq/hq-broker.mjs
' hq-broker
