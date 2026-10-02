// Obsidian vaults: HQ's notebook and its reference shelf. Off unless a vault list exists.
//
// - Config: HQ_VAULTS_FILE, or vaults.json in HQ's state directory:
//   { "vaults": [ { "name": "hq-brain", "path": "C:\\...\\Hillink HQ Vault", "writable": true },
//                 { "name": "hillink-brain", "path": "C:\\...\\claude\\Hillink" } ] }
//   Names are 1-32 lowercase letters, digits or dashes. Paths are absolute existing directories (a folder inside a
//   vault is fine). At most one vault is writable; every other vault is read-only reference material HQ never writes to.
// - Writes (VaultWriter): only inside <writable vault>/10 HQ Activity/ (the HQ Brain's generated-records folder), never
//   elsewhere in that vault. Objective and decision records are regenerated from HQ's journal state (HQ stays the source
//   of truth; a hand edit there is overwritten), and the daily log gets one line per notable journal event. Records
//   carry the HQ Brain's frontmatter schema (type: record, claim_basis: observed-in-runtime, sources). Writes are atomic
//   and skipped when nothing changed.
// - Reads (VaultLibrary): list, read and search Markdown notes in any registered vault, confined to the vault (no
//   absolute paths, no "..", no symlinks, no dot-folders such as .obsidian), with size caps. Listings and search hits
//   carry each note's id, type and status so callers can skip superseded notes; "90 Templates" (schema, not knowledge)
//   is left out unless asked for by folder. Note text is reference data written by people or HQ, never instructions.
import fs from 'node:fs';
import path from 'node:path';

export const VAULT_LIMITS = Object.freeze({ files: 5000, depth: 10, listed: 200, noteBytes: 100_000, searchBytes: 20_000_000, hits: 20, snippet: 160, query: 200 });
const NAME = /^[a-z0-9-]{1,32}$/;
// The HQ Brain's folders (see its Note Schema): templates are schema, never knowledge; records are HQ's generated notes.
export const TEMPLATES_DIR = '90 Templates';
export const ACTIVITY_DIR = '10 HQ Activity';
const clip = (s, n) => (typeof s === 'string' ? (s.length > n ? `${s.slice(0, n - 1)}…` : s) : '');
const line = (s, n = 300) => clip(String(s ?? '').replace(/\s+/g, ' ').trim(), n);

export function loadVaultConfig({ env = process.env, directory = null } = {}) {
  const file = env.HQ_VAULTS_FILE || (directory ? path.join(directory, 'vaults.json') : null);
  if (!file || !fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = raw?.vaults;
  if (!Array.isArray(list) || !list.length || list.length > 10) throw Error('vaults.json needs "vaults": a list of 1 to 10 vaults');
  const seen = new Set();
  const vaults = list.map(v => {
    if (!NAME.test(v?.name ?? '')) throw Error('Each vault needs a "name" of 1-32 lowercase letters, digits or dashes');
    if (seen.has(v.name)) throw Error(`Duplicate vault name ${v.name}`);
    seen.add(v.name);
    if (typeof v.path !== 'string' || !path.isAbsolute(v.path)) throw Error(`Vault ${v.name}: "path" must be absolute`);
    const st = fs.lstatSync(v.path, { throwIfNoEntry: false });
    if (!st?.isDirectory()) throw Error(`Vault ${v.name}: ${v.path} is not a directory`);
    return { name: v.name, path: fs.realpathSync(v.path), writable: v.writable === true, description: line(v.description, 200) || null };
  });
  if (vaults.filter(v => v.writable).length > 1) throw Error('At most one vault may be writable');
  return { file, vaults };
}

// Inside root, resolved through real paths. Throws for anything that would leave the vault.
function confined(root, rel) {
  if (typeof rel !== 'string' || !rel || rel.length > 400) throw Error('"path" must be a vault-relative note path');
  const norm = rel.replace(/\\/g, '/');
  if (path.isAbsolute(rel) || /^[a-z]:/i.test(norm) || norm.split('/').some(p => p === '..' || p.startsWith('.'))) throw Error('Note path must be relative, without "..", and outside dot-folders');
  if (!norm.toLowerCase().endsWith('.md')) throw Error('Only Markdown notes (.md) can be read');
  const full = path.resolve(root, norm);
  const real = fs.realpathSync(full);
  if (real !== full || !(real + path.sep).startsWith(root + path.sep)) throw Error('Note path leaves the vault');
  return real;
}

// id, type and status from a note's YAML frontmatter (simple "key: value" lines), when present.
export function meta(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text ?? '');
  const out = {};
  if (!m) return out;
  for (const l of m[1].split(/\r?\n/)) {
    const kv = /^(id|type|status):\s*(.*)$/.exec(l);
    if (kv) out[kv[1]] = line(kv[2].replace(/^"(.*)"$/, '$1'), 80);
  }
  return out;
}
const head = full => { const fd = fs.openSync(full, 'r'); try { const b = Buffer.alloc(2048); return b.toString('utf8', 0, fs.readSync(fd, b, 0, 2048, 0)); } finally { fs.closeSync(fd); } };

