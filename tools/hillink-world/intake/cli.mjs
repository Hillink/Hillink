#!/usr/bin/env node
// Hillink World asset intake CLI. Zero network, zero dependencies, executes nothing.
//
//   node tools/hillink-world/intake/cli.mjs inspect <zip>
//   node tools/hillink-world/intake/cli.mjs validate-manifest <manifest.json> [--zip <zip>]
//   node tools/hillink-world/intake/cli.mjs stage <zip> [--manifest <manifest.json>] [--quarantine <dir>]
//   node tools/hillink-world/intake/cli.mjs extract <staged.zip> --manifest <manifest.json> --out <new-dir> [--sha256 <hex>]
//
// Unknown, repeated or value-less flags are errors (exit 2), so a typo can never
// silently fall back to a default.

import nodeFs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectZip, readMember, DEFAULT_LIMITS } from './zip.mjs';
import { validateManifest, crossCheckManifest } from './manifest.mjs';
import { stageZip, extractZip, sha256Hex, findGitRoot } from './host.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAX_MANIFEST_BYTES = 1024 * 1024;

const COMMANDS = {
  inspect: { positionals: 1, flags: [], required: [] },
  'validate-manifest': { positionals: 1, flags: ['zip'], required: [] },
  stage: { positionals: 1, flags: ['manifest', 'quarantine'], required: [] },
  extract: { positionals: 1, flags: ['manifest', 'out', 'sha256'], required: ['manifest', 'out'] },
};

export class UsageError extends Error {}

export const USAGE = `usage:
  intake inspect <zip>
  intake validate-manifest <manifest.json> [--zip <zip>]
  intake stage <zip> [--manifest <manifest.json>] [--quarantine <dir>]
  intake extract <staged.zip> --manifest <manifest.json> --out <new-dir> [--sha256 <hex>]`;

export function parseArgs(argv) {
  if (argv.length === 0) throw new UsageError('missing command');
  const [command, ...rest] = argv;
  const spec = COMMANDS[command];
  if (!spec) throw new UsageError(`unknown command "${command}"`);
  const flags = {};
  const positionals = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--') { positionals.push(...rest.slice(i + 1)); break; }
    if (a.startsWith('-')) {
      if (!a.startsWith('--') || a.length < 3) throw new UsageError(`unknown option "${a}"`);
      let name = a.slice(2);
      let value;
      const eq = name.indexOf('=');
      if (eq !== -1) { value = name.slice(eq + 1); name = name.slice(0, eq); }
      if (!spec.flags.includes(name)) throw new UsageError(`unknown option "--${name}" for ${command}`);
      if (Object.prototype.hasOwnProperty.call(flags, name)) throw new UsageError(`option "--${name}" given more than once`);
      if (value === undefined) {
        if (i + 1 >= rest.length || rest[i + 1].startsWith('--')) throw new UsageError(`option "--${name}" needs a value`);
        value = rest[++i];
      }
      if (value === '') throw new UsageError(`option "--${name}" needs a non-empty value`);
      flags[name] = value;
    } else {
      positionals.push(a);
    }
  }
  if (positionals.length !== spec.positionals) throw new UsageError(`${command} takes exactly ${spec.positionals} path argument(s), got ${positionals.length}`);
  for (const r of spec.required) if (!(r in flags)) throw new UsageError(`${command} requires --${r}`);
  return { command, positionals, flags };
}

function readJsonFile(fs, p) {
  const st = fs.lstatSync(p);
  if (!st.isFile()) throw new Error(`not a regular file: ${p}`);
  if (st.size > MAX_MANIFEST_BYTES) throw new Error(`manifest larger than ${MAX_MANIFEST_BYTES} bytes: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function inspectFile(fs, p) {
  const st = fs.lstatSync(p);
  if (!st.isFile()) throw new Error(`not a regular file: ${p}`);
  if (st.size > DEFAULT_LIMITS.maxArchiveBytes) throw new Error(`archive larger than ${DEFAULT_LIMITS.maxArchiveBytes} bytes`);
  const buf = fs.readFileSync(p);
  const ins = inspectZip(buf);
  const files = ins.files.map((f) => ({ name: f.name, size: f.uncompressedSize, sha256: sha256Hex(readMember(buf, f)) }));
  return { buf, ins, files, sha256: sha256Hex(buf) };
}

/** Run the CLI. Returns an exit code: 0 ok, 1 rejected/failed, 2 usage error. */
export function run(argv, { stdout = process.stdout, stderr = process.stderr, env = process.env, cwd = process.cwd(), repoRoot, detectGitAncestors = true, fs = nodeFs } = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    stderr.write(`intake: ${err.message}\n${USAGE}\n`);
    return 2;
  }
  const abs = (p) => path.resolve(cwd, p);
  const print = (obj) => stdout.write(JSON.stringify(obj, null, 2) + '\n');
  try {
    const target = abs(args.positionals[0]);
    switch (args.command) {
      case 'inspect': {
        const { buf, ins, files, sha256 } = inspectFile(fs, target);
        print({ ok: true, filename: path.basename(target), byteSize: buf.length, sha256, entryCount: ins.entryCount, directories: ins.directories, inspectedMembers: files });
        return 0;
      }
      case 'validate-manifest': {
        const manifest = readJsonFile(fs, target);
        const v = validateManifest(manifest);
        const errors = [...v.errors];
        if (v.ok && args.flags.zip) {
          const zipPath = abs(args.flags.zip);
          const { buf, ins, files, sha256 } = inspectFile(fs, zipPath);
          const x = crossCheckManifest(manifest, { sha256, byteSize: buf.length, files: ins.files, filename: path.basename(zipPath), memberSha256: Object.fromEntries(files.map((f) => [f.name, f.sha256])) });
          errors.push(...x.errors);
        }
        print({ ok: errors.length === 0, errors });
        return errors.length === 0 ? 0 : 1;
      }
      case 'stage': {
        const manifest = args.flags.manifest ? readJsonFile(fs, abs(args.flags.manifest)) : undefined;
        const quarantine = args.flags.quarantine;
        const r = stageZip(target, { manifest, quarantine, env, repoRoot: repoRoot ?? findGitRoot(HERE), detectGitAncestors, fs });
        print({ ok: true, ...r });
        return 0;
      }
      case 'extract': {
        const manifest = readJsonFile(fs, abs(args.flags.manifest));
        const r = extractZip(target, { manifest, outDir: abs(args.flags.out), expectedSha256: args.flags.sha256, fs });
        print({ ok: true, ...r });
        return 0;
      }
    }
  } catch (err) {
    stderr.write(`intake: ${args.command} failed: ${err.message}\n`);
    return 1;
  }
  return 2;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) process.exitCode = run(process.argv.slice(2));
