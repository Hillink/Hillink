// Strict in-memory stand-in for the subset of node:fs that host.mjs/cli.mjs use.
// TEST USE ONLY, and only when the environment forbids disk access (HQ's sandbox
// runs node with the permission model and no writable path). On a normal host the
// intake tests use real temp folders instead. It models the behaviours the intake
// relies on: exclusive create ('wx' -> EEXIST), read-only files refusing writes
// (EACCES), non-recursive mkdir refusing existing dirs, symlinks seen by lstat and
// followed by stat/realpath, and recursive removal.

import path from 'node:path';

const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;
const S_IFLNK = 0o120000;

function fsError(code, op, p) {
  const err = new Error(`${code}: ${op} '${p}'`);
  err.code = code;
  err.syscall = op;
  err.path = p;
  return err;
}

function makeStat(node) {
  const type = node.type;
  return {
    mode: (type === 'file' ? S_IFREG : type === 'dir' ? S_IFDIR : S_IFLNK) | node.mode,
    size: type === 'file' ? node.data.length : 0,
    mtimeMs: node.mtimeMs,
    isFile: () => type === 'file',
    isDirectory: () => type === 'dir',
    isSymbolicLink: () => type === 'symlink',
  };
}

export function createMemFs() {
  const nodes = new Map();
  const fds = new Map();
  let nextFd = 3;
  let clock = 1_700_000_000_000;
  let seq = 0;
  const tick = () => ++clock;

  const key = (p) => path.resolve(String(p));
  const ensureRoot = (k) => {
    const root = path.parse(k).root;
    if (!nodes.has(root)) nodes.set(root, { type: 'dir', mode: 0o755, mtimeMs: tick() });
  };

  // Follow symlinks in every component; returns the canonical key (or null + missing path).
  function resolveReal(p, followLast = true, depth = 0) {
    if (depth > 32) throw fsError('ELOOP', 'resolve', p);
    const k = key(p);
    ensureRoot(k);
    const { root } = path.parse(k);
    const parts = k.slice(root.length).split(path.sep).filter(Boolean);
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const next = path.join(cur, parts[i]);
      const node = nodes.get(next);
      if (!node) return { real: path.join(next, ...parts.slice(i + 1)), missing: true };
      if (node.type === 'symlink' && (followLast || i < parts.length - 1)) {
        const target = path.resolve(path.dirname(next), node.target);
        const r = resolveReal(path.join(target, ...parts.slice(i + 1)), followLast, depth + 1);
        return r;
      }
      if (node.type === 'file' && i < parts.length - 1) throw fsError('ENOTDIR', 'resolve', p);
      cur = next;
    }
    return { real: cur, missing: false };
  }

  function getNode(p, op, follow = true) {
    const { real, missing } = resolveReal(p, follow);
    if (missing) throw fsError('ENOENT', op, p);
    return { real, node: nodes.get(real) };
  }

  function parentDir(p, op) {
    const { real, missing } = resolveReal(path.dirname(key(p)));
    if (missing) throw fsError('ENOENT', op, p);
    const node = nodes.get(real);
    if (node.type !== 'dir') throw fsError('ENOTDIR', op, p);
    return path.join(real, path.basename(key(p)));
  }

  function createFile(p, op, mode, data) {
    const target = parentDir(p, op);
    if (nodes.has(target)) throw fsError('EEXIST', op, p);
    nodes.set(target, { type: 'file', mode: mode & 0o777 & ~0o022, data: Buffer.from(data), mtimeMs: tick() });
    return target;
  }

  const realpathSync = (p) => {
    const { real, missing } = resolveReal(p);
    if (missing) throw fsError('ENOENT', 'realpath', p);
    return real;
  };
  realpathSync.native = realpathSync;

  const api = {
    constants: { W_OK: 2 },
    existsSync(p) {
      try { return !resolveReal(p).missing; } catch { return false; }
    },
    lstatSync(p) { return makeStat(getNode(p, 'lstat', false).node); },
    statSync(p) { return makeStat(getNode(p, 'stat').node); },
    realpathSync,
    readFileSync(p, enc) {
      const { node } = getNode(p, 'open');
      if (node.type !== 'file') throw fsError('EISDIR', 'read', p);
      const copy = Buffer.from(node.data);
      const encoding = typeof enc === 'string' ? enc : enc && enc.encoding;
      return encoding ? copy.toString(encoding) : copy;
    },
    writeFileSync(p, data, opts = {}) {
      const o = typeof opts === 'string' ? { encoding: opts } : opts;
      const flag = o.flag || 'w';
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), o.encoding || 'utf8');
      const r = resolveReal(p);
      if (!r.missing) {
        if (flag.includes('x')) throw fsError('EEXIST', 'open', p);
        const node = nodes.get(r.real);
        if (node.type !== 'file') throw fsError('EISDIR', 'open', p);
        if ((node.mode & 0o222) === 0) throw fsError('EACCES', 'open', p);
        node.data = Buffer.from(buf);
        node.mtimeMs = tick();
        return;
      }
      createFile(p, 'open', o.mode ?? 0o666, buf);
    },
    openSync(p, flags, mode = 0o666) {
      if (flags !== 'wx') throw fsError('EINVAL', 'open', `${p} (memfs supports only 'wx')`);
      if (!resolveReal(p).missing) throw fsError('EEXIST', 'open', p);
      const target = createFile(p, 'open', mode, Buffer.alloc(0));
      const fd = nextFd++;
      fds.set(fd, target);
      return fd;
    },
    writeSync(fd, buf, off = 0, len = buf.length - off) {
      const target = fds.get(fd);
      if (!target) throw fsError('EBADF', 'write', String(fd));
      const node = nodes.get(target);
      node.data = Buffer.concat([node.data, buf.subarray(off, off + len)]);
      node.mtimeMs = tick();
      return len;
    },
    fsyncSync(fd) { if (!fds.has(fd)) throw fsError('EBADF', 'fsync', String(fd)); },
    closeSync(fd) { if (!fds.delete(fd)) throw fsError('EBADF', 'close', String(fd)); },
    chmodSync(p, mode) {
      const { node } = getNode(p, 'chmod');
      node.mode = mode & 0o7777;
    },
    unlinkSync(p) {
      const { real, missing } = resolveReal(path.dirname(key(p)));
      const k = missing ? key(p) : path.join(real, path.basename(key(p)));
      const node = nodes.get(k);
      if (!node) throw fsError('ENOENT', 'unlink', p);
      if (node.type === 'dir') throw fsError('EPERM', 'unlink', p);
      nodes.delete(k);
    },
    mkdirSync(p, opts = {}) {
      const recursive = typeof opts === 'object' && opts.recursive;
      const r = resolveReal(p);
      if (!r.missing) {
        if (recursive && nodes.get(r.real).type === 'dir') return undefined;
        throw fsError('EEXIST', 'mkdir', p);
      }
      if (!recursive) {
        const target = parentDir(p, 'mkdir');
        nodes.set(target, { type: 'dir', mode: 0o755, mtimeMs: tick() });
        return undefined;
      }
      let first;
      const k = key(p);
      const { root } = path.parse(k);
      let cur = root;
      for (const part of k.slice(root.length).split(path.sep).filter(Boolean)) {
        cur = path.join(cur, part);
        const rr = resolveReal(cur);
        if (rr.missing) {
          const target = parentDir(cur, 'mkdir');
          nodes.set(target, { type: 'dir', mode: 0o755, mtimeMs: tick() });
          first = first || cur;
        } else if (nodes.get(rr.real).type !== 'dir') {
          throw fsError('ENOTDIR', 'mkdir', p);
        }
      }
      return first;
    },
    mkdtempSync(prefix) {
      const p = `${prefix}${(++seq).toString(36).padStart(6, '0')}`;
      api.mkdirSync(path.dirname(key(p)), { recursive: true });
      api.mkdirSync(p);
      return key(p);
    },
    readdirSync(p, opts = {}) {
      const { real, node } = getNode(p, 'scandir');
      if (node.type !== 'dir') throw fsError('ENOTDIR', 'scandir', p);
      const names = [...nodes.keys()].filter((k) => k !== real && path.dirname(k) === real).map((k) => path.basename(k)).sort();
      if (!opts.withFileTypes) return names;
      return names.map((name) => {
        const n = nodes.get(path.join(real, name));
        return { name, isDirectory: () => n.type === 'dir', isFile: () => n.type === 'file', isSymbolicLink: () => n.type === 'symlink' };
      });
    },
    rmSync(p, opts = {}) {
      const { real, missing } = resolveReal(path.dirname(key(p)));
      const k = missing ? key(p) : path.join(real, path.basename(key(p)));
      const node = nodes.get(k);
      if (!node) { if (opts.force) return; throw fsError('ENOENT', 'rm', p); }
      if (node.type === 'dir' && !opts.recursive) throw fsError('ERR_FS_EISDIR', 'rm', p);
      for (const other of [...nodes.keys()]) if (other === k || other.startsWith(k + path.sep)) nodes.delete(other);
    },
    symlinkSync(target, p) {
      const dest = parentDir(p, 'symlink');
      if (nodes.has(dest)) throw fsError('EEXIST', 'symlink', p);
      nodes.set(dest, { type: 'symlink', mode: 0o777, target: String(target), mtimeMs: tick() });
    },
  };
  return api;
}