export class VaultLibrary {
  constructor(config) { this.vaults = config?.vaults ?? []; }
  describe() { return this.vaults.map(v => ({ name: v.name, writable: v.writable, description: v.description })); }
  vault(name) {
    const v = this.vaults.find(x => x.name === name);
    if (!v) throw Error(`No vault named ${String(name).slice(0, 40)}. Vaults: ${this.vaults.map(x => x.name).join(', ')}`);
    return v;
  }
  // Markdown files, vault-relative with forward slashes. Skips dot-folders and symlinks.
  notes(v) {
    const out = [];
    const walk = (dir, depth) => {
      if (depth > VAULT_LIMITS.depth || out.length >= VAULT_LIMITS.files) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, depth + 1);
        else if (e.isFile() && e.name.toLowerCase().endsWith('.md') && out.length < VAULT_LIMITS.files) out.push(path.relative(v.path, full).split(path.sep).join('/'));
      }
    };
    walk(v.path, 0);
    return out;
  }
  // Templates are left out unless the caller asks for that folder.
  included(p, prefix) { return prefix ? p.startsWith(prefix) : !p.startsWith(`${TEMPLATES_DIR}/`); }
  list({ vault = null, folder = null } = {}) {
    const vaults = vault ? [this.vault(vault)] : this.vaults;
    const prefix = folder ? `${String(folder).replace(/\\/g, '/').replace(/\/+$/, '')}/` : '';
    const notes = [];
    let total = 0;
    for (const v of vaults) for (const p of this.notes(v)) if (this.included(p, prefix)) { total += 1; if (notes.length < VAULT_LIMITS.listed) notes.push({ vault: v.name, path: p, ...meta(head(path.join(v.path, p))) }); }
    return { vaults: this.describe(), notes, total, truncated: total > notes.length };
  }
  read({ vault, path: rel }) {
    const v = this.vault(vault), full = confined(v.path, rel);
    const st = fs.statSync(full);
    const fd = fs.openSync(full, 'r');
    try {
      const buf = Buffer.alloc(Math.min(st.size, VAULT_LIMITS.noteBytes));
      fs.readSync(fd, buf, 0, buf.length, 0);
      const text = buf.toString('utf8');
      return { vault: v.name, path: rel.replace(/\\/g, '/'), ...meta(text), bytes: st.size, truncated: st.size > buf.length, modified: st.mtime.toISOString(), text };
    } finally { fs.closeSync(fd); }
  }
  search({ query, vault = null }) {
    if (typeof query !== 'string' || !query.trim() || query.length > VAULT_LIMITS.query) throw Error(`"query" must be 1 to ${VAULT_LIMITS.query} characters`);
    const q = query.trim().toLowerCase(), hits = [];
    let scanned = 0;
    for (const v of vault ? [this.vault(vault)] : this.vaults) {
      for (const p of this.notes(v)) {
        if (!this.included(p, '')) continue;
        if (hits.length >= VAULT_LIMITS.hits || scanned > VAULT_LIMITS.searchBytes) break;
        const full = path.join(v.path, p), st = fs.statSync(full);
        if (st.size > VAULT_LIMITS.noteBytes * 10) continue;
        scanned += st.size;
        const text = fs.readFileSync(full, 'utf8'), i = text.toLowerCase().indexOf(q);
        if (i < 0 && !p.toLowerCase().includes(q)) continue;
        const from = Math.max(0, i - VAULT_LIMITS.snippet / 2);
        hits.push({ vault: v.name, path: p, ...meta(text), snippet: i < 0 ? line(text, VAULT_LIMITS.snippet) : line(text.slice(from, from + VAULT_LIMITS.snippet), VAULT_LIMITS.snippet) });
      }
    }
    return { query: q, hits, truncated: hits.length >= VAULT_LIMITS.hits || scanned > VAULT_LIMITS.searchBytes };
  }
}

