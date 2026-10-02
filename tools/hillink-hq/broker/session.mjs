// Pass 4.5: one broker session = one implementation run. It is bound to exactly one task, run, objective, sandbox
// instance and validated contract (write scope + tests), created by HQ when the sandbox is staged and closed by HQ
// when Claude's session ends, the run is cancelled, the deadline passes or a limit is hit. A closed session answers
// nothing, so a late, replayed or cross-task request can never touch a sandbox.
//
// Every operation is authorized in HQ (policy.mjs), executed INSIDE the sandbox (hq-broker.sh / hq-test.sh), and
// its output sanitized (sanitize.mjs) before Claude sees it. Operations run one at a time per session. The audit
// trail goes to HQ's journal as BROKER evidence: operation, logical path, outcome and sizes, never file contents.
import { authorize, visible, LIMITS } from './policy.mjs';
import { sanitizeText, refusalText } from './sanitize.mjs';
import { newRunKey, testVerdict } from '../test-verdict.mjs';
import { whileRunning } from '../inflight.mjs';

const READ_OPS = new Set(['list', 'read', 'search']);

export class BrokerSession {
  constructor({ id, taskId, runId, objectiveId = null, sandbox, box, contract, emit = () => {}, limits = LIMITS, now = Date.now }) {
    if (!sandbox || !box || !contract?.scope?.length || !contract?.tests?.length) throw Error('broker session needs a sandbox instance and a validated contract');
    Object.assign(this, { id, taskId, runId, objectiveId, sandbox, box, contract: Object.freeze({ scope: Object.freeze([...contract.scope]), tests: Object.freeze([...contract.tests]) }), emitRaw: emit, limits, now });
    this.state = 'OPEN';
    this.openedAt = now();
    this.counters = { calls: 0, reads: 0, writes: 0, testRuns: 0, refusals: 0, outBytes: 0 };
    this.written = new Map();
    this.abort = new AbortController();
    this.queue = Promise.resolve();
    this.audit('BROKER_CREATED', { outcome: 'open', summary: `Broker session opened for sandbox ${box}: write scope ${this.contract.scope.join(', ')}; tests ${this.contract.tests.join(', ')}.` });
  }
  audit(event, fields = {}) {
    const { summary, ...rest } = fields;
    try { this.emitRaw({ kind: 'BROKER', summary: (summary ?? `${event}${rest.op ? ` ${rest.op}` : ''}${rest.path ? ` ${rest.path}` : ''}${rest.outcome ? ` (${rest.outcome})` : ''}`).slice(0, 600), broker: { event, session: this.id.slice(0, 8), ...rest } }); } catch { /* run closed: nothing more to record */ }
  }
  close(reason = 'closed') {
    if (this.state === 'CLOSED') return false;
    this.state = 'CLOSED'; this.closedReason = reason;
    this.abort.abort();
    this.audit('BROKER_CLOSED', { outcome: reason, counters: { ...this.counters }, summary: `Broker session closed (${reason}): ${this.counters.calls} calls, ${this.counters.reads} reads, ${this.counters.writes} writes, ${this.counters.testRuns} test runs, ${this.counters.refusals} refused.` });
    return true;
  }
  changes() { return [...this.written.keys()].sort(); }
  // One MCP tools/call. Returns { text, isError } for Claude. Never throws.
  call(name, args) {
    const run = this.queue.then(() => this.execute(name, args));
    this.queue = run.catch(() => {});
    return run;
  }
  refuse(name, error, extra = {}) {
    this.counters.refusals++;
    this.audit('BROKER_REFUSED', { op: String(name).slice(0, 40), outcome: 'refused', reason: String(error?.message ?? error).slice(0, 200), ...extra });
    if (this.counters.refusals >= this.limits.refusals) this.close('too many refused calls');
    return { text: refusalText(error), isError: true };
  }
  async execute(name, args) {
    if (this.state !== 'OPEN') return { text: `HQ broker refused this call: the session is closed (${this.closedReason}).`, isError: true };
    if (this.now() - this.openedAt > this.limits.deadlineMs) { this.close('deadline reached'); return { text: 'HQ broker refused this call: the session deadline has passed.', isError: true }; }
    this.counters.calls++;
    if (this.counters.calls > this.limits.calls) { this.close('call limit reached'); return { text: 'HQ broker refused this call: call limit reached.', isError: true }; }
    let argBytes = 0;
    try { argBytes = Buffer.byteLength(JSON.stringify(args ?? {})); } catch { return this.refuse(name, 'arguments are not serializable'); }
    if (argBytes > this.limits.argBytes) return this.refuse(name, `arguments are larger than ${this.limits.argBytes} bytes`);
    let req;
    try { req = authorize(name, args, this.contract); } catch (error) { return this.refuse(name, error, { path: typeof args?.path === 'string' ? args.path.slice(0, 200) : undefined }); }
    if (req.kind === 'read' && ++this.counters.reads > this.limits.reads) return this.refuse(name, 'read limit reached for this session');
    if (req.kind === 'write' && ++this.counters.writes > this.limits.writes) return this.refuse(name, 'write limit reached for this session');
    if (req.kind === 'test' && ++this.counters.testRuns > this.limits.testRuns) return this.refuse(name, 'test run limit reached for this session');
    try {
      let text;
      if (req.op === 'changes') text = this.written.size ? [...this.written].map(([p, w]) => `${p} (${w.bytes} bytes${w.created ? ', new' : ''})`).join('\n') : 'No files written yet.';
      else if (req.op === 'test') text = await this.runTests(req);
      else {
        if (req.kind === 'write') this.audit('BROKER_WRITE_REQUESTED', { op: req.op, path: req.path, outcome: 'requested', bytes: Buffer.byteLength(req.content ?? req.newText ?? '') });
        // Listings and searches ask the sandbox for extra entries, because HQ drops the ones its read policy hides.
        const sent = req.op === 'search' ? { ...req, max: Math.min(req.max * 5, 500) } : req.op === 'list' ? { ...req, max: Math.min(req.max * 2, 1000) } : req;
        const { stdout } = await this.sandbox.exec(this.box, 'hq-broker.sh', [], { input: JSON.stringify(sent), timeoutMs: 60_000, maxBytes: 4 * 1024 * 1024, signal: this.abort.signal });
        let out; try { out = JSON.parse(stdout); } catch { throw Error('the sandbox returned an unreadable reply'); }
        if (!out || typeof out.ok !== 'boolean') throw Error('the sandbox returned an unreadable reply');
        if (!out.ok) { if (req.kind === 'write') this.audit('BROKER_WRITE_REFUSED', { op: req.op, path: req.path, outcome: 'refused in sandbox', reason: String(out.error).slice(0, 200) }); return this.refuse(name, String(out.error ?? 'refused'), { path: req.path, where: 'sandbox' }); }
        if (req.kind === 'write') {
          // The sandbox reports the logical path it wrote; HQ checks it is the one it authorized.
          if (out.path !== req.path) throw Error('sandbox reported a different path than the one authorized');
          this.written.set(req.path, { bytes: out.bytes, created: out.created || this.written.get(req.path)?.created || false });
          this.audit('BROKER_WRITE_ALLOWED', { op: req.op, path: req.path, outcome: 'written', bytes: out.bytes });
        } else this.audit(req.op === 'search' ? 'BROKER_SEARCH' : 'BROKER_READ', { op: req.op, path: req.path || '.', outcome: 'ok' });
        text = req.op === 'list' ? this.formatList(req, out) : req.op === 'search' ? this.formatSearch(req, out) : out.text;
      }
      const clean = sanitizeText(text, { maxBytes: this.limits.readBytes + 4096 });
      this.counters.outBytes += Buffer.byteLength(clean);
      if (this.counters.outBytes > this.limits.totalOutBytes) { this.close('output limit reached'); return { text: 'HQ broker refused this call: output limit reached for this session.', isError: true }; }
      return { text: clean, isError: false };
    } catch (error) {
      if (this.state !== 'OPEN') return { text: `HQ broker refused this call: the session is closed (${this.closedReason}).`, isError: true };
      return this.refuse(name, /cancel/i.test(error.message) ? 'cancelled' : `the sandbox could not complete it (${String(error.message).split(':')[0].slice(0, 80)})`);
    }
  }
  // HQ's read policy decides what a listing or search may show (policy.visible), the same rule as repo_read.
  formatList(req, out) {
    if (!Array.isArray(out.entries)) throw Error('the sandbox returned an unreadable listing');
    let hidden = 0;
    const shown = [];
    for (const e of out.entries) {
      if (typeof e?.path !== 'string' || !visible(e.path, { dir: e.type === 'dir' })) { hidden++; continue; }
      if (shown.length >= req.max) break;
      shown.push(e.type === 'dir' ? `${e.path}/` : e.type === 'file' ? `${e.path} (${Number(e.size) || 0} bytes)` : `${e.path} [${e.type === 'link' ? 'link' : 'other'}, not accessible]`);
    }
    if (hidden) this.audit('BROKER_HIDDEN', { op: 'list', path: req.path || '.', outcome: 'hidden by read policy', count: hidden });
    const more = shown.length >= req.max || out.truncated ? `\n[listing stopped at ${req.max} entries]` : '';
    return shown.length ? shown.join('\n') + more : '(empty directory)';
  }
  formatSearch(req, out) {
    if (!Array.isArray(out.hits)) throw Error('the sandbox returned unreadable search results');
    let hidden = 0;
    const shown = [];
    for (const h of out.hits) {
      if (typeof h?.path !== 'string' || !visible(h.path)) { hidden++; continue; }
      if (shown.length >= req.max) break;
      shown.push(`${h.path}:${Number(h.line) || 0}: ${String(h.text ?? '').slice(0, 220)}`);
    }
    if (hidden) this.audit('BROKER_HIDDEN', { op: 'search', path: req.path || '.', outcome: 'hidden by read policy', count: hidden });
    return shown.length ? shown.join('\n') + (shown.length >= req.max || out.truncated ? `\n[stopped at ${req.max} matches]` : '') : 'No matches.';
  }
  async runTests(req) {
    this.audit('SANDBOX_TEST_STARTED', { op: 'test', outcome: 'started', tests: req.tests });
    let out = '', ok = true;
    // HQ's runner with a fresh run key (test-verdict.mjs): what the tests print cannot change the counts HQ reports.
    const key = newRunKey(), strip = req.tests.some(t => t.endsWith('.ts')) ? ['--experimental-strip-types'] : [];
    try { out = (await whileRunning(this.emitRaw, 'Sandbox test run (run_tests)', this.sandbox.exec(this.box, 'hq-test.sh', [...strip, ...req.tests], { input: `${key}\n`, timeoutMs: 330_000, maxBytes: 4 * 1024 * 1024, signal: this.abort.signal }), { boundMs: 330_000 })).stdout; }
    catch (error) { if (this.state !== 'OPEN' || /cancel/i.test(error.message)) throw error; ok = false; out = `${error.stdout ?? ''}\n${error.stderr ?? ''}`; }
    const v = testVerdict(out, { key, tests: req.tests, exitedOk: ok });
    this.audit('SANDBOX_TEST_COMPLETED', { op: 'test', outcome: v.green ? 'passed' : 'failed', passed: v.passed, failed: v.failed, reason: v.reason ? String(v.reason).slice(0, 200) : undefined });
    const tail = out.split('\n').filter(l => !/^\s*$/.test(l) && !l.startsWith('HQ-RESULT ')).slice(-60).join('\n');
    return `Tests run by HQ in the sandbox (no network): ${v.passed} passed, ${v.failed} failed.${v.green ? '' : ` Not accepted: ${v.reason}.`} This is information for you; HQ runs the acceptance tests again itself after you finish.\n--- end of output ---\n${tail}`;
  }
}
