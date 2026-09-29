import { drawPortrait } from '../render/figure.mjs';
import { lookFor } from '../render/looks.mjs';
import { jobOf, lastJobOf } from '../core/job.mjs';
// HUD overlays: company counts, attention list, recent activity and the agent roster.
// Everything here is derived from World state; nothing is invented (no usage or cost figures until a
// real source reports them).
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const WORKING = new Set(['coding', 'thinking', 'researching', 'testing', 'reviewing', 'communicating']);

// isWorking (optional): whether an agent's body is actually doing its work right now (from the view).
// Without it, "working" falls back to the semantic activity.
export function summarize(world, isWorking = a => WORKING.has(a.activity)) {
  const agents = Object.values(world.agents);
  const count = pred => agents.filter(pred).length;
  const attention = [];
  const withIssue = new Set(Object.values(world.issues).filter(i => i.open && i.agentId).map(i => i.agentId));
  for (const a of agents) if (a.activity === 'error' && !withIssue.has(a.id)) attention.push({ focus: `agent:${a.id}`, text: `${a.name}: ${a.lastEvent?.detail ?? 'error'}`, at: a.since });
  for (const i of Object.values(world.issues)) if (i.open) {
    const who = i.agentId ? world.agents[i.agentId]?.name : null, task = i.taskId ? world.tasks[i.taskId]?.title : null;
    attention.push({ focus: i.agentId ? `agent:${i.agentId}` : `issue:${i.id}`, text: `${who ? `${who}: ` : ''}${i.title}${task ? ` (${task})` : ''}`, next: i.nextAction ?? null, at: i.at ?? i.openedAt ?? 0 });
  }
  for (const s of Object.values(world.systems)) if (s.state === 'down' || s.state === 'degraded') attention.push({ focus: `system:${s.id}`, text: `${s.name} ${s.state}${s.detail ? `: ${s.detail}` : ''}`, at: s.since });
  for (const t of Object.values(world.tasks)) if (t.status === 'failed') attention.push({ focus: `task:${t.id}`, text: `Task failed: ${t.title}`, at: t.endedAt ?? 0 });
  attention.sort((a, b) => b.at - a.at);
  return {
    total: agents.length,
    working: count(isWorking),
    assigned: count(a => WORKING.has(a.activity)),
    waiting: count(a => a.activity === 'waiting'),
    idle: count(a => a.activity === 'idle' || a.activity === 'completed'),
    offline: count(a => a.activity === 'offline'),
    attention,
  };
}

const name = (world, id) => world.agents[id]?.name ?? id;
const taskTitle = (world, id) => world.tasks[id]?.title ?? 'a task';
// One short human line per event; null for events that are noise in a feed.
export function describe(e, world) {
  switch (e.type) {
    case 'AGENT_REGISTERED': return `${e.name ?? name(world, e.agentId)} joined`;
    case 'TASK_CREATED': return `New task: ${e.title}`;
    case 'TASK_STARTED': return `${name(world, e.agentId)} started “${taskTitle(world, e.taskId)}”`;
    case 'TASK_COMPLETED': return `Finished “${taskTitle(world, e.taskId)}”`;
    case 'TASK_FAILED': return `Task failed: ${taskTitle(world, e.taskId)}`;
    case 'TASK_BLOCKED': return `Blocked: ${taskTitle(world, e.taskId)}${e.detail ? ` (${e.detail})` : ''}`;
    case 'TASK_QUEUED': return `Back in queue: ${taskTitle(world, e.taskId)}`;
    case 'AGENT_MESSAGE': return `${name(world, e.agentId)} → ${name(world, e.toAgentId)}: ${e.summary ?? 'message'}`;
    case 'AGENT_TESTING': return `${name(world, e.agentId)} is testing`;
    case 'AGENT_REVIEWING': return `${name(world, e.agentId)} is reviewing`;
    case 'AGENT_RESEARCHING': return `${name(world, e.agentId)} is researching`;
    case 'AGENT_ERROR': return `${name(world, e.agentId)} hit an error${e.detail ? `: ${e.detail}` : ''}`;
    case 'AGENT_WAITING': return `${name(world, e.agentId)} is waiting${e.detail ? `: ${e.detail}` : ''}`;
    case 'MEETING_STARTED': return `Meeting started${e.topic ? `: ${e.topic}` : ''}`;
    case 'MEETING_ENDED': return 'Meeting ended';
    case 'TESTS_STARTED': return `Tests started${e.suite ? ` (${e.suite})` : ''}`;
    case 'TESTS_FINISHED': return `Tests: ${e.passed} passed, ${e.failed} failed`;
    case 'PR_CREATED': return `PR opened: ${e.title ?? e.prId}`;
    case 'PR_MERGED': return `PR merged: ${world.prs[e.prId]?.title ?? e.prId}`;
    case 'DEPLOY_STARTED': return `Deploy started${e.target ? ` (${e.target})` : ''}`;
    case 'DEPLOY_SUCCESS': return 'Deploy succeeded';
    case 'DEPLOY_FAILED': return 'Deploy failed';
    case 'BUILD_FAILED': return 'Build failed';
    case 'ISSUE_FOUND': return `Issue: ${e.title}`;
    case 'ISSUE_RESOLVED': return `Resolved: ${world.issues[e.issueId]?.title ?? 'issue'}`;
    case 'SYSTEM_STATUS': return e.state === 'ok' ? `${world.systems[e.systemId]?.name ?? e.systemId} is healthy` : `${world.systems[e.systemId]?.name ?? e.systemId} ${e.state}`;
    default: return null;
  }
}

