// Pass 3 restart recovery. After a restart the engine parks every run whose end it never saw (Pass 2: never
// dispatch twice). This module tries to PROVE such a run has stopped, from facts HQ can check itself:
//   - every process id the run reported (its ACK / session evidence) no longer exists, and
//   - a sandboxed run's WSL instance is no longer registered (HQ destroys stale instances at start), or
//   - for the remote orchestrator: the HQ process that issued the request is gone, so no tool call it asked for
//     can ever execute.
// Only then is the run reconciled (RUN_RECONCILED, then CANCELLED evidence) and the step marked interrupted. If
// anything cannot be proven, the run stays parked with Pass 2's owner action. Nothing is assumed to have succeeded.

// Pass 4.5 repair: on the split-broker route Claude Code runs on the HOST, outside the sandbox, so an unregistered
// sandbox proves nothing about it. HQ records a marker (the run's private MCP config path, which appears on Claude's
// command line) before spawning it and the pid right after. Recovery then needs the pid to be gone, or, when the pid
// was never recorded (a crash in between), a process-table scan that finds no process carrying the marker. Where
// the process table cannot be read (Windows, no /proc) the run stays parked.
export async function hostProcessesWith(markers, { procDir = '/proc', fsImpl } = {}) {
  const fs = fsImpl ?? (await import('node:fs')).default;
  if (process.platform !== 'linux' && !fsImpl) return null;
  let names; try { names = fs.readdirSync(procDir).filter(n => /^[0-9]+$/.test(n)); } catch { return null; }
  const found = [];
  for (const n of names) {
    let cmd; try { cmd = fs.readFileSync(`${procDir}/${n}/cmdline`, 'utf8'); } catch { continue; } // exited meanwhile
    if (markers.some(m => cmd.split('\0').includes(m))) found.push(Number(n));
  }
  return found;
}

export const processAlive = pid => {
  if (!Number.isInteger(pid) || pid <= 0) return true; // unknown pid: cannot prove it stopped
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
};

// sandboxes() must list registered WSL instances or throw. There is deliberately no default: "no listing" is never
// "no sandbox" (found in the first real crash test, where a missing handle read as an empty list).
export async function probeTermination(engine, run, { alive = processAlive, sandboxes = async () => { throw Error('no sandbox handle'); }, controllerPid = process.pid, hostScan = hostProcessesWith } = {}) {
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
  const hostClaude = engine.state.compute?.runs?.[run.runId]?.variant === 'split-broker';
  const hostPids = [...new Set(ev.filter(e => e.hostProcess === 'claude' && Number.isInteger(e.pid)).map(e => e.pid))];
  const markers = [...new Set(ev.map(e => e.hostMarker).filter(m => typeof m === 'string' && m.length > 8))];
  let scanned = null;
  if (hostClaude && !hostPids.length) {
    // The broker died with the old HQ, so such an orphan has no tool that reaches the sandbox or the repository,
    // but HQ still does not call it stopped without proof.
    const found = markers.length ? await hostScan(markers).catch(() => null) : null;
    if (found === null) return { stopped: false, evidence: 'Claude Code ran on the host (split broker) and its process id was never recorded; HQ cannot prove it stopped. It holds no broker session (the endpoint ended with the old HQ), so it cannot reach the sandbox or the repository. End any leftover claude process, then reconcile.' };
    if (found.length) return { stopped: false, evidence: `Claude Code host process(es) ${found.join(', ')} from this run still exist (found by its private config path); they hold no broker session.` };
    scanned = 'no host process carries this run\'s private config path';
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
  if (scanned) parts.push(scanned);
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