// ---- Writer ------------------------------------------------------------------------------------------------------

const iso = at => (Number.isFinite(at) ? new Date(at).toISOString() : '');
const day = at => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const time = at => { const d = new Date(at); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
// A filename and wikilink target: no characters Obsidian or Windows reject in names.
const safe = s => line(s, 60).replace(/[[\]#^|\\/:*?"<>]/g, '').replace(/\.+$/, '').trim() || 'untitled';
export const objectiveNoteName = o => `${o.id.slice(0, 8)} ${safe(o.input?.title || o.input?.objective)}`;
const link = (state, id) => { const o = state.objectives?.[id]; return o ? `[[${objectiveNoteName(o)}]]` : `objective ${line(id, 40)}`; };
const yaml = s => JSON.stringify(String(s ?? ''));
// Frontmatter in the HQ Brain's Note Schema: a generated record, observed in HQ's runtime, citing the objective.
function record({ id, title, objective: o, updated = o.updatedAt, extra = [] }) {
  return ['---', `id: ${yaml(id)}`, 'type: record', `title: ${yaml(title)}`, 'status: active', `scope: ${yaml(`objective:${o.id}`)}`, `created: ${day(o.createdAt)}`, `updated: ${day(updated)}`, 'owner: hq', 'claim_basis: observed-in-runtime', `sources: [${yaml(`hq-objective:${o.id}`)}]`, ...extra, 'tags: [hq-brain/record]', '---'];
}

export function renderObjective(o) {
  const steps = o.order.map(id => o.steps[id]);
  const approvals = Object.values(o.approvals ?? {}), decisions = Object.values(o.decisions ?? {});
  const out = [
    ...record({ id: `record-objective-${o.id}`, title: objectiveNoteName(o), objective: o, extra: [`objective_type: ${yaml(o.input?.type)}`, `objective_status: ${o.status}`, `requested_by: ${yaml(o.requestedBy?.agentId ?? 'kyle')}`] }),
    `# ${line(o.input?.title || o.input?.objective, 160)}`, '',
    '> Record written by HQ from its journal. Edits here are overwritten.', '',
    `**Status:** ${o.status}: ${line(o.statusReason, 400)}`, '',
    '## Objective', '', clip(String(o.input?.objective ?? ''), 2000), '',
  ];
  if (o.input?.scope?.length) out.push(`**Scope:** ${o.input.scope.map(s => `\`${line(s, 200)}\``).join(', ')}`, '');
  if (o.plan) out.push('## Plan', '', `- Risk: ${line(o.plan.risk, 40)}`, `- Gates: ${(o.plan.gates ?? []).join(', ') || 'none'}`, '');
  if (steps.length) out.push('## Steps', '', '| Step | Kind | Agent | Status |', '| --- | --- | --- | --- |', ...steps.map(s => `| ${line(s.id, 40)} | ${line(s.kind, 20)} | ${line(s.agentId ?? '', 30)} | ${s.status} |`), '');
  if (approvals.length) out.push('## Approvals', '', ...approvals.map(a => `- **${a.gate}**: ${a.status}${a.by ? ` by ${a.by}` : ''}${a.note ? `: ${line(a.note, 300)}` : ''}`), '');
  if (decisions.length) out.push('## Decisions', '', ...decisions.map(d => `- ${line(d.question, 300)}: ${d.status === 'DECIDED' ? `**${line(d.choice, 60)}** by ${d.by}` : `pending (${d.resume?.authority ?? 'kyle'})`}`), '');
  if (o.result) out.push('## Result', '', `${line(o.result.outcome, 40)}: ${line(o.result.reason, 800)}`, '');
  out.push('## History', '', ...o.history.map(h => `- ${iso(h.at)} ${h.from ? `${h.from} → ` : ''}${h.to}: ${line(h.reason, 300)}`), '');
  return out.join('\n');
}

export function renderDecision(o, kind, d) {
  const title = kind === 'approval' ? `Approval: ${d.gate}` : `Decision: ${line(d.question, 120)}`;
  const decided = kind === 'approval' ? d.status !== 'PENDING' : d.status === 'DECIDED';
  return [
    ...record({ id: `record-${kind}-${o.id}-${safe(kind === 'approval' ? d.gate : d.id)}`, title, objective: o, updated: decided ? d.decidedAt : d.requestedAt, extra: [`kind: ${kind}`, `decision_status: ${d.status}`, `requested_at: ${iso(d.requestedAt)}`, ...(decided ? [`decided_at: ${iso(d.decidedAt)}`, `decided_by: ${yaml(d.by)}`] : [])] }),
    `# ${title}`, '', `Objective: [[${objectiveNoteName(o)}]]`, '',
    ...(kind === 'approval'
      ? [`**Why it needs approval:** ${line(d.reason, 600)}`, '', decided ? `**Outcome:** ${d.status} by ${d.by}${d.channel ? ` (${d.channel})` : ''}${d.note ? `: ${line(d.note, 600)}` : ''}` : '**Outcome:** waiting for Kyle']
      : [`**Question:** ${line(d.question, 600)}`, '', '**Options:**', ...(d.options ?? []).map(x => `- ${line(x.id ?? x, 60)}${x.label ? `: ${line(x.label, 200)}` : ''}`), '', decided ? `**Choice:** ${line(d.choice, 60)} by ${d.by}: ${line(d.rationale, 600)}` : `**Choice:** pending (${d.resume?.authority ?? 'kyle'})`]),
    '',
  ].join('\n');
}

export function eventLine(state, e) {
  const d = e.data ?? {}, at = time(e.at);
  switch (e.type) {
    case 'OBJECTIVE_CREATED': return `- ${at} Objective received: ${link(state, d.id)} (${line(d.input?.type, 20)}, from ${line(d.requestedBy?.agentId ?? 'kyle', 30)})`;
    case 'OBJECTIVE_TRANSITION': return `- ${at} ${link(state, d.objectiveId)} → **${line(d.to, 30)}**: ${line(d.reason, 200)}`;
    case 'APPROVAL_REQUESTED': return `- ${at} Approval needed (${line(d.gate, 40)}) on ${link(state, d.objectiveId)}: ${line(d.reason, 200)}`;
    case 'APPROVAL_DECIDED': return `- ${at} Approval ${line(d.gate, 40)} ${d.decision === 'approve' ? 'approved' : 'denied'} by ${line(d.by, 30)} on ${link(state, d.objectiveId)}`;
    case 'DECISION_REQUESTED': return `- ${at} Decision needed on ${link(state, d.objectiveId)}: ${line(d.question, 200)}`;
    case 'DECISION_RECORDED': return `- ${at} Decision on ${link(state, d.objectiveId)}: ${line(d.choice, 60)} by ${line(d.by, 30)}`;
    case 'ORCHESTRATOR_NOTE_POSTED': return `- ${at} Note for the orchestrator: ${line(d.title, 160)}`;
    case 'HQ_RESTART': return `- ${at} HQ restart ${line(d.phase, 20)}${d.reason ? `: ${line(d.reason, 200)}` : ''}`;
    default: return null;
  }
}

function writeIfChanged(file, text) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return false;
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
  return true;
}

