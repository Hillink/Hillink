// What an agent's job is, separate from what its body is doing. Pure; reads World state only.
// A job is the task the agent owns, or the pull request it is reviewing (whose task belongs to someone else).
const STATUS_STAGE = { queued: 'Queued', active: 'In progress', blocked: 'Blocked', done: 'Done', failed: 'Failed' };

export function jobOf(world, a) {
  if (!a) return null;
  const pr = a.prId ? world.prs?.[a.prId] ?? null : null;
  const task = a.taskId ? world.tasks?.[a.taskId] ?? null : pr?.taskId ? world.tasks?.[pr.taskId] ?? null : null;
  if (pr) return { kind: 'review', task, pr, stage: pr.state === 'reviewed' ? `Review: ${pr.verdict ?? 'done'}` : 'Review', title: pr.title };
  if (task) return { kind: 'task', task, pr: task.prId ? world.prs?.[task.prId] ?? null : null, stage: task.progress?.kind === 'stage' ? task.progress.stage : STATUS_STAGE[task.status] ?? task.status, title: task.title };
  if (a.meetingId && world.meetings?.[a.meetingId]) { const m = world.meetings[a.meetingId]; return { kind: 'meeting', meeting: m, stage: 'Meeting', title: m.topic ?? 'Meeting' }; }
  return null;
}

// The last finished job, kept after completion so its outcome and evidence stay inspectable.
export function lastJobOf(world, a) {
  const l = a?.lastTask; if (!l) return null;
  const task = l.taskId ? world.tasks?.[l.taskId] ?? null : null, pr = l.prId ? world.prs?.[l.prId] ?? null : task?.prId ? world.prs?.[task.prId] ?? null : null;
  return { task, pr, outcome: l.outcome, at: l.at, title: task?.title ?? pr?.title ?? 'a task' };
}

// Open issues that name this agent or its task: the failure, its evidence and the required next action.
export function issuesFor(world, a) {
  const job = jobOf(world, a), taskId = job?.task?.id ?? a?.lastTask?.taskId;
  return Object.values(world.issues ?? {}).filter(i => i.open && (i.agentId === a.id || (taskId && i.taskId === taskId)));
}
