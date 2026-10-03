// Pass 3 test harness: the real engine, conductor, implementation runner (Pass 2.6 host mode, real git worktrees,
// real node --test run by HQ) and commit verifier, with deterministic fake agents in place of the model CLIs.
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Engine } from '../engine.mjs';
import { MemoryStore } from '../store.mjs';
import { ClaudeImplementer, ClaudeRouter } from '../implementation-runner.mjs';
import { Conductor } from '../orchestration/conductor.mjs';
import { CommitVerifier } from '../orchestration/verify.mjs';
import { reconcileInterrupted } from '../orchestration/recovery.mjs';
import { allowMetered, testGrant, subscriptionProbe } from './compute-helpers.mjs';

export const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
export function tempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-p3-repo-'));
  git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.email', 'hq@test'); git(dir, 'config', 'user.name', 'HQ Test');
  fs.writeFileSync(path.join(dir, 'README.md'), '# repo\n'); git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'base');
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  return dir;
}

export const handoffText = (obj, prose = 'Notes from the agent.') => `${prose}\n\n\`\`\`hq-handoff\n${JSON.stringify(obj)}\n\`\`\``;
export const investigation = (over = {}) => ({ kind: 'investigation', findings: ['greet() is missing.'], evidence: [{ file: 'README.md', lines: '1', detail: 'No greeting module exists.' }], files: ['README.md'], codePaths: ['caller -> greet'], suspectedCause: 'The greeting module was never written.', confidence: 'high', risks: [], recommendedAction: 'implement', proposedScope: ['sandbox/hq-implementation/'], proposedTests: ['sandbox/hq-implementation/greeting.test.mjs'], proposedAcceptanceCriteria: 'greet("Kyle") returns "Hello, Kyle!".', ...over });
export const review = (over = {}) => ({ kind: 'review', verdict: 'approve', findings: [], regressionRisks: [], recommendation: 'Ship it.', ...over });
// Which role HQ's framing gave the agent (the prompt is HQ-authored; quoted evidence cannot change it).
export const role = task => (/You are the investigator\./.test(task.description) ? 'investigate' : /Another agent disagrees/.test(task.description) ? 'rebuttal' : 'review');
export const rebuttal = (over = {}) => ({ kind: 'rebuttal', position: 'My position stands.', evidence: ['See the diff.'], concedes: false, remainingUncertainty: null, ...over });

// A fake read-only agent. script(task, n) -> { text } | { rateLimited: retryAt } | { fail } | { hang: true }
export function scriptedAgent(name, script) {
  const calls = [], runs = new Map();
  return {
    calls, runs,
    health: async () => ({ status: 'IDLE', detail: `fake ${name}` }),
    // Like the real CLI adapters, a review of an implementation commit reports which commit it was given to read
    // (step.snapshot overrides that record, to test HQ refusing a review of the wrong commit).
    acceptsReviewSource: () => true,
    async start({ task, runId, emit }) {
      if (task.operation !== 'review-repo' || task.safety !== 'local-read-only') throw Error(`${name} fake accepts read-only reviews only`);
      const n = calls.push({ task, runId });
      const step = script(task, n);
      const entry = { done: false, emit };
      runs.set(runId, entry);
      setImmediate(() => {
        if (entry.done) return;
        emit({ kind: 'ACK', summary: `${name} session started.`, pid: 4242 });
        if (task.reviewSource && step.snapshot !== null) emit({ kind: 'PROGRESS', summary: `Reviewing a snapshot of ${task.reviewSource.commit}.`, reviewSource: { source: 'hq-review-snapshot', commit: task.reviewSource.commit, base: task.reviewSource.base, branch: task.reviewSource.branch, tree: 'f'.repeat(40), files: 1, verified: true, ...step.snapshot } });
        if (step.hang) return;
        entry.done = true; runs.delete(runId);
        if (step.rateLimited) return emit({ kind: 'RATE_LIMITED', summary: `${name} reported a usage or rate limit.`, retryAt: step.rateLimited });
        if (step.fail) return emit({ kind: 'FAILED', summary: step.fail });
        emit({ kind: 'MODEL_RESULT', summary: step.text.slice(0, 1900), fullText: step.text });
        emit({ kind: 'COMPLETED', summary: `${name} finished the review.` });
      });
    },
    async cancel(runId) { const e = runs.get(runId); if (!e) return false; e.done = true; runs.delete(runId); try { e.emit({ kind: 'CANCELLED', summary: 'Worker termination confirmed.' }); } catch { /* closed */ } return true; },
    close() {},
  };
}

