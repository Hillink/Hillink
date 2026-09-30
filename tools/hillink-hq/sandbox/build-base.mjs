// Pass 2.7: builds the sandbox base image HQ imports for every implementation run.
//   node tools/hillink-hq/sandbox/build-base.mjs
// Downloads (checksum-verified): Ubuntu Base 24.04 (cdimage.ubuntu.com), Node.js 24 for Linux (nodejs.org). Inside a
// temporary WSL distro it installs git, socat, iproute2, procps, bubblewrap and CA certificates (Ubuntu apt), Claude Code at a
// pinned version (registry.npmjs.org, npm integrity-checked), creates the unprivileged users, installs HQ's guest
// scripts root-owned, disables Windows drive mounts and Windows interop, then exports the image and records its
// sha256. The build distro is always unregistered. No secret is used or stored.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { WslSandbox, SANDBOX_HOME } from '../sandbox.mjs';

const PINS = {
  ubuntu: { file: 'ubuntu-base-24.04.5-base-amd64.tar.gz', url: 'https://cdimage.ubuntu.com/ubuntu-base/releases/24.04/release/', sha256: 'e77b6f10c2590cef872b33ee9f635a0e3fd1f57fb074c0e52b5c7f56147a0c86' },
  node: { file: 'node-v24.14.1-linux-x64.tar.gz', url: 'https://nodejs.org/dist/v24.14.1/', sha256: 'ace9fa104992ed0829642629c46ca7bd7fd6e76278cb96c958c4b387d29658ea' },
  claudeCode: '2.1.138',
};
const GUEST = ['hq-harden.sh', 'hq-stage.sh', 'hq-key.sh', 'hq-claude.sh', 'hq-proxy.mjs', 'hq-diff.sh', 'hq-test.sh', 'hq-test-runner.mjs', 'hq-broker.sh', 'hq-broker.mjs'];
const here = path.dirname(fileURLToPath(import.meta.url));
const BUILD = 'hq-sandbox-build';
const home = process.env.HQ_SANDBOX_HOME || SANDBOX_HOME;
const cache = path.join(home, 'downloads');
const log = m => console.log(`[build-base] ${m}`);
const sbx = new WslSandbox({ home, stepTimeoutMs: 20 * 60_000 });

