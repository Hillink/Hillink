// Pass 4.5 split broker: the tool surface HQ gives the subscription Claude, and the rules every call must pass.
//
// Claude reasons on the trusted host under Kyle's subscription with NO built-in tools (no shell, no file tools, no web).
// Its only tools are these broker operations. Each call is validated here, in HQ code, against the task's contract:
// the model decides what it wants, the broker decides what it gets. Repository content and model output are both
// untrusted; nothing either says can widen a scope, name a host path or reach a network.
//
// There is deliberately no exec/shell/http tool. Tests run only as the task's fixed, HQ-chosen test files.
import { checkPath, inScope } from '../implementation-policy.mjs';

export const BROKER_SERVER = 'hq';
export const LIMITS = Object.freeze({
  deadlineMs: 25 * 60_000, // wall clock for one implementation session
  calls: 250, // every tool call, refused ones included
  reads: 160, // repo_read + repo_list + repo_search
  writes: 60, // repo_write + repo_edit
  testRuns: 8, // run_tests
  refusals: 40, // after this many refused calls the session ends (a model fighting the policy is stopped)
  argBytes: 450_000, // one call's JSON arguments
  fileBytes: 400_000, // one file written
  readBytes: 200_000, // returned by one read
  totalOutBytes: 6_000_000, // everything returned to Claude in one session
  searchResults: 100,
  listEntries: 400,
});

const str = (v, name, { min = 0, max }) => {
  if (typeof v !== 'string') throw Error(`${name} must be a string`);
  if (v.length < min || v.length > max) throw Error(`${name} must be ${min} to ${max} characters`);
  return v;
};
const int = (v, name, lo, hi, dflt) => {
  if (v === undefined || v === null) return dflt;
  if (!Number.isInteger(v) || v < lo || v > hi) throw Error(`${name} must be an integer from ${lo} to ${hi}`);
  return v;
};

// Read scope: the whole staged repository except what implementation-policy refuses at any depth (git internals,
// agent configuration and instruction files, HQ itself, installed packages, anything that looks like a credential).
// '' or '.' is the repository root (list and search only).
export function readPath(raw, { allowRoot = false } = {}) {
  if (allowRoot && (raw === undefined || raw === '' || raw === '.' || raw === './')) return '';
  const p = checkPath(raw, { kind: 'read' });
  return p;
}
// Write scope: a single file inside the task's validated scope (never a directory, never outside it).
export function writePath(raw, scope) {
  const p = checkPath(raw, { kind: 'write' });
  if (p.endsWith('/')) throw Error(`write path "${p}" must be a file, not a directory`);
  if (!inScope(p, scope)) throw Error(`write path "${p}" is outside this task's write scope (${scope.join(', ')})`);
  return p;
}

