// Pass 4.5 repair: HQ's acceptance verdict comes only from a result authenticated with a per-run key that HQ sends
// to its own runner (sandbox/guest/hq-test-runner.mjs) on stdin. Text the tests print, TAP summaries and exit codes
// can all be forged by repository code in the same process, so none of them can make a run pass.
import crypto from 'node:crypto';

export const TEST_RUNNER = 'hq-test-runner.mjs';
export const newRunKey = () => crypto.randomBytes(32).toString('hex');
const mac = (key, payload) => crypto.hash('sha256', `${key}:${crypto.hash('sha256', `${key}:${payload}`)}`);
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const count = v => (Number.isSafeInteger(v) && v >= 0 ? v : NaN);

// Returns { green, passed, failed, skipped, todo, cancelled, reason }. green only when exactly one authenticated
// result exists, the run completed, the process exited cleanly, nothing failed, was skipped, todo or cancelled, and
// every acceptance file ran at least one passing test.
export function testVerdict(out, { key, tests, exitedOk }) {
  const lines = String(out ?? '').split(/\r?\n/).filter(l => l.startsWith('HQ-RESULT '));
  const valid = [];
  for (const line of lines) {
    const m = /^HQ-RESULT (\{.*\}) ([0-9a-f]{64})$/.exec(line);
    if (m && key && safeEqual(m[2], mac(key, m[1]))) valid.push(m[1]);
  }
  const fail = reason => ({ green: false, passed: 0, failed: 1, skipped: 0, todo: 0, cancelled: 0, reason, forgedLines: lines.length - valid.length });
  if (!valid.length) return fail(lines.length ? 'the test output contained results HQ did not issue (forged or altered); no authenticated result' : 'no authenticated result from HQ\'s test runner (the run ended early, crashed, hung or was tampered with)');
  if (valid.length > 1) return fail('more than one authenticated result');
  if (lines.length !== valid.length) return fail('the test output also contained results HQ did not issue (forged); failing closed');
  let r; try { r = JSON.parse(valid[0]); } catch { return fail('unreadable authenticated result'); }
  const n = { passed: count(r.passed), failed: count(r.failed), skipped: count(r.skipped), todo: count(r.todo), cancelled: count(r.cancelled) };
  if (r.v !== 1 || r.completed !== true || Object.values(n).some(Number.isNaN)) return fail('malformed authenticated result');
  const empty = tests.filter(t => !(count(r.files?.[t]?.passed) > 0));
  const reasons = [];
  if (!exitedOk) reasons.push('the test process did not exit cleanly');
  if (r.success !== true) reasons.push('node:test reported the run as unsuccessful (for example an uncaught error)');
  if (n.failed) reasons.push(`${n.failed} failed`);
  if (n.cancelled) reasons.push(`${n.cancelled} cancelled`);
  if (n.skipped || n.todo) reasons.push(`${n.skipped + n.todo} skipped or todo (acceptance tests must all run)`);
  if (empty.length) reasons.push(`no passing test ran in ${empty.join(', ')}`);
  if (!n.passed) reasons.push('no test passed');
  return { green: reasons.length === 0, ...n, empty, reason: reasons.join('; ') || null, forgedLines: lines.length - 1 };
}
