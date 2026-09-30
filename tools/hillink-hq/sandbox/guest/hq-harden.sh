#!/bin/bash
# HQ sandbox: hide everything WSL shares from Windows, for the Claude and test steps (run as root, idempotent).
# It must run inside a fresh private mount namespace (callers: unshare --mount --propagation private, and
# HQ_PRIVATE_NS=1). WSL's shares (/mnt/wsl, the GPU driver 9p mounts, WSLg) propagate across the whole WSL VM;
# changing them in the instance's own namespace breaks every other distro on the machine, so this refuses to.
# wsl.conf already turns off drive automount and interop; here the GPU driver shares (9p views of Windows
# directories), WSLg's shares and the interop socket directory disappear too, and any Windows filesystem that is
# still mounted afterwards stops the step.
set -euo pipefail
[ "${HQ_PRIVATE_NS:-}" = 1 ] || { echo "HQ-SANDBOX: hq-harden.sh must run in a private mount namespace" >&2; exit 95; }
grep -qE '^enabled *= *false' <(sed -n '/^\[interop\]/,/^\[/p' /etc/wsl.conf) || { echo "HQ-SANDBOX: interop not disabled in wsl.conf; refusing" >&2; exit 91; }
grep -qE '^enabled *= *false' <(sed -n '/^\[automount\]/,/^\[/p' /etc/wsl.conf) || { echo "HQ-SANDBOX: automount not disabled in wsl.conf; refusing" >&2; exit 91; }
mount --make-rprivate /
awk '$3 ~ /^(9p|drvfs|virtiofs)$/ { print $2 }' /proc/mounts | sort -r | while read -r m; do umount -l "$m" 2>/dev/null || true; done
for m in /mnt/wsl /mnt/wslg /tmp/.X11-unix /run/WSL /usr/lib/wsl; do
  [ -d "$m" ] && mount -t tmpfs -o ro,size=1k,mode=000 hqhidden "$m" 2>/dev/null || true
done
if awk '$3 ~ /^(9p|drvfs|virtiofs)$/' /proc/mounts | grep -q .; then echo "HQ-SANDBOX: a Windows filesystem is mounted; refusing" >&2; exit 90; fi
