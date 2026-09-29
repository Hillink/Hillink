// The ChatGPT orchestrator's tools: the complete list of what the model may ask HQ to do.
// There is no shell, file, network or configuration tool, and the model cannot add one: the list below
// is fixed in code, every call is validated here (types, lengths, enums, no extra fields) before HQ acts,
// and every write goes through the engine's own createTask validation.
//
// Reads: get_hq_state, get_task. Writes: request_repo_review (a read-only review task for Claude or Codex),
// request_kyle_approval (an owner-required task, which HQ never runs). Delegated tasks carry
// requestedBy = { agentId: 'chatgpt', taskId } so HQ and the World can trace and wait on them.

const clip = (s, n) => (typeof s === 'string' ? (s.length > n ? `${s.slice(0, n - 1)}…` : s) : null);
const iso = at => (Number.isFinite(at) ? new Date(at).toISOString() : null);
const REVIEWERS = ['claude', 'codex'];
export const LIMITS = { delegationsPerTurn: 2, approvalsPerTurn: 1 };

const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const str = (description, maxLength) => ({ type: 'string', description, ...(maxLength ? { maxLength } : {}) });

// Responses API function tools (strict schemas).
export const TOOL_DEFINITIONS = [
  { type: 'function', name: 'get_hq_state', strict: true, description: 'Read current Hillink HQ state: every agent with its verified status and current task, the most recent tasks with stage and who requested them, and active alerts. Call this before describing what anyone is doing.', parameters: obj({}) },
  { type: 'function', name: 'get_task', strict: true, description: 'Read one HQ task: stage, assigned agent, who requested it, blocker, recent evidence and the result text if it has finished.', parameters: obj({ task_id: str('HQ task id (a UUID).', 64) }) },
  { type: 'function', name: 'request_repo_review', strict: true, description: 'Delegate a READ-ONLY repository review to Claude (implementation agent) or Codex (investigation/review agent). They read files and answer; they cannot edit, run commands, deploy or touch databases. Creates one queued HQ task and returns its id. Refused if the agent is not connected, offline or rate limited.', parameters: obj({ agent_id: { type: 'string', enum: REVIEWERS, description: 'claude or codex' }, title: str('Short task title.', 120), instruction: str('What the agent should find out, in full.', 1800) }) },
  { type: 'function', name: 'request_kyle_approval', strict: true, description: 'Ask Kyle to decide something only he can decide. Creates an owner-required HQ task that nothing runs until Kyle acts. Never assume approval.', parameters: obj({ summary: str('One-line summary of the decision.', 120), decision: str('Exactly what Kyle must decide or do, and why.', 1200) }) },
];
export const TOOL_NAMES = TOOL_DEFINITIONS.map(t => t.name);

// Server-side validation, independent of what the model or the API claims about strict mode.
export function validateArgs(name, raw) {
  const def = TOOL_DEFINITIONS.find(t => t.name === name);
  if (!def) throw Error(`Unknown tool "${String(name).slice(0, 60)}". Allowed: ${TOOL_NAMES.join(', ')}.`);
  let args;
  try { args = raw == null || raw === '' ? {} : JSON.parse(raw); } catch { throw Error('Arguments must be a JSON object.'); }
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw Error('Arguments must be a JSON object.');
  const { properties, required } = def.parameters;
  for (const key of Object.keys(args)) if (!Object.hasOwn(properties, key)) throw Error(`Unexpected argument "${key.slice(0, 40)}".`);
  for (const key of required) {
    const spec = properties[key], v = args[key];
    if (typeof v !== 'string' || !v.trim()) throw Error(`"${key}" must be a non-empty string.`);
    if (spec.maxLength && v.length > spec.maxLength) throw Error(`"${key}" is longer than ${spec.maxLength} characters.`);
    if (spec.enum && !spec.enum.includes(v)) throw Error(`"${key}" must be one of ${spec.enum.join(', ')}.`);
  }
  return args;
}

function agentView(engine, a, at) {
  const task = a.assignment ? engine.state.tasks[a.assignment] : null;
  return { id: a.id, name: a.name, role: a.role, status: engine.status(a, at), connected: Boolean(engine.adapters[a.executionAdapter]), detail: clip(a.detail, 200), retry_at: iso(a.retryAt), current_task: task ? { id: task.id, title: clip(task.title, 120), stage: task.stage } : null };
}
function taskView(t) {
  return { id: t.id, title: clip(t.title, 160), stage: t.stage, operation: t.operation, agent: t.agentId ?? t.preferredAgentId ?? null, requested_by: t.requestedBy?.agentId ?? 'kyle', blocker: clip(t.blocker, 240), created_at: iso(t.createdAt), ended_at: iso(t.endedAt) };
}

