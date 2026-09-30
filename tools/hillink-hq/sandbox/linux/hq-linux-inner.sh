#!/bin/bash
# Inside the new namespaces (see hq-linux.sh). PID 1 of a fresh PID namespace: when this step ends, every process it
# started ends with it, and the mounts below vanish with the mount namespace.
set -euo pipefail
INST="$1"; ROLE="$2"; NODE_DIR="$3"; GUEST="$4"; shift 4
hostname hq-sandbox
R="$INST/root"
mkdir -p "$R"
mount -t tmpfs -o mode=755,size=64m hqroot "$R"
ro() { mkdir -p "$2"; mount --bind "$1" "$2"; mount -o remount,bind,ro,nosuid,nodev "$2"; }
for d in usr bin lib lib64 sbin; do
  if [ -L "/$d" ]; then ln -s "$(readlink "/$d")" "$R/$d"; elif [ -d "/$d" ]; then ro "/$d" "$R/$d"; fi
done
mkdir -p "$R/etc" "$R/work" "$R/tmp" "$R/proc" "$R/dev" "$R/var/hq"
printf 'root:x:0:0::/root:/bin/false\nhqclaude:x:64000:64000::/tmp:/bin/false\nhqrunner:x:64001:64001::/tmp:/bin/false\n' > "$R/etc/passwd"
printf 'root:x:0:\nhqclaude:x:64000:\nhqrunner:x:64001:\n' > "$R/etc/group"
[ -f /etc/ld.so.cache ] && cp /etc/ld.so.cache "$R/etc/ld.so.cache"
ro "$NODE_DIR" "$R/opt/node"
ro "$GUEST" "$R/opt/hq"
for n in null zero urandom random; do touch "$R/dev/$n"; mount --bind "/dev/$n" "$R/dev/$n"; done
mount -t proc -o nosuid,nodev,noexec proc "$R/proc"
mount -t tmpfs -o mode=1777,size=256m,nosuid,nodev hqtmp "$R/tmp"
G='git -c safe.directory=* --git-dir=/var/hq --work-tree=/work -c core.hooksPath=/dev/null -c core.fsmonitor=false -c core.symlinks=true -c user.name=hq -c user.email=hq@sandbox'
drop() { local uid="$1"; shift; exec chroot "$R" /usr/bin/setpriv --reuid="$uid" --regid="$uid" --clear-groups --no-new-privs --inh-caps=-all --bounding-set=-all /usr/bin/env -i -C /work PATH=/opt/node/bin:/usr/bin:/bin HOME=/tmp LANG=C.UTF-8 "$@"; }
case "$ROLE" in
  stage)
    mount --bind "$INST/work" "$R/work"; mount --bind "$INST/base.git" "$R/var/hq"
    exec chroot "$R" /bin/bash -c "set -euo pipefail; cd /work; tar -x -C /work -f -; chown -R 64000:64000 /work; chmod -R u+rwX,go+rX,go-w /work; $G -c init.defaultBranch=base init -q; $G add -A -f; $G commit -q --allow-empty -m base; chmod -R go-rwx /var/hq; echo \"HQ-SANDBOX: staged \$(find /work -type f | wc -l) files\"" ;;
  diff)
    mount --bind "$INST/work" "$R/work"; mount --bind "$INST/base.git" "$R/var/hq"
    exec chroot "$R" /bin/bash -c "set -euo pipefail; $G add -A -f; exec $G diff --cached --binary --no-color --no-ext-diff --no-textconv --full-index base" ;;
  broker)
    mount --bind "$INST/work" "$R/work"
    cd "$R/work"
    drop 64000 HQ_BROKER_ROOT=/work /opt/node/bin/node /opt/hq/hq-broker.mjs ;;
  test)
    # HQ's own runner (hq-test-runner.mjs) runs the files and reports an authenticated result; HQ's run key arrives on
    # stdin. Test output is never trusted. Only --experimental-strip-types and file names are accepted.
    ro "$INST/work" "$R/work"
    FLAGS=(); FILES=()
    for t in "$@"; do case "$t" in --experimental-strip-types) FLAGS+=("$t") ;; --test-reporter=tap|--no-warnings) ;; -*|/*|*..*) echo "HQ-SANDBOX: bad test argument" >&2; exit 98;; *) FILES+=("$t") ;; esac; done
    cd "$R/work"
    drop 64001 /usr/bin/timeout --kill-after=10 300 /opt/node/bin/node --frozen-intrinsics --no-warnings "${FLAGS[@]}" --permission --allow-fs-read=/work --allow-fs-read=/opt/hq/hq-test-runner.mjs /opt/hq/hq-test-runner.mjs "${FILES[@]}" ;;
  *) echo "HQ-SANDBOX: unknown step" >&2; exit 98 ;;
esac
