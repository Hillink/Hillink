#!/bin/bash
# HQ sandbox: run the task's acceptance tests with no network, as the runner user, under Node's permission model.
# Run as root by HQ; "$@" are validated repository-relative test files. The API key is deleted and the proxy
# stopped first, and /work is read-only to the runner user, so test code can neither reach the key or the network
# nor change what HQ verifies. A private mount namespace hides WSL's Windows shares (hq-harden.sh); bubblewrap
# (entered as runner) adds PID/IPC isolation and disables user namespaces.
set -euo pipefail
shred -u /run/hq/anthropic.key 2>/dev/null || rm -f /run/hq/anthropic.key
pkill -KILL -u claude 2>/dev/null || true
pkill -KILL -f '^/opt/node/bin/node /opt/hq/hq-proxy.mjs' 2>/dev/null || true
pkill -KILL -x socat 2>/dev/null || true
rm -f /run/hq/proxy.sock
cd /work
exec timeout --kill-after=10 300 unshare --net --mount --propagation private --fork /bin/bash -c '
  set -euo pipefail
  HQ_PRIVATE_NS=1 /opt/hq/hq-harden.sh
  exec setpriv --reuid=runner --regid=runner --init-groups --no-new-privs --inh-caps=-all \
    env -i PATH=/opt/node/bin:/usr/bin:/bin HOME=/tmp LANG=C.UTF-8 \
      bwrap --unshare-user --disable-userns --unshare-pid --unshare-ipc --die-with-parent \
        --dev-bind / / --proc /proc --chdir /work -- \
        /opt/node/bin/node --permission --allow-fs-read=/work --test-isolation=none --test "$@"
' hq-test "$@"
