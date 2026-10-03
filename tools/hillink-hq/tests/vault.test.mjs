// Obsidian vaults: config validation, confined read-only access, HQ's notes written only under HQ/ in the one writable
// vault, the ingress read tools, and createHQ wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { loadVaultConfig, VaultLibrary, VaultWriter, objectiveNoteName, meta } from '../vault.mjs';
import { startIngress, INGRESS_TOOLS, VAULT_TOOLS } from '../ingress/mcp-ingress.mjs';
import { createHQ } from '../server.mjs';
import { MemoryStore } from '../store.mjs';
import { harness } from './orchestration-harness.mjs';

const TOKEN = randomBytes(32).toString('base64url');
const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hq-vault-')));
function vaults() {
  const base = tmp(), hq = path.join(base, 'hq'), ref = path.join(base, 'ref');
  fs.mkdirSync(path.join(hq, 'Runbooks'), { recursive: true });
  fs.mkdirSync(path.join(ref, '.obsidian'), { recursive: true });
  fs.mkdirSync(path.join(ref, 'Product'), { recursive: true });
  fs.writeFileSync(path.join(hq, 'Runbooks', 'Restart HQ.md'), '# Restart HQ\nUse restart_hq.\n');
  fs.writeFileSync(path.join(hq, 'Mine.md'), 'Kyle wrote this.\n');
  fs.writeFileSync(path.join(ref, 'Product', 'Pricing.md'), '# Pricing\nCreators pay nothing; businesses subscribe.\n');
  fs.writeFileSync(path.join(ref, '.obsidian', 'secret.md'), 'hidden\n');
  fs.writeFileSync(path.join(ref, 'image.png'), 'png');
  fs.writeFileSync(path.join(base, 'outside.md'), 'outside\n');
  const file = path.join(base, 'vaults.json');
  fs.writeFileSync(file, JSON.stringify({ vaults: [{ name: 'hq', path: hq, writable: true }, { name: 'ref', path: ref, description: 'reference' }] }));
  return { base, hq, ref, file };
}

test('V1. config: absent means off; bad names, relative paths, missing folders and two writable vaults are refused', () => {
  const v = vaults();
  assert.equal(loadVaultConfig({ env: {}, directory: tmp() }), null);
  const c = loadVaultConfig({ env: { HQ_VAULTS_FILE: v.file } });
  assert.deepEqual(c.vaults.map(x => [x.name, x.writable]), [['hq', true], ['ref', false]]);
  const bad = list => { fs.writeFileSync(v.file, JSON.stringify({ vaults: list })); return () => loadVaultConfig({ env: { HQ_VAULTS_FILE: v.file } }); };
  assert.throws(bad([{ name: 'Bad Name', path: v.hq }]), /name/);
  assert.throws(bad([{ name: 'a', path: 'relative/dir' }]), /absolute/);
  assert.throws(bad([{ name: 'a', path: path.join(v.base, 'nope') }]), /not a directory/);
  assert.throws(bad([{ name: 'a', path: v.hq, writable: true }, { name: 'b', path: v.ref, writable: true }]), /At most one/);
  assert.throws(bad([{ name: 'a', path: v.hq }, { name: 'a', path: v.ref }]), /Duplicate/);
  assert.throws(bad([]), /1 to 10/);
  // vaults.json in the state directory is the default location
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'vaults.json'), JSON.stringify({ vaults: [{ name: 'ref', path: v.ref }] }));
  assert.equal(loadVaultConfig({ env: {}, directory: dir }).vaults[0].writable, false);
});

