#!/bin/bash
# HQ sandbox: stage one task (run as root by HQ, once per disposable instance).
# stdin: a tar of the task's base tree (from `git archive`), nothing else.
# Hardens the instance, unpacks the tree into /work (owned by the claude user) and records a baseline in a git
# directory Claude cannot reach (/var/hq/base.git, root only), so the diff HQ receives is computed by root.
set -euo pipefail
umask 022
# Staging runs no task code, so it only checks the instance; the Claude and test steps each hide WSL's remaining
# shares in their own private mount namespace (hq-harden.sh). The WSLInterop binfmt entry is shared by every distro
# on the WSL kernel, so it is not a per-instance signal; interop is off in wsl.conf, its socket directory is hidden
# from task code, and the attack tests confirm a Windows .exe cannot start even as root.
grep -qE '^enabled *= *false' <(sed -n '/^\[interop\]/,/^\[/p' /etc/wsl.conf) || { echo "HQ-SANDBOX: interop not disabled in wsl.conf; refusing" >&2; exit 91; }
grep -qE '^enabled *= *false' <(sed -n '/^\[automount\]/,/^\[/p' /etc/wsl.conf) || { echo "HQ-SANDBOX: automount not disabled in wsl.conf; refusing" >&2; exit 91; }
if awk '$3 ~ /^(drvfs|9p|virtiofs)$/ && $2 !~ /^\/usr\/lib\/wsl\//' /proc/mounts | grep -q .; then echo "HQ-SANDBOX: a Windows drive is mounted; refusing" >&2; exit 90; fi
rm -rf /work /var/hq && mkdir -p /work /var/hq /run/hq && chmod 700 /run/hq
tar -x -C /work -f -
chown -R claude:claude /work && chmod -R u+rwX,go+rX,go-w /work
git -c 'safe.directory=*' -c init.defaultBranch=base --git-dir=/var/hq/base.git --work-tree=/work init -q
git -c 'safe.directory=*' --git-dir=/var/hq/base.git --work-tree=/work -c core.hooksPath=/dev/null -c user.name=hq -c user.email=hq@sandbox add -A -f
git -c 'safe.directory=*' --git-dir=/var/hq/base.git --work-tree=/work -c core.hooksPath=/dev/null -c user.name=hq -c user.email=hq@sandbox commit -q --allow-empty -m base
chmod -R go-rwx /var/hq
echo "HQ-SANDBOX: staged $(find /work -type f | wc -l) files"