async function download({ file, url, sha256 }) {
  const dest = path.join(cache, file);
  const sum = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  if (fs.existsSync(dest) && sum(dest) === sha256) { log(`cached ${file}`); return dest; }
  log(`downloading ${url}${file}`);
  const res = await fetch(url + file);
  if (!res.ok) throw Error(`download ${file}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(`${dest}.part`));
  const got = sum(`${dest}.part`);
  if (got !== sha256) { fs.rmSync(`${dest}.part`); throw Error(`${file} checksum mismatch (${got}); refusing it`); }
  fs.renameSync(`${dest}.part`, dest);
  log(`verified ${file} sha256 ${sha256.slice(0, 16)}…`);
  return dest;
}
const root = (script, opts) => sbx.run(['-d', BUILD, '-u', 'root', '--exec', '/bin/sh', '-c', script], opts);

async function main() {
  fs.mkdirSync(cache, { recursive: true });
  const ubuntuGz = await download(PINS.ubuntu), nodeGz = await download(PINS.node);
  const rootfs = path.join(cache, PINS.ubuntu.file.replace(/\.gz$/, ''));
  if (!fs.existsSync(rootfs)) await pipeline(fs.createReadStream(ubuntuGz), zlib.createGunzip(), fs.createWriteStream(rootfs));
  if ((await sbx.list()).includes(BUILD)) await sbx.run(['--unregister', BUILD]);
  const dir = path.join(home, 'build');
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  try {
    log('importing build distro');
    await sbx.run(['--import', BUILD, dir, rootfs, '--version', '2']);
    log('installing packages (apt)');
    await root('set -e; export DEBIAN_FRONTEND=noninteractive; apt-get update -qq; apt-get install -y -qq --no-install-recommends git socat iproute2 procps ca-certificates bubblewrap >/dev/null; git --version; bwrap --version; socat -V | head -2 | tail -1');
    log('installing Node.js 24');
    await root('set -e; mkdir -p /opt/node; tar -xz -C /opt/node --strip-components=1 --no-same-owner; /opt/node/bin/node --version', { input: fs.createReadStream(nodeGz) });
    log(`installing Claude Code ${PINS.claudeCode}`);
    const cc = await root(`set -e; export PATH=/opt/node/bin:$PATH; npm install -g --no-fund --no-audit --prefix /opt/hq/claude @anthropic-ai/claude-code@${PINS.claudeCode} >/dev/null; /opt/hq/claude/bin/claude --version`);
    if (!cc.stdout.includes(PINS.claudeCode)) throw Error(`Claude Code version check failed: ${cc.stdout.trim().slice(0, 200)}`);
    log('users, scripts, WSL settings');
    await root(['set -e',
      'id claude >/dev/null 2>&1 || useradd -u 48101 -U -m -d /home/claude -s /usr/sbin/nologin claude',
      'id runner >/dev/null 2>&1 || useradd -u 48102 -U -M -d /nonexistent -s /usr/sbin/nologin runner',
      'rm -f /etc/sudoers; rm -rf /etc/sudoers.d',
      'mkdir -p /opt/hq /work /var/hq && chown root:root /opt/hq && chmod 0755 /opt/hq',
      // Setuid binaries are how an unprivileged user regains root; none are needed inside the sandbox.
      'find / -xdev -perm -4000 -type f -exec chmod u-s {} + 2>/dev/null || true',
      'find / -xdev -perm -2000 -type f -exec chmod g-s {} + 2>/dev/null || true',
      "printf '[automount]\\nenabled=false\\nmountFsTab=false\\n\\n[interop]\\nenabled=false\\nappendWindowsPath=false\\n\\n[boot]\\nsystemd=false\\n\\n[user]\\ndefault=root\\n' > /etc/wsl.conf",
      'apt-get clean; rm -rf /var/lib/apt/lists/* /root/.npm /tmp/*'].join('\n'));
    for (const f of GUEST) {
      const text = fs.readFileSync(path.join(here, 'guest', f), 'utf8').replace(/\r\n/g, '\n');
      await sbx.run(['-d', BUILD, '-u', 'root', '--exec', '/bin/sh', '-c', 'cat > "$1" && chown root:root "$1" && chmod 0755 "$1"', 'sh', `/opt/hq/${f}`], { input: text });
    }
    const check = await root('set -e; ls -l /opt/hq; find / -xdev -perm /6000 -type f 2>/dev/null | wc -l; cat /etc/wsl.conf | tr "\\n" " "');
    log(check.stdout.trim());
    await sbx.run(['--terminate', BUILD]);
    log('exporting base image');
    const tar = path.join(home, 'base.tar');
    await sbx.run(['--export', BUILD, `${tar}.part`], { timeoutMs: 20 * 60_000 });
    const sha256 = crypto.createHash('sha256');
    await pipeline(fs.createReadStream(`${tar}.part`), sha256);
    fs.renameSync(`${tar}.part`, tar);
    const info = { sha256: sha256.digest('hex'), builtAt: new Date().toISOString(), ubuntu: PINS.ubuntu.file, node: PINS.node.file, claudeCode: PINS.claudeCode, scripts: Object.fromEntries(GUEST.map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(path.join(here, 'guest', f), 'utf8').replace(/\r\n/g, '\n')).digest('hex')])) };
    fs.writeFileSync(path.join(home, 'base.json'), JSON.stringify(info, null, 2));
    log(`base image ready: ${tar} (${(fs.statSync(tar).size / 1e6).toFixed(0)} MB, sha256 ${info.sha256.slice(0, 16)}…)`);
  } finally {
    await sbx.run(['--unregister', BUILD]).catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(`[build-base] FAILED: ${error.message}`); process.exit(1); });