test('V2. library: lists, reads and searches Markdown only, inside the vault, skipping dot-folders', () => {
  const v = vaults(), lib = new VaultLibrary(loadVaultConfig({ env: { HQ_VAULTS_FILE: v.file } }));
  const all = lib.list();
  assert.deepEqual(all.notes.map(n => `${n.vault}:${n.path}`).sort(), ['hq:Mine.md', 'hq:Runbooks/Restart HQ.md', 'ref:Product/Pricing.md']);
  assert.deepEqual(lib.list({ vault: 'hq', folder: 'Runbooks' }).notes.map(n => n.path), ['Runbooks/Restart HQ.md']);
  assert.match(lib.read({ vault: 'ref', path: 'Product/Pricing.md' }).text, /Creators pay nothing/);
  assert.match(lib.read({ vault: 'ref', path: 'Product\\Pricing.md' }).text, /Pricing/, 'Windows separators accepted');
  for (const p of ['../outside.md', '..\\outside.md', path.join(v.base, 'outside.md'), 'C:/Windows/win.ini', '.obsidian/secret.md', 'image.png', '', 'Product/../../outside.md']) assert.throws(() => lib.read({ vault: 'ref', path: p }), /relative|Markdown|vault-relative/, p);
  assert.throws(() => lib.read({ vault: 'nope', path: 'x.md' }), /No vault named nope/);
  assert.throws(() => lib.read({ vault: 'ref', path: 'Missing.md' }), /ENOENT/);
  const s = lib.search({ query: 'CREATORS' });
  assert.deepEqual(s.hits.map(h => h.path), ['Product/Pricing.md']);
  assert.match(s.hits[0].snippet, /Creators pay nothing/);
  assert.equal(lib.search({ query: 'restart hq' }).hits[0].path, 'Runbooks/Restart HQ.md', 'names match too');
  assert.equal(lib.search({ query: 'hidden' }).hits.length, 0, 'dot-folders are never searched');
  assert.throws(() => lib.search({ query: '  ' }), /query/);
});

test('V2b. library: notes carry frontmatter id, type and status; templates stay out unless asked for', () => {
  const v = vaults(), lib = new VaultLibrary(loadVaultConfig({ env: { HQ_VAULTS_FILE: v.file } }));
  fs.mkdirSync(path.join(v.hq, '90 Templates'));
  fs.writeFileSync(path.join(v.hq, '90 Templates', 'Decision Template.md'), '---\nid: "{{id}}"\ntype: decision\n---\n# routing template\n');
  fs.mkdirSync(path.join(v.hq, '04 Decisions'));
  fs.writeFileSync(path.join(v.hq, '04 Decisions', '2026-10-02 Routing.md'), '---\r\nid: decision-20261002-routing\r\ntype: decision\r\nstatus: superseded\r\n---\r\n# Routing\r\nOld routing rule.\r\n');
  const listed = lib.list({ vault: 'hq' }).notes;
  assert.ok(!listed.some(n => n.path.startsWith('90 Templates/')), 'templates are not knowledge');
  assert.deepEqual(listed.find(n => n.path === '04 Decisions/2026-10-02 Routing.md'), { vault: 'hq', path: '04 Decisions/2026-10-02 Routing.md', id: 'decision-20261002-routing', type: 'decision', status: 'superseded' });
  assert.equal(lib.list({ vault: 'hq', folder: '90 Templates' }).notes.length, 1, 'asked for by folder');
  assert.deepEqual(lib.search({ query: 'routing' }).hits.map(h => [h.path, h.status]), [['04 Decisions/2026-10-02 Routing.md', 'superseded']]);
  assert.equal(lib.read({ vault: 'hq', path: '04 Decisions/2026-10-02 Routing.md' }).status, 'superseded');
  assert.deepEqual(meta('no frontmatter'), {});
});

test('V3. library: a symlink out of the vault is neither listed nor readable', { skip: process.platform === 'win32' && 'symlinks need privileges on Windows' }, () => {
  const v = vaults(), lib = new VaultLibrary(loadVaultConfig({ env: { HQ_VAULTS_FILE: v.file } }));
  fs.symlinkSync(path.join(v.base, 'outside.md'), path.join(v.ref, 'link.md'));
  assert.ok(!lib.list({ vault: 'ref' }).notes.some(n => n.path === 'link.md'));
  assert.throws(() => lib.read({ vault: 'ref', path: 'link.md' }), /leaves the vault/);
});

