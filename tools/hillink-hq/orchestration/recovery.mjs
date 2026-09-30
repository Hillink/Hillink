// Pass 3 restart recovery. After a restart the engine parks every run whose end it never saw (Pass 2: never
// dispatch twice). This module tries to PROVE such a run has stopped, from facts HQ can check itself:
//   - every process id the run reported (its ACK / session evidence) no longer exists, and
//   - a sandboxed run's WSL instance is no longer registered (HQ destroys stale instances at start), or
//   - for the remote orchestrator: the HQ process that issued the request is gone, so no tool call it asked for
//     can ever execute.
// Only then is the run reconciled (RUN_RECONCILED, then CANCELLED evidence) and the step marked interrupted. If
// anything cannot be proven, the run stays parked with Pass 2's owner action. Nothing is assumed to have succeeded.

export const processAlive = pid => {
  if (!Number.isInteger(pid) || pid <= 0) return true; // unknown pid: cannot prove it stopped
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
};

// sandboxes() must list registered WSL instances or throw. There is deliberately no default: "no listing" is never
// "no sandbox" (found in the first real crash test, where a missing handle read as an empty list).
export async function probeTermination(engine, run, { alive = processAlive, sandboxes = async () => { throw Error('no sandbox handle'); }, controllerPid = process.pid } = {}) {
  const task = engine.state.tasks[run.taskId], agent = engine.state.agents[run.agentId];
  const ev = task.evidence.filter(e => e.runId === run.runId);
  const pids = [...new Set(ev.map(e => e.pid).filter(p => Number.isInteger(p) && p !== controllerPid))];
  const boxes = [...new Set(ev.map(e => (typeof e.sandbox === 'string' ? e.sandbox : e.sandbox?.name)).filter(Boolean))];
  const remote = agent?.executionAdapter === 'openai-orchestrator';
  if (!pids.length && !boxes.length && !remote) {
    // Dispatched but never acknowledged: nothing ever reported a process. Only safe if the run never acknowledged
    // and the adapter is HQ-local (its start() ran inside the dead controller).
    if (!run.acknowledgedAt && ['cli-claude', 'cli-codex', 'local-checks'].includes(agent?.executionAdapter)) return { stopped: false, evidence: 'Run was dispatched but reported no process id; termination cannot be proven.' };
    return { stopped: false, evidence: 'No process or sandbox evidence for this run.' };
  }
  const living = pids.filter(pid => alive(pid));
  if (living.length) return { stopped: false, evidence: `Process(es) ${living.join(', ')} still exist.` };
  if (boxes.length) {
    let listed;
    try { listed = await sandboxes(); if (!Array.isArray(listed)) throw Error('invalid listing'); }
    catch (error) { return { stopped: false, evidence: `Cannot list sandbox instances (${String(error.message).slice(0, 120)}); termination of ${boxes.join(', ')} is unproven.` }; }
    const left = boxes.filter(b => listed.includes(b));
    if (left.length) return { stopped: false, evidence: `Sandbox instance(s) ${left.join(', ')} still registered.` };
  }
  const parts = [];
  if (pids.length) parts.push(`process(es) ${pids.join(', ')} no longer exist`);
  if (boxes.length) parts.push(`sandbox(es) ${boxes.join(', ')} are unregistered`);
  if (remote) parts.push('the HQ controller that issued the OpenAI request has exited, so none of its tool calls can execute');
  return { stopped: true, evidence: `Termination proven by HQ after restart: ${parts.join('; ')}.` };
}

// Reconciles every parked, unresolved run whose termination can be proven. Returns what it did.
export async function reconcileInterrupted(engine, options = {}) {
  const done = [];
  for (const run of Object.values(engine.state.runs)) {
    if (run.endedAt) continue;
    const task = engine.state.tasks[run.taskId];
    if (!task || task.runId !== run.runId || !['BLOCKED', 'CANCELLED'].includes(task.stage)) continue;
    const probe = await probeTermination(engine, run, options);
    if (!probe.stopped) continue;
    engine.emit('RUN_RECONCILED', { runId: run.runId, taskId: task.id, evidence: probe.evidence, by: 'hq-probe' });
    engine.workerEvent(run.runId, { kind: 'CANCELLED', summary: probe.evidence });
    if (task.stage !== 'CANCELLED') engine.emit('TASK_PARKED', { taskId: task.id, reason: `Interrupted by an HQ restart; ${probe.evidence}`, ownerAction: task.link ? null : 'Create a new scoped task if the work is still needed.' });
    engine.adapters[engine.state.agents[run.agentId]?.executionAdapter]?.reconcile?.(run.runId);
    done.push({ runId: run.runId, taskId: task.id, evidence: probe.evidence });
  }
  return done;
}
