// Contextual detail (brief §10–11): built from World state on demand, never shown by default.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ago = (at, now) => (at == null ? 'unknown' : `${Math.max(0, Math.round((now - at) / 1000))}s ago`);
export function progressText(p) {
  if (!p) return 'No measured progress';
  return p.kind === 'ratio' ? `${p.done} of ${p.total} (${Math.round((p.done / p.total) * 100)}%)` : `Stage: ${p.stage}`;
}

export function hoverText(ref, world, extra = {}) {
  if (!ref) return '';
  if (ref.type === 'agent') { const a = world.agents[ref.id]; return a ? `${a.name} · ${extra.status ?? a.activity}` : ''; }
  if (ref.type === 'task') { const t = world.tasks[ref.id]; return t ? `${t.title} · ${t.status}` : ''; }
  if (ref.type === 'system') { const s = world.systems[ref.id]; return s ? `${s.name} · ${s.state}` : ''; }
  if (ref.type === 'issue') { const i = world.issues[ref.id]; return i ? `Issue: ${i.title}` : ''; }
  if (ref.type === 'meeting') { const m = world.meetings?.[ref.id]; return m ? `Meeting: ${m.topic ?? 'untitled'}` : ''; }
  if (ref.type === 'room') return ref.name ?? ref.id;
  return '';
}

