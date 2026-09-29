#!/bin/bash
# HQ sandbox: receive the Anthropic API key on stdin (never on a command line or in Windows-visible env) and store
# it readable only by root; hq-claude.sh hands it to the Claude process alone, and hq-test.sh deletes it first.
set -euo pipefail
umask 077
mkdir -p /run/hq && chmod 700 /run/hq
head -c 512 > /run/hq/anthropic.key
chmod 400 /run/hq/anthropic.key
[ -s /run/hq/anthropic.key ] || { echo "HQ-SANDBOX: no key received" >&2; exit 92; }
echo "HQ-SANDBOX: key stored"
