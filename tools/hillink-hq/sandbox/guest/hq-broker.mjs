// HQ sandbox (Pass 4.5): one broker file operation on the staged tree, run INSIDE the disposable sandbox as the
// unprivileged claude user, in a network namespace with no interfaces. stdin: one JSON request HQ built and validated
// (broker/policy.mjs); stdout: one JSON reply. It executes nothing from the repository.
//
// Defence in depth: HQ already refused bad paths, but this program trusts nothing it is given either. Every path is
// re-checked (plain ASCII segments, no "..", no .git), every existing component is lstat'ed (a symbolic link anywhere
// is refused, so a link planted by earlier task code cannot redirect a read or write), and files are opened with
// O_NOFOLLOW. Replies carry repository-relative paths only.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.env.HQ_BROKER_ROOT || '/work';
const SEGMENT = /^[A-Za-z0-9._@+()-]+$/;
const SKIP = new Set(['.git', 'node_modules']);
const reply = obj => { process.stdout.write(JSON.stringify(obj)); process.exit(0); };
const refuse = msg => reply({ ok: false, error: msg });

function segments(rel, { allowRoot }) {
  if (typeof rel !== 'string') refuse('invalid path');
  const clean = rel.replace(/\/$/, '');
  if (clean === '') { if (allowRoot) return []; refuse('a path is required'); }
  const segs = clean.split('/');
  for (const s of segs) if (!SEGMENT.test(s) || s === '.' || s === '..' || s.startsWith('-') || s.toLowerCase() === '.git') refuse(`path "${rel.slice(0, 120)}" is not allowed`);
  return segs;
}
// Walks the path component by component. Every existing component must be a real directory (or, for the last one,
// whatever `last` allows); a symbolic link anywhere refuses the call.
function resolve(rel, { allowRoot = false, last = 'any', create = false } = {}) {
  const segs = segments(rel, { allowRoot });
  let cur = ROOT;
  for (let i = 0; i < segs.length; i++) {
    cur = path.join(cur, segs[i]);
    let st = null;
    try { st = fs.lstatSync(cur); } catch (e) { if (e.code !== 'ENOENT') refuse('path not accessible'); }
    const isLast = i === segs.length - 1;
    if (st?.isSymbolicLink()) refuse(`"${segs.slice(0, i + 1).join('/')}" is a symbolic link; the broker never follows links`);
    if (!st) {
      if (isLast && last !== 'dir' && create) break;
      if (!isLast && create) { fs.mkdirSync(cur, { mode: 0o755 }); continue; }
      refuse(`"${segs.slice(0, i + 1).join('/')}" does not exist`);
    }
    if (!isLast && !st.isDirectory()) refuse(`"${segs.slice(0, i + 1).join('/')}" is not a directory`);
    if (isLast && last === 'file' && !st.isFile()) refuse(`"${rel}" is not a regular file`);
    if (isLast && last === 'dir' && !st.isDirectory()) refuse(`"${rel}" is not a directory`);
  }
  const real = path.resolve(cur);
  if (real !== ROOT && !real.startsWith(ROOT + path.sep)) refuse('path escapes the repository');
  return { abs: real, rel: segs.join('/') };
}
const readFileNoFollow = abs => {
  const fd = fs.openSync(abs, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { const st = fs.fstatSync(fd); if (!st.isFile()) refuse('not a regular file'); if (st.size > 2_000_000) refuse('file is larger than 2 MB'); const b = Buffer.alloc(st.size); fs.readSync(fd, b, 0, st.size, 0); return b; } finally { fs.closeSync(fd); }
};
const writeFileNoFollow = (abs, content) => {
  const fd = fs.openSync(abs, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW, 0o644);
  try { const st = fs.fstatSync(fd); if (!st.isFile()) refuse('not a regular file'); fs.writeSync(fd, content); } finally { fs.closeSync(fd); }
};
const binary = b => b.subarray(0, 8192).includes(0);
const inScope = (rel, scope) => Array.isArray(scope) && scope.some(s => (s.endsWith('/') ? rel.startsWith(s) : rel === s));

// list and search return structured entries; HQ applies its read policy to every returned path (broker/policy.mjs
// visible()) and formats the reply, so a listing or search never shows what repo_read would refuse.
function list(req) {
  const { abs, rel } = resolve(req.path, { allowRoot: true, last: 'dir' });
  const entries = [];
  const walk = (dir, prefix, depth) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entries.length >= req.max) return;
      if (SKIP.has(e.name) || !SEGMENT.test(e.name)) continue;
      const p = prefix ? `${prefix}/${e.name}` : e.name;
      const type = e.isSymbolicLink() ? 'link' : e.isDirectory() ? 'dir' : e.isFile() ? 'file' : 'other';
      entries.push({ path: p, type, ...(type === 'file' ? { size: fs.lstatSync(path.join(dir, e.name)).size } : {}) });
      if (type === 'dir' && depth > 1) walk(path.join(dir, e.name), p, depth - 1);
    }
  };
  walk(abs, rel, req.depth);
  reply({ ok: true, entries, truncated: entries.length >= req.max });
}
function read(req) {
  const { abs, rel } = resolve(req.path, { last: 'file' });
  const b = readFileNoFollow(abs);
  if (binary(b)) reply({ ok: true, text: `${rel} is a binary file (${b.length} bytes); the broker returns text files only.` });
  const lines = b.toString('utf8').split('\n');
  const from = Math.min(req.offset, lines.length), slice = lines.slice(from - 1, from - 1 + req.lines);
  let text = slice.map((l, i) => `${String(from + i).padStart(5)}\t${l}`).join('\n');
  if (Buffer.byteLength(text) > req.maxBytes) text = Buffer.from(text).subarray(0, req.maxBytes).toString('utf8') + '\n[... truncated]';
  reply({ ok: true, text: `${rel} (${lines.length} lines; showing ${from}-${from + slice.length - 1})\n${text}` });
}
function search(req) {
  const start = resolve(req.path, { allowRoot: true });
  const hits = []; let scanned = 0;
  const visit = (abs, rel) => {
    if (hits.length >= req.max || scanned > 20_000) return;
    const st = fs.lstatSync(abs);
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) { for (const n of fs.readdirSync(abs).sort()) if (!SKIP.has(n) && SEGMENT.test(n)) visit(path.join(abs, n), rel ? `${rel}/${n}` : n); return; }
    if (!st.isFile() || st.size > 1_000_000) return;
    scanned++;
    const b = fs.readFileSync(abs);
    if (binary(b)) return;
    const lines = b.toString('utf8').split('\n');
    for (let i = 0; i < lines.length && hits.length < req.max; i++) if (lines[i].includes(req.query)) hits.push({ path: rel, line: i + 1, text: lines[i].trim().slice(0, 220) });
  };
  visit(start.abs, start.rel);
  reply({ ok: true, hits, truncated: hits.length >= req.max });
}
function write(req) {
  const segs = segments(req.path, { allowRoot: false });
  if (!inScope(segs.join('/'), req.scope)) refuse('outside the write scope');
  if (typeof req.content !== 'string' || Buffer.byteLength(req.content) > 400_000) refuse('content too large');
  const { abs, rel } = resolve(req.path, { last: 'file', create: true });
  const existed = fs.existsSync(abs);
  writeFileNoFollow(abs, req.content);
  reply({ ok: true, text: `${existed ? 'Replaced' : 'Created'} ${rel} (${Buffer.byteLength(req.content)} bytes).`, path: rel, bytes: Buffer.byteLength(req.content), created: !existed });
}
function edit(req) {
  const segs = segments(req.path, { allowRoot: false });
  if (!inScope(segs.join('/'), req.scope)) refuse('outside the write scope');
  const { abs, rel } = resolve(req.path, { last: 'file' });
  const before = readFileNoFollow(abs);
  if (binary(before)) refuse('binary files cannot be edited');
  const text = before.toString('utf8');
  const count = text.split(req.oldText).length - 1;
  if (count === 0) refuse('old_text was not found in the file');
  if (count > 1 && !req.replaceAll) refuse(`old_text appears ${count} times; make it unique or set replace_all`);
  const after = req.replaceAll ? text.split(req.oldText).join(req.newText) : text.replace(req.oldText, () => req.newText);
  if (Buffer.byteLength(after) > 400_000) refuse('the edited file would be larger than 400 KB');
  writeFileNoFollow(abs, after);
  reply({ ok: true, text: `Edited ${rel}: ${req.replaceAll ? count : 1} replacement(s).`, path: rel, bytes: Buffer.byteLength(after), created: false });
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { input += d; if (input.length > 2_000_000) refuse('request too large'); });
process.stdin.on('end', () => {
  let req; try { req = JSON.parse(input); } catch { refuse('invalid request'); }
  try {
    if (req.op === 'list') list(req);
    else if (req.op === 'read') read(req);
    else if (req.op === 'search') search(req);
    else if (req.op === 'write') write(req);
    else if (req.op === 'edit') edit(req);
    else refuse('unknown operation');
  } catch (e) { refuse(e?.code === 'ELOOP' ? 'symbolic link refused' : 'operation failed'); }
});