const EVIDENCE_LABEL = { commit: 'Commit', pr: 'PR', tests: 'Tests', review: 'Review', handoff: 'Handoff', finding: 'Finding' };
function evidenceList(items, now, limit = 5) {
  if (!items?.length) return '';
  return `<h3>Evidence</h3><ul class="evidence">${items.slice(-limit).reverse().map(e => `<li><b>${esc(EVIDENCE_LABEL[e.kind] ?? e.kind)}</b> ${esc(e.summary ?? e.ref ?? '')} ${e.at != null ? `<time>${esc(ago(e.at, now))}</time>` : ''}</li>`).join('')}</ul>`;
}
function issueBlock(issues, world, now) {
  return issues.map(i => {
    const run = i.runId ? world.testRuns[i.runId] : null;
    return `<div class="alert"><b>${esc(i.title)}</b>
      ${run?.failing?.length ? `<ul>${run.failing.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      ${i.nextAction ? `<p><span>Next:</span> ${esc(i.nextAction)}</p>` : '<p class="muted">No next action reported by the source.</p>'}
      <small>${esc(ago(i.at, now))}</small></div>`;
  }).join('');
}

// extra: { status, job, lastJob, issues } from the live view (what the body is doing is not World state).
export function inspectHTML(ref, world, now, location, places = {}, extra = {}) {
  if (!ref) return '';
  const row = (k, v) => `<div class="row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  if (ref.type === 'agent') {
    const a = world.agents[ref.id]; if (!a) return '';
    const job = extra.job, last = extra.lastJob, t = job?.task;
    const prRow = job?.pr ? row(job.kind === 'review' ? 'Reviewing' : 'Pull request', `${job.pr.title}${job.pr.state ? ` (${job.pr.state}${job.pr.verdict ? `: ${job.pr.verdict}` : ''})` : ''}`) : '';
    const owner = t?.agentId && t.agentId !== a.id ? row('Built by', world.agents[t.agentId]?.name ?? t.agentId) : '';
    return `<p class="kicker">Agent</p><h2>${esc(a.name)}</h2><p class="muted">${esc(a.role)}</p>
      ${row('Doing', extra.status ?? a.activity)}${row('Since', ago(a.since, now))}
      ${job ? row(job.kind === 'meeting' ? 'Meeting' : 'Task', job.title) + row('Stage', job.stage ?? 'Unknown') + prRow + owner : row('Task', 'None')}
      ${extra.issues?.length ? issueBlock(extra.issues, world, now) : ''}
      ${t ? evidenceList(t.evidence, now) : ''}
      ${!job && last ? `<h3>Last task</h3>${row('Task', last.title)}${row('Outcome', last.outcome)}${row('Ended', ago(last.at, now))}${last.pr ? row('PR', `${last.pr.title} (${last.pr.state}${last.pr.verdict ? `: ${last.pr.verdict}` : ''})`) : ''}${evidenceList(last.task?.evidence, now, 3)}` : ''}
      ${row('Source', a.source ?? 'unknown')}
      <button data-focus="agent:${esc(a.id)}">Follow with camera</button>`;
  }
  if (ref.type === 'meeting') {
    const m = world.meetings?.[ref.id] ?? world.meetingLog?.find(x => x.id === ref.id); if (!m) return '';
    return `<p class="kicker">Meeting${m.source === 'sim' ? ' (simulated)' : ''}</p><h2>${esc(m.topic ?? 'Untitled meeting')}</h2>
      ${row('With', m.agentIds.map(id => world.agents[id]?.name ?? id).join(', '))}${row('Started', ago(m.at, now))}
      ${row('Decision needed', m.decision ?? 'None stated')}${m.endedAt ? row('Outcome', m.outcome ?? 'None recorded') : row('Outcome', 'Pending')}
      ${m.taskId && world.tasks[m.taskId] ? row('Task', world.tasks[m.taskId].title) : ''}${evidenceList(m.evidence, now)}`;
  }
  if (ref.type === 'task') {
    const t = world.tasks[ref.id]; if (!t) return '';
    return `<p class="kicker">Task</p><h2>${esc(t.title)}</h2>${row('Status', t.status)}${row('Agent', t.agentId ? world.agents[t.agentId]?.name ?? t.agentId : 'Unassigned')}
      ${row('Progress', progressText(t.progress))}${row('Elapsed', t.startedAt ? ago(t.startedAt, t.endedAt ?? now).replace(' ago', '') : 'Not started')}
      ${t.prId && world.prs[t.prId] ? row('PR', `${world.prs[t.prId].title} (${world.prs[t.prId].state})`) : ''}${t.outcomeDetail ? row('Outcome', t.outcomeDetail) : ''}${evidenceList(t.evidence, now)}
      <h3>Recent events</h3><ul>${t.history.slice(-6).reverse().map(h => `<li>${esc(h.type)} · ${esc(ago(h.at, now))}${h.detail ? ` · ${esc(h.detail)}` : ''}</li>`).join('')}</ul>`;
  }
  if (ref.type === 'system') {
    const s = world.systems[ref.id]; if (!s) return '';
    return `<p class="kicker">System</p><h2>${esc(s.name)}</h2>${row('State', s.state)}${row('Since', ago(s.since, now))}${s.detail ? row('Detail', s.detail) : ''}
      ${Object.entries(s.metrics || {}).map(([k, v]) => row(k, v)).join('')}${row('Source', s.source ?? 'unknown')}`;
  }
  if (ref.type === 'issue') {
    const i = world.issues[ref.id]; if (!i) return '';
    const who = i.agentId ? world.agents[i.agentId]?.name ?? i.agentId : null, task = i.taskId ? world.tasks[i.taskId] : null;
    return `<p class="kicker">Issue</p><h2>${esc(i.title)}</h2>${row('Severity', i.severity)}${who ? row('Agent', who) : ''}${task ? row('Task', task.title) : ''}${row('Found', ago(i.at, now))}${issueBlock([i], world, now)}`;
  }
  if (ref.type === 'room' && location) {
    const meetingsHere = (w, t) => {
      const live = Object.values(w.meetings ?? {}), last = (w.meetingLog ?? []).at(-1);
      if (!live.length && !last) return '';
      return `<h3>Meetings</h3><ul>${live.map(m => `<li><button data-inspect="meeting:${esc(m.id)}">${esc(m.topic ?? 'Meeting')} (now)</button></li>`).join('')}${last ? `<li><button data-inspect="meeting:${esc(last.id)}">${esc(last.topic ?? 'Meeting')} (ended ${esc(ago(last.endedAt, t))})</button></li>` : ''}</ul>`;
    };
    const here = Object.values(world.agents).filter(a => places[a.id]?.location === location.id);
    const tests = location.id === 'testing' ? Object.values(world.testRuns).slice(-3).reverse() : [];
    const issues = Object.values(world.issues).filter(i => i.open && i.location === location.id);
    return `<p class="kicker">Location</p><h2>${esc(location.name)}</h2><p class="muted">${esc(location.represents)}</p>
      ${row('Agents here', here.map(a => a.name).join(', ') || 'None')}${issues.length ? row('Open issues', issues.map(i => i.title).join('; ')) : ''}
      ${extra.meetingRoomId === location.id ? meetingsHere(world, now) : ''}
      ${tests.map(r => row(`Tests ${r.suite ?? ''}`.trim(), r.state === 'running' ? 'running' : `${r.passed} passed · ${r.failed} failed`)).join('')}
      <button data-focus="room:${esc(location.id)}">Zoom to room</button>`;
  }
  return '';
}
