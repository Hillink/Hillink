#!/bin/bash
# HQ sandbox: run Claude Code for one implementation task. Run as root by HQ; stdin is Claude's prompt; "$@" are the
# Claude arguments HQ built from the validated scope (file tools only, dontAsk, scope-only edit rules).
#
# Network: Claude runs in its own network namespace with only a loopback interface. Its one way out is a relay on
# 127.0.0.1:3128 to /run/hq/proxy.sock, served by hq-proxy.mjs outside the namespace, which only CONNECTs to
# api.anthropic.com:443. Identity: the unprivileged claude user, no new privileges, no capabilities, a clean
# environment, and (bubblewrap, entered as that user) its own PID and IPC namespaces with further user namespaces
# disabled, so it cannot see or signal root's proxy and cannot build a "root" namespace of its own.
set -euo pipefail
[ -r /run/hq/anthropic.key ] || { echo "HQ-SANDBOX: key missing" >&2; exit 93; }
KEY="$(cat /run/hq/anthropic.key)"
# The allowlist proxy (idempotent: one per instance).
if [ ! -S /run/hq/proxy.sock ]; then
  nohup /opt/node/bin/node /opt/hq/hq-proxy.mjs /run/hq/proxy.sock /run/hq/proxy.log >/dev/null 2>&1 &
  for i in $(seq 1 50); do [ -S /run/hq/proxy.sock ] && break; sleep 0.1; done
fi
[ -S /run/hq/proxy.sock ] || { echo "HQ-SANDBOX: proxy did not start" >&2; exit 94; }
export HQ_KEY="$KEY"
# Own network namespace, and a private mount namespace in which hq-harden.sh hides WSL's Windows shares.
exec unshare --net --mount --propagation private --fork /bin/bash -c '
  set -euo pipefail
  HQ_PRIVATE_NS=1 /opt/hq/hq-harden.sh
  ip link set lo up
  socat TCP-LISTEN:3128,bind=127.0.0.1,reuseaddr,fork UNIX-CONNECT:/run/hq/proxy.sock &
  for i in $(seq 1 50); do (exec 3<>/dev/tcp/127.0.0.1/3128) 2>/dev/null && break; sleep 0.05; done
  cd /work
  exec setpriv --reuid=claude --regid=claude --init-groups --no-new-privs --inh-caps=-all \
    env -i PATH=/opt/node/bin:/usr/local/bin:/usr/bin:/bin HOME=/home/claude LANG=C.UTF-8 \
      HTTPS_PROXY=http://127.0.0.1:3128 HTTP_PROXY=http://127.0.0.1:3128 NO_PROXY= \
      ANTHROPIC_API_KEY="$HQ_KEY" DISABLE_AUTOUPDATER=1 DISABLE_TELEMETRY=1 DISABLE_ERROR_REPORTING=1 \
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
      bwrap --unshare-user --disable-userns --unshare-pid --unshare-ipc --die-with-parent \
        --dev-bind / / --proc /proc --chdir /work -- /opt/hq/claude/bin/claude "$@"
' hq-claude "$@"