const PATH_PROP = { type: 'string', maxLength: 200, description: 'Repository-relative path using forward slashes, e.g. src/lib/slug.mjs' };
// MCP tool definitions (JSON Schema). additionalProperties:false everywhere; the broker re-validates regardless.
export const TOOLS = Object.freeze([
  { name: 'repo_list', description: 'List files and directories in the task repository (read-only). Returns repository-relative paths.', inputSchema: { type: 'object', properties: { path: { ...PATH_PROP, description: 'Directory to list; omit for the repository root.' }, depth: { type: 'integer', minimum: 1, maximum: 3, description: 'How many directory levels to include (default 1).' } }, additionalProperties: false } },
  { name: 'repo_read', description: 'Read one text file from the task repository. Returns numbered lines.', inputSchema: { type: 'object', properties: { path: PATH_PROP, offset_line: { type: 'integer', minimum: 1, maximum: 1_000_000 }, max_lines: { type: 'integer', minimum: 1, maximum: 4000 } }, required: ['path'], additionalProperties: false } },
  { name: 'repo_search', description: 'Search the task repository for a literal string (not a regular expression). Returns path:line: text matches.', inputSchema: { type: 'object', properties: { query: { type: 'string', minLength: 2, maxLength: 200 }, path: { ...PATH_PROP, description: 'Directory or file to search; omit for the whole repository.' }, max_results: { type: 'integer', minimum: 1, maximum: LIMITS.searchResults } }, required: ['query'], additionalProperties: false } },
  { name: 'repo_write', description: 'Create or replace one file with the given full content. Only paths inside the task\'s write scope are accepted.', inputSchema: { type: 'object', properties: { path: PATH_PROP, content: { type: 'string', maxLength: LIMITS.fileBytes } }, required: ['path', 'content'], additionalProperties: false } },
  { name: 'repo_edit', description: 'Replace an exact text fragment in one file inside the write scope. old_text must appear exactly once unless replace_all is true.', inputSchema: { type: 'object', properties: { path: PATH_PROP, old_text: { type: 'string', minLength: 1, maxLength: LIMITS.fileBytes }, new_text: { type: 'string', maxLength: LIMITS.fileBytes }, replace_all: { type: 'boolean' } }, required: ['path', 'old_text', 'new_text'], additionalProperties: false } },
  { name: 'repo_changes', description: 'List the files you have written or edited in this session.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'run_tests', description: 'Run this task\'s acceptance tests (chosen by HQ) inside the sandbox, with no network. Returns pass/fail counts and the end of the output.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
]);
export const TOOL_NAMES = Object.freeze(TOOLS.map(t => t.name));
// What Claude Code must report as its complete tool list at session start (anything else: HQ stops the session).
export const CLAUDE_TOOL_NAMES = Object.freeze(TOOL_NAMES.map(n => `mcp__${BROKER_SERVER}__${n}`));

// Validates one call's arguments against the task contract. Returns the normalized request the sandbox receives, or
// throws a refusal (the message is safe to return to Claude: it only echoes logical paths the caller sent).
export function authorize(name, args, contract) {
  if (!TOOL_NAMES.includes(name)) throw Error(`unknown tool "${String(name).slice(0, 60)}"`);
  if (args === undefined || args === null) args = {};
  if (typeof args !== 'object' || Array.isArray(args)) throw Error('arguments must be an object');
  const allowed = Object.keys(TOOLS.find(t => t.name === name).inputSchema.properties);
  const extra = Object.keys(args).filter(k => !allowed.includes(k));
  if (extra.length) throw Error(`unexpected argument(s): ${extra.slice(0, 5).map(k => k.slice(0, 40)).join(', ')}`);
  switch (name) {
    case 'repo_list': return { op: 'list', kind: 'read', path: readPath(args.path, { allowRoot: true }), depth: int(args.depth, 'depth', 1, 3, 1), max: LIMITS.listEntries };
    case 'repo_read': {
      const path = readPath(args.path);
      if (path.endsWith('/')) throw Error('repo_read takes a file path; use repo_list for directories');
      return { op: 'read', kind: 'read', path, offset: int(args.offset_line, 'offset_line', 1, 1_000_000, 1), lines: int(args.max_lines, 'max_lines', 1, 4000, 2000), maxBytes: LIMITS.readBytes };
    }
    case 'repo_search': {
      const query = str(args.query, 'query', { min: 2, max: 200 });
      if (/[\u0000-\u0008\u000b-\u001f]/.test(query)) throw Error('query has control characters');
      return { op: 'search', kind: 'read', query, path: readPath(args.path, { allowRoot: true }), max: int(args.max_results, 'max_results', 1, LIMITS.searchResults, 50) };
    }
    case 'repo_write': return { op: 'write', kind: 'write', path: writePath(args.path, contract.scope), content: str(args.content, 'content', { max: LIMITS.fileBytes }), scope: contract.scope };
    case 'repo_edit': {
      const req = { op: 'edit', kind: 'write', path: writePath(args.path, contract.scope), oldText: str(args.old_text, 'old_text', { min: 1, max: LIMITS.fileBytes }), newText: str(args.new_text, 'new_text', { max: LIMITS.fileBytes }), replaceAll: args.replace_all === undefined ? false : args.replace_all, scope: contract.scope };
      if (typeof req.replaceAll !== 'boolean') throw Error('replace_all must be true or false');
      return req;
    }
    case 'repo_changes': return { op: 'changes', kind: 'local' };
    case 'run_tests': return { op: 'test', kind: 'test', tests: [...contract.tests] };
  }
  throw Error('unreachable');
}