test('V4. writer: objective, approval, decision and daily-log records under 10 HQ Activity only; no duplicates across restarts', async () => {
  const v = vaults(), config = loadVaultConfig({ env: { HQ_VAULTS_FILE: v.file } }), cursorFile = path.join(tmp(), 'vault-sync.json');
  const h = harness();
  const before = new VaultWriter(config.vaults[0], { cursorFile });
  before.sync(h.engine.state); // first enable: the daily log starts now
  const id = h.conductor.submit({ objective: 'Investigate the pricing page: why is it slow?', type: 'investigate', title: 'Pricing page [slow] / perf?' });
  h.engine.emit('APPROVAL_REQUESTED', { objectiveId: id, gate: 'merge', reason: 'Merging needs Kyle.', stage: 'merge' });
  h.engine.emit('APPROVAL_DECIDED', { objectiveId: id, gate: 'merge', decision: 'approve', by: 'kyle', note: 'Fine.', channel: 'command-center' });
  h.engine.emit('DECISION_REQUESTED', { objectiveId: id, decisionId: 'd1', question: 'Which reviewer?', options: [{ id: 'codex', label: 'Codex' }, { id: 'claude', label: 'Claude' }], resume: { type: 'review-fallback' } });
  h.engine.emit('DECISION_RECORDED', { objectiveId: id, decisionId: 'd1', choice: 'codex', rationale: 'Read-only reviewer.', by: 'chatgpt' });
  const writer = new VaultWriter(config.vaults[0], { cursorFile });
  assert.ok(writer.sync(h.engine.state) > 0);
  const o = h.engine.state.objectives[id], name = objectiveNoteName(o);
  assert.equal(name, `${id.slice(0, 8)} Pricing page slow  perf`);
  const note = fs.readFileSync(path.join(v.hq, '10 HQ Activity', 'Objectives', `${name}.md`), 'utf8');
  // HQ Brain note schema: a generated record citing the objective
  assert.deepEqual(meta(note), { id: `record-objective-${id}`, type: 'record', status: 'active' });
  for (const field of ['owner: hq', 'claim_basis: observed-in-runtime', `sources: ["hq-objective:${id}"]`, `scope: "objective:${id}"`, 'objective_status: QUEUED', 'tags: [hq-brain/record]']) assert.ok(note.includes(field), field);
  assert.match(note, /\*\*merge\*\*: APPROVED by kyle: Fine\./);
  assert.match(note, /Which reviewer\?: \*\*codex\*\* by chatgpt/);
  const decisions = fs.readdirSync(path.join(v.hq, '10 HQ Activity', 'Decisions'));
  assert.equal(decisions.length, 2);
  assert.ok(decisions.some(f => f.endsWith('approval merge.md')) && decisions.some(f => f.endsWith('decision d1.md')));
  const daily = fs.readdirSync(path.join(v.hq, '10 HQ Activity', 'Daily'));
  assert.equal(daily.length, 1);
  const log = fs.readFileSync(path.join(v.hq, '10 HQ Activity', 'Daily', daily[0]), 'utf8');
  assert.match(log, new RegExp(`Objective received: \\[\\[${name}\\]\\]`));
  assert.match(log, /Approval merge approved by kyle/);
  assert.match(log, /Decision on .* codex by chatgpt/);
  // A restarted HQ (new writer, same cursor) neither repeats nor backfills the log; unchanged notes are not rewritten.
  const restarted = new VaultWriter(config.vaults[0], { cursorFile });
  assert.equal(restarted.sync(h.engine.state), 0);
  assert.equal(fs.readFileSync(path.join(v.hq, '10 HQ Activity', 'Daily', daily[0]), 'utf8'), log);
  h.engine.emit('ORCHESTRATOR_NOTE_POSTED', { id: 'n1', title: 'Resume the pricing sequence', body: 'x', by: 'kyle' });
  assert.equal(restarted.sync(h.engine.state), 1);
  assert.match(fs.readFileSync(path.join(v.hq, '10 HQ Activity', 'Daily', daily[0]), 'utf8'), /Note for the orchestrator: Resume the pricing sequence\n$/);
  // Kyle's own notes and the read-only vault are untouched; HQ wrote only under HQ/.
  assert.equal(fs.readFileSync(path.join(v.hq, 'Mine.md'), 'utf8'), 'Kyle wrote this.\n');
  assert.deepEqual(fs.readdirSync(v.hq).sort(), ['10 HQ Activity', 'Mine.md', 'Runbooks']);
  assert.deepEqual(fs.readdirSync(v.ref).sort(), ['.obsidian', 'Product', 'image.png']);
  assert.throws(() => new VaultWriter(config.vaults[1]), /writable/);
});