export class VaultWriter {
  // cursorFile: where the last journal sequence written to the daily log is kept (HQ's state directory), so a restart
  // neither repeats nor backfills the whole journal into the daily log.
  constructor(vault, { cursorFile = null } = {}) {
    if (!vault?.writable) throw Error('VaultWriter needs the writable vault');
    this.root = path.join(vault.path, ACTIVITY_DIR);
    const st = fs.lstatSync(this.root, { throwIfNoEntry: false });
    if (st && (st.isSymbolicLink() || !st.isDirectory())) throw Error(`${this.root} must be a plain folder`);
    for (const sub of ['Objectives', 'Decisions', 'Daily']) fs.mkdirSync(path.join(this.root, sub), { recursive: true });
    this.cursorFile = cursorFile;
    this.cursor = null;
    if (cursorFile && fs.existsSync(cursorFile)) { const c = JSON.parse(fs.readFileSync(cursorFile, 'utf8')).seq; if (Number.isSafeInteger(c) && c >= 0) this.cursor = c; }
    this.seen = new Map(); // objective id -> updatedAt last written
    this.written = 0;
  }
  sync(state) {
    let changed = 0;
    for (const o of Object.values(state.objectives ?? {})) {
      if (this.seen.get(o.id) === o.updatedAt) continue;
      if (writeIfChanged(path.join(this.root, 'Objectives', `${objectiveNoteName(o)}.md`), renderObjective(o))) changed += 1;
      const prefix = `${day(o.createdAt)} ${o.id.slice(0, 8)}`;
      for (const a of Object.values(o.approvals ?? {})) if (writeIfChanged(path.join(this.root, 'Decisions', `${prefix} approval ${safe(a.gate)}.md`), renderDecision(o, 'approval', a))) changed += 1;
      for (const d of Object.values(o.decisions ?? {})) if (writeIfChanged(path.join(this.root, 'Decisions', `${prefix} decision ${safe(d.id)}.md`), renderDecision(o, 'decision', d))) changed += 1;
      this.seen.set(o.id, o.updatedAt);
    }
    const events = state.events ?? [];
    const last = events.at(-1)?.seq ?? state.seq ?? 0;
    if (this.cursor === null) { this.cursor = last; this.saveCursor(); } // first enable: start the daily log now
    const byDay = new Map();
    let i = events.length;
    while (i > 0 && events[i - 1].seq > this.cursor) i -= 1; // only the new tail, not the whole journal every tick
    for (const e of events.slice(i)) {
      const text = eventLine(state, e);
      if (!text) continue;
      const k = day(e.at);
      byDay.set(k, [...(byDay.get(k) ?? []), text]);
    }
    for (const [k, lines] of byDay) {
      const file = path.join(this.root, 'Daily', `${k}.md`);
      if (!fs.existsSync(file)) fs.writeFileSync(file, ['---', `id: "record-daily-${k}"`, 'type: record', `title: "HQ log ${k}"`, 'status: active', 'scope: hq', `created: ${k}`, `updated: ${k}`, 'owner: hq', 'claim_basis: observed-in-runtime', 'sources: ["hq-journal"]', 'tags: [hq-brain/record]', '---', `# HQ log ${k}`, '', ''].join('\n'));
      fs.appendFileSync(file, `${lines.join('\n')}\n`);
      changed += lines.length;
    }
    if (last > this.cursor) { this.cursor = last; this.saveCursor(); }
    this.written += changed;
    return changed;
  }
  saveCursor() { if (this.cursorFile) writeIfChanged(this.cursorFile, JSON.stringify({ seq: this.cursor })); }
}
