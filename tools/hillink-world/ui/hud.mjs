// HUD overlays: company counts, attention list, recent activity and the agent roster.
// Everything here is derived from World state; nothing is invented (no usage or cost figures until a
// real source reports them).
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const WORKING = new Set(['coding', 'thinking', 'researching', 'testing', 'reviewing', 'communicating']);

export function summarize(world) {
  const agents = Object.values(world.agents);
  const count = pred => agents.filter(pred).length;
  const attention = [];
  for (const a of agents) if (a.activity === 'error') attention.push({ focus: `agent:${a.id}`, text: `${a.name}: ${a.lastEvent?.detail ?? 'error'}`, at: a.since });
  for (const i of Object.values(world.issues)) if (i.open) attention.push({ focus: `issue:${i.id}`, text: i.title, at: i.at ?? i.openedAt ?? 0 });
  for (const s of Object.values(world.systems)) if (s.state === 'down' || s.state === 'degraded') attention.push({ focus: `system:${s.id}`, text: `${s.name} ${s.state}${s.detail ? `: ${s.detail}` : ''}`, at: s.since });
  for (const t of Object.values(world.tasks)) if (t.status === 'failed') attention.push({ focus: `task:${t.id}`, text: `Task failed: ${t.title}`, at: t.endedAt ?? 0 });
  attention.sort((a, b) => b.at - a.at);
  return {
    total: agents.length,
    working: count(a => WORKING.has(a.activity)),
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
    case 'AGENT_REGISTERED': return `${e.name} joined`;
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

export function feedHTML(world, now, limit = 6) {
  const lines = [];
  for (let i = world.log.length - 1; i >= 0 && lines.length < limit; i--) {
    const e = world.log[i], text = describe(e, world);
    if (text) lines.push(`<li><span>${esc(text)}</span><time>${ago(now - e.at)}</time></li>`);
  }
  return lines.length ? `<ul>${lines.join('')}</ul>` : '<p class="muted">No activity yet.</p>';
}

export function attentionHTML(items, limit = 4) {
  if (!items.length) return '<p class="ok">Nothing needs attention.</p>';
  return `<ul>${items.slice(0, limit).map(i => `<li><button data-focus="${esc(i.focus)}">${esc(i.text)}</button></li>`).join('')}</ul>${items.length > limit ? `<p class="muted">+${items.length - limit} more</p>` : ''}`;
}

// Roster portraits come from the active theme's atlas; agents without a portrait get their color and initial.
export function rosterHTML(world, theme) {
  const agents = Object.values(world.agents);
  if (!agents.length) return '';
  const art = theme.art;
  return agents.map(a => {
    const key = theme.avatars?.[a.id], idx = key != null ? art?.portraitIndex[key] : undefined;
    // Styles are applied by paintFaces (the page CSP forbids inline style attributes).
    const face = idx !== undefined ? `<i class="face" data-idx="${idx}"></i>` : `<i class="face" data-color="${esc(a.appearance?.color ?? '#3a86ff')}">${esc(a.name[0].toUpperCase())}</i>`;
    const task = a.taskId ? world.tasks[a.taskId]?.title : a.lastEvent?.detail;
    return `<button class="card" data-focus="agent:${esc(a.id)}">${face}<b>${esc(a.name)}</b><small>${esc(a.role ?? '')}</small><span class="st st-${esc(a.activity)}">${esc(a.activity === 'completed' ? 'finished' : a.activity)}</span>${task ? `<small class="task">${esc(task)}</small>` : ''}</button>`;
  }).join('');
}

export function paintFaces(root, theme, size = 44) {
  const art = theme.art, n = art ? Object.keys(art.portraitIndex).length : 0;
  for (const el of root.querySelectorAll('.face')) {
    if (el.dataset.idx != null && art) Object.assign(el.style, { backgroundImage: `url(${art.portraits})`, backgroundSize: `${n * size}px ${size}px`, backgroundPosition: `-${el.dataset.idx * size}px 0` });
    else if (el.dataset.color) el.style.background = el.dataset.color;
  }
}