test('V5. ingress: vault tools appear only with vaults, are read-only, and refuse escapes', async () => {
  const v = vaults(), lib = new VaultLibrary(loadVaultConfig({ env: { HQ_VAULTS_FILE: v.file } })), h = harness();
  const rpc = async (base, method, params) => (await fetch(`${base}/mcp/${TOKEN}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json();
  const plain = await startIngress({ engine: h.engine, token: TOKEN, port: 0 });
  try {
    assert.deepEqual((await rpc(plain.base, 'tools/list')).result.tools.map(t => t.name).sort(), [...INGRESS_TOOLS].sort());
    assert.equal((await rpc(plain.base, 'tools/call', { name: 'read_vault_note', arguments: { vault: 'hq', path: 'Mine.md' } })).error.code, -32602);
  } finally { await plain.close(); }
  const ing = await startIngress({ engine: h.engine, token: TOKEN, port: 0, vaults: lib });
  try {
    const listed = (await rpc(ing.base, 'tools/list')).result.tools;
    assert.deepEqual(listed.map(t => t.name).sort(), [...INGRESS_TOOLS, ...VAULT_TOOLS].sort());
    assert.ok(listed.filter(t => VAULT_TOOLS.includes(t.name)).every(t => t.annotations.readOnlyHint));
    assert.match((await rpc(ing.base, 'initialize', {})).result.instructions, /list_vault_notes/);
    const call = async (name, args) => { const r = (await rpc(ing.base, 'tools/call', { name, arguments: args })).result; return { isError: r.isError, value: JSON.parse(r.content[0].text) }; };
    const list = await call('list_vault_notes', {});
    assert.equal(list.isError, false);
    assert.deepEqual(list.value.vaults.map(x => [x.name, x.writable]), [['hq', true], ['ref', false]]);
    assert.equal((await call('read_vault_note', { vault: 'ref', path: 'Product/Pricing.md' })).value.text.includes('Creators'), true);
    assert.equal((await call('search_vault_notes', { query: 'restart_hq' })).value.hits[0].path, 'Runbooks/Restart HQ.md');
    for (const args of [{ vault: 'ref', path: '../outside.md' }, { vault: 'ref', path: '.obsidian/secret.md' }, { vault: 'ref', path: 'Product/Pricing.md', extra: 'x' }, { vault: 'ref', path: 5 }]) {
      const r = await call('read_vault_note', args);
      assert.equal(r.isError, true, JSON.stringify(args));
      assert.ok(r.value.error);
    }
  } finally { await ing.close(); }
});

test('V6. createHQ: vaults.json turns the notebook on, a broken one leaves HQ running with the reason', async () => {
  const v = vaults();
  const hq = await createHQ({ port: 0, store: new MemoryStore(), intervalMs: 20, env: { HQ_VAULTS_FILE: v.file } });
  try {
    assert.match(hq.vaults().status, /^ENABLED: hq \(HQ writes here\), ref \(read-only\)$/);
    const id = hq.engine.conductor.submit({ objective: 'Investigate X.', type: 'investigate', title: 'Investigate X' });
    const file = path.join(v.hq, '10 HQ Activity', 'Objectives', `${id.slice(0, 8)} Investigate X.md`);
    for (let i = 0; i < 100 && !fs.existsSync(file); i++) await new Promise(r => setTimeout(r, 20));
    assert.ok(fs.existsSync(file), 'HQ wrote the objective note on its tick');
    const session = await fetch(`${hq.origin}/api/session`, { headers: { 'x-hq-client': 'command-center' } }).then(r => r.json());
    const headers = { 'x-hq-client': 'command-center', authorization: `Bearer ${session.token}` };
    const state = await fetch(`${hq.origin}/api/state`, { headers }).then(r => r.json());
    assert.match(state.health.vaults, /^ENABLED/);
    assert.deepEqual((await fetch(`${hq.origin}/api/vaults`, { headers }).then(r => r.json())).vaults.map(x => x.name), ['hq', 'ref']);
  } finally { await hq.close(); }
  fs.writeFileSync(v.file, '{"vaults": [{"name": "x", "path": "relative"}]}');
  const broken = await createHQ({ port: 0, store: new MemoryStore(), intervalMs: 20, env: { HQ_VAULTS_FILE: v.file } });
  try { assert.match(broken.vaults().status, /^UNAVAILABLE: .*absolute/); } finally { await broken.close(); }
  const off = await createHQ({ port: 0, store: new MemoryStore(), intervalMs: 20, env: {} });
  try { assert.equal(off.vaults().status, 'DISABLED'); } finally { await off.close(); }
});
