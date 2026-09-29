// Contextual detail (brief §10–11): built from World state on demand, never shown by default.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ago = (at, now) => (at == null ? 'unknown' : `${Math.max(0, Math.round((now - at) / 1000))}s ago`);
export function progressText(p) {
  if (!p) return 'No measured progress';
  return p.kind === 'ratio' ? `${p.done} of ${p.total} (${Math.round((p.done / p.total) * 100)}%)` : `Stage: ${p.stage}`;
}

export function hoverText(ref, world) {
  if (!ref) return '';
  if (ref.type === 'agent') { const a = world.agents[ref.id]; return a ? `${a.name} · ${a.activity}` : ''; }
  if (ref.type === 'task') { const t = world.tasks[ref.id]; return t ? `${t.title} · ${t.status}` : ''; }
  if (ref.type === 'system') { const s = world.systems[ref.id]; return s ? `${s.name} · ${s.state}` : ''; }
  if (ref.type === 'issue') { const i = world.issues[ref.id]; return i ? `Issue: ${i.title}` : ''; }
  if (ref.type === 'room') return ref.name ?? ref.id;
  return '';
}

export function inspectHTML(ref, world, now, location, places = {}) {
  if (!ref) return '';
  const row = (k, v) => `<div class="row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  if (ref.type === 'agent') {
    const a = world.agents[ref.id]; if (!a) return '';
    const t = a.taskId ? world.tasks[a.taskId] : null;
    return `<p class="kicker">Agent</p><h2>${esc(a.name)}</h2><p class="muted">${esc(a.role)}</p>
      ${row('Status', a.activity)}${row('Since', ago(a.since, now))}${row('Task', t ? t.title : 'None')}${t ? row('Progress', progressText(t.progress)) : ''}
      ${row('Last event', a.lastEvent ? `${a.lastEvent.type} · ${ago(a.lastEvent.at, now)}` : 'None')}${row('Source', a.source ?? 'unknown')}
      <button data-focus="agent:${esc(a.id)}">Follow with camera</button>`;
  }
  if (ref.type === 'task') {
    const t = world.tasks[ref.id]; if (!t) return '';
    return `<p class="kicker">Task</p><h2>${esc(t.title)}</h2>${row('Status', t.status)}${row('Agent', t.agentId ? world.agents[t.agentId]?.name ?? t.agentId : 'Unassigned')}
      ${row('Progress', progressText(t.progress))}${row('Elapsed', t.startedAt ? ago(t.startedAt, t.endedAt ?? now).replace(' ago', '') : 'Not started')}
      <h3>Recent events</h3><ul>${t.history.slice(-6).reverse().map(h => `<li>${esc(h.type)} · ${esc(ago(h.at, now))}${h.detail ? ` · ${esc(h.detail)}` : ''}</li>`).join('')}</ul>`;
  }
  if (ref.type === 'system') {
    const s = world.systems[ref.id]; if (!s) return '';
    return `<p class="kicker">System</p><h2>${esc(s.name)}</h2>${row('State', s.state)}${row('Since', ago(s.since, now))}${s.detail ? row('Detail', s.detail) : ''}
      ${Object.entries(s.metrics || {}).map(([k, v]) => row(k, v)).join('')}${row('Source', s.source ?? 'unknown')}`;
  }
  if (ref.type === 'issue') {
    const i = world.issues[ref.id]; if (!i) return '';
    return `<p class="kicker">Issue</p><h2>${esc(i.title)}</h2>${row('Severity', i.severity)}${row('Where', i.location ?? 'unknown')}${row('Found', ago(i.at, now))}`;
  }
  if (ref.type === 'room' && location) {
    const here = Object.values(world.agents).filter(a => places[a.id]?.location === location.id);
    const tests = location.id === 'testing' ? Object.values(world.testRuns).slice(-3).reverse() : [];
    const issues = Object.values(world.issues).filter(i => i.open && i.location === location.id);
    return `<p class="kicker">Location</p><h2>${esc(location.name)}</h2><p class="muted">${esc(location.represents)}</p>
      ${row('Agents here', here.map(a => a.name).join(', ') || 'None')}${issues.length ? row('Open issues', issues.map(i => i.title).join('; ')) : ''}
      ${tests.map(r => row(`Tests ${r.suite ?? ''}`.trim(), r.state === 'running' ? 'running' : `${r.passed} passed · ${r.failed} failed`)).join('')}
      <button data-focus="room:${esc(location.id)}">Zoom to room</button>`;
  }
  return '';
}
