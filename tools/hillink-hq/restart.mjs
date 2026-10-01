// restart_hq, HQ's side. HQ never restarts itself: it records the request in its journal, refuses when work is in
// flight, and hands the request to the external supervisor (supervisor.mjs) over the IPC channel the supervisor
// opened when it launched HQ. The supervisor owns the restart from there, so the request survives the connection that
// carried it closing. A restart reloads the code already on disk: it never pulls, edits, deploys or changes state,
// approvals, spend or credentials, and replaying the journal restores every objective, decision and gate unchanged.
import { randomUUID } from 'node:crypto';

export const RESTART_LIMITS = Object.freeze({ reasonMax: 300, ackTimeoutMs: 5_000 });

const reasonError = reason => (typeof reason !== 'string' || !reason.trim() ? '"reason" must be a non-empty string.' : reason.length > RESTART_LIMITS.reasonMax ? `"reason" must be at most ${RESTART_LIMITS.reasonMax} characters.` : null);

// Runs HQ is waiting on (a live worker process, or one HQ could not prove stopped). A restart would interrupt them.
export const busyRuns = engine => Object.values(engine.state.runs).filter(r => !r.endedAt);

// args come straight from the caller (connector or owner API): exactly { reason }, nothing else.
export async function requestRestart(engine, supervisor, args, { by, gitHead = null } = {}) {
  const keys = Object.keys(args ?? {});
  if (!args || typeof args !== 'object' || Array.isArray(args) || keys.some(k => k !== 'reason')) return { refused: 'restart_hq takes exactly one argument: reason.' };
  const invalid = reasonError(args.reason);
  if (invalid) return { refused: invalid };
  const reason = args.reason.trim();
  if (!supervisor) return { refused: 'HQ is not running under its supervisor, so it cannot be restarted remotely. Kyle starts it with start-hillink-hq.ps1.' };
  const busy = busyRuns(engine);
  if (busy.length) return { refused: `HQ has ${busy.length} run(s) in progress (${busy.map(r => `${engine.state.agents[r.agentId]?.name ?? r.agentId} on task ${String(r.taskId).slice(0, 8)}`).join(', ').slice(0, 300)}). A restart would interrupt them. Wait for them (wait_for_objective) or cancel the objective, then ask again.`, busy_runs: busy.length };
  const id = randomUUID();
  // Persisted before anything else happens: the intent is in the journal even if every later step fails.
  engine.emit('HQ_RESTART', { id, phase: 'requested', by, reason, pid: process.pid, gitHead });
  let ack;
  try { ack = await supervisor.request({ id, reason, by }); }
  catch (error) { ack = { accepted: false, reason: `the supervisor did not answer (${String(error.message).slice(0, 120)})` }; }
  if (!ack?.accepted) {
    engine.emit('HQ_RESTART', { id, phase: 'refused', by, reason: String(ack?.reason ?? 'refused').slice(0, 300), activeId: ack?.activeId ?? null });
    return { refused: `Restart not started: ${ack?.reason ?? 'refused by the supervisor'}`, restart_id: ack?.activeId ?? id, duplicate: Boolean(ack?.duplicate), retry_after_seconds: ack?.retryAfterSeconds ?? null };
  }
  // No new work from here: the supervisor shuts HQ down gracefully next.
  engine.draining = true;
  engine.emit('HQ_RESTART', { id, phase: 'accepted', by, reason });
  return {
    accepted: true, restart_id: id, status: 'RESTART_INITIATED',
    note: 'The supervisor is restarting HQ now. HQ (and this connector) will be unavailable for about 30 to 90 seconds; this request may lose its connection, which is expected. HQ is not healthy until it has restarted and passed its health check: call get_hq_state after about a minute. Its "restart" field reports this restart_id as completed or failed.',
  };
}

// The supervisor end of the IPC channel, from inside HQ. One request at a time; answers are matched by restart id.
export function ipcSupervisor(proc, { timeoutMs = RESTART_LIMITS.ackTimeoutMs } = {}) {
  const waiting = new Map();
  proc.on('message', m => { if (m?.type === 'restart-ack' && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
  return {
    request({ id, reason, by }) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiting.delete(id); reject(Error(`no answer within ${timeoutMs / 1000} s`)); }, timeoutMs);
        timer.unref?.();
        waiting.set(id, ack => { clearTimeout(timer); resolve(ack); });
        try { proc.send({ type: 'restart-request', id, reason, by }); } catch (error) { clearTimeout(timer); waiting.delete(id); reject(error); }
      });
    },
  };
}