// A fake Claude Code process for implementation: files(written, n) -> { relPath: content } written into its cwd.
export function fakeClaude(files, { hang = () => false } = {}) {
  const spawned = [];
  const spawn = (command, args, opts) => {
    const child = new EventEmitter();
    child.pid = 99; child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    let closed = false;
    const close = (code, signal) => { if (!closed) { closed = true; child.emit('close', code, signal); } };
    child.kill = () => { setImmediate(() => close(null, 'SIGTERM')); return true; };
    const n = spawned.length + 1;
    child.stdin = Object.assign(new EventEmitter(), { written: '', end(text = '') {
      this.written += text;
      const written = this.written;
      setImmediate(() => {
        const line = o => child.stdout.emit('data', Buffer.from(JSON.stringify(o) + '\n'));
        line({ type: 'system', subtype: 'init', tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write'] });
        if (hang(written, n)) return;
        for (const [rel, content] of Object.entries(files(written, n))) { const f = path.join(opts.cwd, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); }
        line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write' }] } });
        line({ type: 'result', subtype: 'success', is_error: false, result: 'Done.', usage: { input_tokens: 10, output_tokens: 20 }, num_turns: 2, total_cost_usd: 0.01 });
        close(0, null);
      });
    } });
    spawned.push({ command, args, opts, child });
    return child;
  };
  return { spawn, spawned };
}

export const GREETING_TEST = "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { greet } from './greeting.mjs';\ntest('greets', () => assert.equal(greet('Kyle'), 'Hello, Kyle!'));\n";
export const greetingFiles = (dir = 'sandbox/hq-implementation', body = 'Hello') => ({ [`${dir}/greeting.mjs`]: `export const greet = name => \`${body}, \${name}!\`;\n`, [`${dir}/greeting.test.mjs`]: GREETING_TEST });

// routePreference: the Pass 3 scenarios script Codex as the investigator, so they keep Codex first for investigations.
// Production routes investigations to Claude first (routing.mjs); routing-default tests pass routePreference: null.
export function harness({ store = new MemoryStore(), repo = tempRepo(), codex, claudeReview, claudeFiles = () => greetingFiles(), claudeHang, limits = {}, alive = () => false, requireSandbox = false, clockStart = 1_000_000, metered = true, routePreference = { investigate: ['codex', 'claude'] } } = {}) {
  const clock = { t: clockStart };
  const worktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-p3-wt-'));
  const codexAgent = codex ?? scriptedAgent('Codex', () => ({ text: handoffText(review()) }));
  const claudeAgent = claudeReview ?? scriptedAgent('Claude', () => ({ text: handoffText(review()) }));
  const fake = fakeClaude(claudeFiles, { hang: claudeHang });
  const implementer = new ClaudeImplementer({ repoRoot: repo, worktreeRoot, claudeBin: 'claude-test.exe', spawn: fake.spawn, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: os.tmpdir() }, pulseMs: 50, unsandboxed: true, cliOptions: { platform: 'linux', graceMs: 30 } });
  const engine = new Engine({ store, adapters: { 'local-checks': { health: async () => ({ status: 'IDLE' }), start: async () => {}, cancel: async () => true }, 'cli-codex': codexAgent, 'cli-claude': new ClaudeRouter(claudeAgent, implementer) }, now: () => clock.t, config: { heartbeatMs: 600_000, progressMs: 600_000 } });
  engine.initialize();
  if (!engine.state.agents.claude.capabilities.includes('implement-repo') || engine.state.agents.claude.executionAdapter !== 'cli-claude') engine.configureAgent('claude', { capabilities: ['implement', 'review', 'review-repo', 'implement-repo'], executionAdapter: 'cli-claude' });
  if (engine.state.agents.codex.executionAdapter !== 'cli-codex') engine.configureAgent('codex', { capabilities: ['test', 'security', 'review', 'investigate', 'review-repo'], executionAdapter: 'cli-codex' });
  // Pass 4: Pass 3's implementation scenarios run with Kyle's spend authorization (the sandbox is metered). An engine
  // rebuilt after a restart re-reads the authorization from the journal; only the mode is configuration.
  if (metered) { if (Object.keys(engine.state.compute.authorizations).length) engine.config.computeMode = 'BUDGETED'; else allowMetered(engine); }
  const verifier = new CommitVerifier({ repoRoot: repo, requireSandbox });
  const conductor = new Conductor(engine, { verifier, limits, routePreference, recovery: () => reconcileInterrupted(engine, { alive, sandboxes: async () => [] }) });
  engine.conductor = conductor;
  const h = {
    engine, conductor, store, repo, worktreeRoot, fake, implementer, codex: codexAgent, claude: claudeAgent, clock, verifier,
    objective: id => engine.state.objectives[id],
    tasks: pred => Object.values(engine.state.tasks).filter(pred ?? (() => true)),
    stepTasks: id => Object.values(engine.state.tasks).filter(t => t.link?.objectiveId === id),
    async tick() { await engine.tick(); await conductor.tick(); },
    async drive(until, max = 600) {
      for (let i = 0; i < max; i++) {
        await h.tick();
        if (until()) return;
        await new Promise(r => setTimeout(r, 10));
      }
      throw Error(`drive timed out: ${JSON.stringify(Object.values(engine.state.objectives).map(o => [o.status, o.statusReason]))}`);
    },
    settled: id => () => ['COMPLETE', 'FAILED', 'CANCELLED', 'BLOCKED', 'AWAITING_APPROVAL', 'AWAITING_DECISION'].includes(engine.state.objectives[id]?.status),
    // Simulates a controller crash: nothing from this instance reaches the journal again.
    crash() { engine.store = { append() { throw Error('controller crashed'); }, read: () => [] }; },
  };
  return h;
}
