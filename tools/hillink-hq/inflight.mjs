// Progress evidence for HQ's own bounded operations in an implementation run (sandbox create/stage, the broker's
// run_tests, HQ's diff and acceptance tests). Claude is idle and silent while they run, and several take longer than
// the engine's progress window (run_tests up to 330 s, acceptance tests up to 5.5 min). The operation is HQ's own
// child process with its own timeout, so while it is pending HQ reports that it is still running; when it ends or
// times out the reports stop and the ordinary stall rule applies again.
export const INFLIGHT_PROGRESS_MS = 20_000;

export async function whileRunning(emit, label, work, { everyMs = INFLIGHT_PROGRESS_MS, now = Date.now } = {}) {
  const started = now();
  const timer = setInterval(() => {
    try { emit({ kind: 'PROGRESS', summary: `${label} still running (${Math.round((now() - started) / 1000)} s; bounded by its own timeout).`, inFlight: true }); } catch { /* run closed */ }
  }, everyMs);
  timer.unref?.();
  try { return await work; } finally { clearInterval(timer); }
}