// One orchestration turn's tool executor. `taskId` is the orchestration task that is calling.
export function createToolbox(engine, { taskId, now = () => engine.now() }) {
  const counts = { delegations: 0, approvals: 0 }, delegated = [];
  const run = {
    get_hq_state() {
      const at = now();
      const tasks = Object.values(engine.state.tasks).sort((a, b) => b.createdAt - a.createdAt).slice(0, 15).map(taskView);
      const alerts = Object.values(engine.state.alerts).filter(a => a.active && a.kind !== 'HANDOFF_READY').slice(0, 10).map(a => ({ kind: a.kind, agent: a.agentId, task: a.taskId, needs_kyle: Boolean(a.ownerMustAct), action: clip(a.ownerAction ?? a.detail, 200) }));
      return { observed_at: iso(at), agents: Object.values(engine.state.agents).map(a => agentView(engine, a, at)), recent_tasks: tasks, active_alerts: alerts };
    },
    get_task({ task_id }) {
      const t = engine.state.tasks[task_id];
      if (!t) return { error: `No HQ task with id ${clip(task_id, 64)}.` };
      const result = t.evidence.filter(e => e.kind === 'MODEL_RESULT').at(-1);
      return { ...taskView(t), description: clip(t.description, 600), evidence: t.evidence.filter(e => e.kind !== 'HEARTBEAT').slice(-10).map(e => ({ kind: e.kind, summary: clip(e.summary, 400), at: iso(e.at) })), result: clip(result?.summary, 1900) };
    },
    request_repo_review({ agent_id, title, instruction }) {
      if (counts.delegations >= LIMITS.delegationsPerTurn) return { refused: `At most ${LIMITS.delegationsPerTurn} delegations per request.` };
      const a = engine.state.agents[agent_id];
      if (!a || !engine.adapters[a.executionAdapter]) return { refused: `${a?.name ?? agent_id} is not connected to HQ, so it cannot take work.` };
      const status = engine.status(a);
      if (status === 'RATE_LIMITED') return { refused: `${a.name} is rate limited${a.retryAt ? ` until ${iso(a.retryAt)}` : ''}.` };
      if (['OFFLINE', 'UNKNOWN', 'STALLED'].includes(status)) return { refused: `${a.name} is ${status} in HQ${a.detail ? `: ${clip(a.detail, 160)}` : ''}.` };
      const id = engine.createTask({ title: `ChatGPT → ${a.name}: ${title}`.slice(0, 200), description: instruction, operation: 'review-repo', safety: 'local-read-only', priority: 50, preferredAgentId: agent_id }, { requestedBy: { agentId: 'chatgpt', taskId } });
      counts.delegations += 1; delegated.push({ taskId: id, agentId: agent_id });
      return { task_id: id, agent: a.name, stage: engine.state.tasks[id].stage, note: 'Queued in HQ. It is done only when HQ shows DONE; read it later with get_task.', agent_status_now: status, agent_busy_with: a.assignment ?? null };
    },
    request_kyle_approval({ summary, decision }) {
      if (counts.approvals >= LIMITS.approvalsPerTurn) return { refused: `At most ${LIMITS.approvalsPerTurn} approval request per request.` };
      const id = engine.createTask({ title: `Approval needed: ${summary}`.slice(0, 200), description: decision, operation: 'owner-decision', safety: 'owner-required', ownerAction: decision, priority: 60 }, { requestedBy: { agentId: 'chatgpt', taskId } });
      counts.approvals += 1; delegated.push({ taskId: id, agentId: 'kyle' });
      return { task_id: id, stage: engine.state.tasks[id].stage, note: 'Waiting for Kyle. Not approved until HQ shows it.' };
    },
  };
  return {
    delegated,
    // Returns { name, ok, output (JSON string for the model), summary (for HQ evidence) }. Never throws.
    call(name, rawArgs) {
      try {
        const args = validateArgs(name, rawArgs);
        const out = run[name](args);
        const ok = !out.error && !out.refused;
        const summary = name === 'request_repo_review' && ok ? `Delegated to ${out.agent}: HQ task ${out.task_id}` : name === 'request_kyle_approval' && ok ? `Asked Kyle to decide: HQ task ${out.task_id}` : ok ? `Read ${name === 'get_task' ? `task ${clip(args.task_id, 64)}` : 'HQ state'}` : `${name} refused: ${out.refused ?? out.error}`;
        return { name, ok, output: JSON.stringify(out), summary, taskId: out.task_id ?? null };
      } catch (error) {
        return { name: String(name).slice(0, 60), ok: false, output: JSON.stringify({ error: error.message }), summary: `Rejected tool call ${String(name).slice(0, 60)}: ${error.message}` };
      }
    },
  };
}
