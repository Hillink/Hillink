// Implementation policy (Pass 2.6): what an HQ implementation task may touch, decided in code, never by a
// prompt. The orchestrator's tool, the HTTP API and the engine all pass through validateImplementation().
//
// Scope is a short list of repository-relative paths (files or directories). A path must be plain: no
// absolute paths, drive letters, "..", "~", wildcards, backslashes or control characters. Some areas are
// never implementable through HQ: git internals, CI, HQ itself (its security policy lives there), database
// migrations, installed packages, and anything that looks like a secret or credential.

export const IMPLEMENTATION_LIMITS = { scopePaths: 5, testFiles: 3, objective: 1200, criteria: 1200, constraints: 1200, path: 200 };

// Never writable through an implementation task, whatever the scope says.
export const DENIED_PREFIXES = ['.git/', '.github/', '.claude/', '.vscode/', 'node_modules/', 'tools/hillink-hq/', 'supabase/', '.vercel/', '.next/'];
const SECRET_NAME = /(^|\/)(\.env(\..*)?|\.npmrc|\.netrc|\.pgpass|id_rsa|id_ed25519|.*\.(pem|key|p12|pfx|keystore)|.*secret.*|.*credential.*|.*token.*)$/i;
const DENIED_FILES = new Set(['.gitattributes', '.gitignore', '.gitmodules', 'package.json', 'package-lock.json', 'vercel.json', 'next.config.ts', 'middleware.ts']);
const TEST_FILE = /\.test\.(mjs|js|ts)$/;
const SEGMENT = /^[A-Za-z0-9._@+()-]+$/;
const DEVICE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
// Refused as any path segment: git control data, agent configuration and agent instruction files.
const DENIED_ANYWHERE = new Set(['.git', '.gitattributes', '.gitignore', '.gitmodules', '.claude', 'claude.md', 'agents.md', '.husky']);

// One path: returns the normalized repo-relative path (directories end with "/") or throws with a reason.
export function checkPath(raw, { kind = 'scope' } = {}) {
  if (typeof raw !== 'string') throw Error(`${kind} path must be a string`);
  const p = raw.trim();
  if (!p || p.length > IMPLEMENTATION_LIMITS.path) throw Error(`${kind} path must be 1 to ${IMPLEMENTATION_LIMITS.path} characters`);
  if (/[\u0000-\u001f\\*?[\]{}~$`|<>:"]/.test(p)) throw Error(`${kind} path "${p.slice(0, 80)}" has characters that are not allowed (wildcards, backslashes, drive letters, shell characters)`);
  if (p.startsWith('/')) throw Error(`${kind} path "${p}" must be relative to the repository root`);
  const parts = p.replace(/^\.\//, '').split('/');
  const dir = p.endsWith('/');
  const segs = parts.filter((s, i) => !(dir && i === parts.length - 1 && s === ''));
  if (segs.some(s => s === '' || s === '.' || s === '..')) throw Error(`${kind} path "${p}" may not contain empty, "." or ".." segments`);
  // Security review (Pass 2.6): every segment is plain ASCII from a small set, so percent-encoding, Unicode
  // lookalikes and spaces cannot alias another path; no segment may end in "." (Windows strips trailing dots,
  // so ".git." is ".git" and "tools/hillink-hq./x" is HQ's own code); some names are refused at any depth.
  for (const s of segs) {
    if (!SEGMENT.test(s)) throw Error(`${kind} path "${p.slice(0, 80)}" has a segment with characters that are not allowed ("${s.slice(0, 40)}"): use letters, digits and . _ - @ + ( )`);
    if (s.endsWith('.')) throw Error(`${kind} path "${p.slice(0, 80)}" has a segment ending in "." (Windows would alias it)`);
    if (DEVICE.test(s)) throw Error(`${kind} path "${p.slice(0, 80)}" uses a reserved Windows device name ("${s}")`);
    if (DENIED_ANYWHERE.has(s.toLowerCase())) throw Error(`${kind} path "${p.slice(0, 80)}" contains a protected name ("${s}") that is refused at any depth`);
  }
  const norm = segs.join('/') + (dir ? '/' : '');
  const probe = norm.toLowerCase();
  for (const d of DENIED_PREFIXES) if (probe === d.slice(0, -1) || probe.startsWith(d)) throw Error(`${kind} path "${norm}" is in a protected area (${d})`);
  if (SECRET_NAME.test(probe.replace(/\/$/, ''))) throw Error(`${kind} path "${norm}" looks like a secret or credential file`);
  if (kind === 'scope') {
    if (DENIED_FILES.has(probe)) throw Error(`scope path "${norm}" is a protected project file`);
    if (dir && segs.length < 2) throw Error(`scope directory "${norm}" is too broad: name a subdirectory (at least two levels) or specific files`);
  }
  if (kind === 'test' && (dir || !TEST_FILE.test(probe))) throw Error(`test "${norm}" must be a single *.test.mjs, *.test.js or *.test.ts file`);
  return norm;
}

// Is a changed file inside the authorized scope? (Used after Claude finishes, on git's own list of changes.)
export function inScope(file, scope) {
  const f = file.replace(/\\/g, '/');
  try { checkPath(f, { kind: 'changed' }); } catch { return false; }
  return scope.some(s => (s.endsWith('/') ? f.startsWith(s) : f === s));
}

// The whole contract. Returns a normalized copy or throws with the first problem.
export function validateImplementation(input) {
  if (!input || typeof input !== 'object') throw Error('Implementation contract required');
  const text = (v, name, max) => { if (typeof v !== 'string' || !v.trim()) throw Error(`${name} is required`); if (v.length > max) throw Error(`${name} is longer than ${max} characters`); return v.trim(); };
  const objective = text(input.objective, 'objective', IMPLEMENTATION_LIMITS.objective);
  const acceptanceCriteria = text(input.acceptanceCriteria, 'acceptance criteria', IMPLEMENTATION_LIMITS.criteria);
  const constraints = text(input.constraints, 'constraints', IMPLEMENTATION_LIMITS.constraints);
  if (!Array.isArray(input.scope) || input.scope.length < 1 || input.scope.length > IMPLEMENTATION_LIMITS.scopePaths) throw Error(`scope must list 1 to ${IMPLEMENTATION_LIMITS.scopePaths} repository paths`);
  if (!Array.isArray(input.tests) || input.tests.length < 1 || input.tests.length > IMPLEMENTATION_LIMITS.testFiles) throw Error(`tests must list 1 to ${IMPLEMENTATION_LIMITS.testFiles} test files HQ will run to verify the work`);
  const scope = [...new Set(input.scope.map(p => checkPath(p, { kind: 'scope' })))];
  const tests = [...new Set(input.tests.map(p => checkPath(p, { kind: 'test' })))];
  return { objective, scope, acceptanceCriteria, constraints, tests };
}

// The brief Claude receives. HQ, not Claude, runs the tests and makes the commit.
export function implementationBrief(c) {
  return [
    `Objective:\n${c.objective}`,
    `Scope (the only paths you may create or change):\n${c.scope.map(s => `- ${s}`).join('\n')}`,
    `Acceptance criteria:\n${c.acceptanceCriteria}`,
    `Constraints:\n${c.constraints}`,
    `Tests HQ will run after you finish (with node --test; you cannot run them yourself):\n${c.tests.map(t => `- ${t}`).join('\n')}`,
  ].join('\n\n');
}
