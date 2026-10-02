// HQ's own bounded operations in a run (sandbox check/create/stage/teardown, the broker's run_tests, HQ's diff and
// acceptance tests). The worker is legitimately silent while they run and several take longer than the engine's
// progress window. Each is HQ's own child process with its own hard timeout, so HQ declares it as a quiet phase
// (engine.mjs, quietState) bounded by that timeout plus a margin: RUNNING while it is pending and the run's liveness
// pulse continues, STALLED if it outlives its bound (the timeout itself failed), and closed on every outcome.
export const PHASE_MARGIN_MS = 30_000;
let seq = 0;

export async function whileRunning(emit, label, work, { boundMs }) {
  if (!Number.isInteger(boundMs) || boundMs <= 0) throw Error('whileRunning needs the operation\'s own hard timeout');
  const id = `hq-op:${++seq}`;
  try { emit({ kind: 'PROGRESS', summary: `${label} started (HQ step, hard limit ${Math.round(boundMs / 1000)} s).`, inFlight: true, phases: [{ id, state: 'begin', reason: label.slice(0, 160), boundMs: boundMs + PHASE_MARGIN_MS }] }); } catch { /* run closed */ }
  try { return await work; }
  finally { try { emit({ kind: 'PROGRESS', summary: `${label} finished.`, inFlight: true, phases: [{ id, state: 'end' }] }); } catch { /* run closed */ } }
}