export function ago(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
}

// Events restated from a snapshot (a page load or HQ reconnect) are not news: they collapse into one
// "Loaded" line at the time the state was loaded, and every other line keeps its source timestamp.
export function feedHTML(world, now, limit = 6) {
  const lines = [];
  for (let i = world.log.length - 1; i >= 0 && lines.length < limit; i--) {
    const e = world.log[i]; if (e.snapshot) continue;
    const text = describe(e, world);
    if (text) lines.push({ text, at: e.at });
  }
  const snap = world.snapshot;
  if (snap) lines.push({ text: `Loaded ${snap.source === 'hq' ? 'HQ' : snap.source} state: ${snap.agents} agents, ${snap.tasks} tasks`, at: snap.loadedAt });
  lines.sort((a, b) => b.at - a.at);
  const shown = lines.slice(0, limit);
  return shown.length ? `<ul>${shown.map(l => `<li title="${esc(l.text)}"><span>${esc(l.text)}</span><time>${ago(now - l.at)}</time></li>`).join('')}</ul>` : '<p class="muted">No activity yet.</p>';
}

export function attentionHTML(items, limit = 4) {
  if (!items.length) return '<p class="ok">Nothing needs attention.</p>';
  return `<ul>${items.slice(0, limit).map(i => `<li><button data-focus="${esc(i.focus)}">${esc(i.text)}${i.next ? `<small>Next: ${esc(i.next)}</small>` : ''}</button></li>`).join('')}</ul>${items.length > limit ? `<p class="muted">+${items.length - limit} more</p>` : ''}`;
}

// Roster portraits are drawn by the same figure code as the world (no image files), in the active skin.
// statusOf (optional): what the agent's body is doing, from the view ("Walking to Engineering").
export function rosterHTML(world, statusOf = a => (a.activity === 'completed' ? 'finished' : a.activity)) {
  const agents = Object.values(world.agents);
  if (!agents.length) return '';
  return agents.map(a => {
    const job = jobOf(world, a), last = !job ? lastJobOf(world, a) : null;
    const task = job ? `${job.stage ? `${job.stage}: ` : ''}${job.title}` : last ? `Last: ${last.title} (${last.outcome})` : a.lastEvent?.detail;
    const status = statusOf(a);
    return `<button class="card" data-focus="agent:${esc(a.id)}" title="${esc(`${a.name}, ${a.role ?? ''}\n${status}${task ? `\n${task}` : ''}`)}"><canvas class="face" width="88" height="88" data-agent="${esc(a.id)}"></canvas><b>${esc(a.name)}</b><small>${esc(a.role ?? '')}</small><span class="st st-${esc(a.activity)}">${esc(status)}</span>${task ? `<small class="task">${esc(task)}</small>` : ''}</button>`;
  }).join('');
}

export function paintFaces(root, theme, world) {
  for (const el of root.querySelectorAll('canvas.face')) {
    const a = world.agents[el.dataset.agent]; if (!a) continue;
    drawPortrait(el.getContext('2d'), el.width, lookFor(theme.id, a));
  }
}
