const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
let token, snapshot, liveSnapshot, replaying = false, skin = 'real', selected = null, replayTimer;
const notified = new Set();
const ago = (at, now) => at == null ? 'No evidence' : `${Math.max(0, Math.floor((now - at) / 1000))}s ago`;
const badge = status => `<span class="badge ${escape(status)}">${escape(status)}</span>`;
function workerOptions() {
  if (!liveSnapshot) return;
  const previous = $('worker').value;
  const capability = liveSnapshot.operations[$('operation').value]?.capability;
  const html = '<option value="">Automatic · capable local worker</option>' + liveSnapshot.agents.filter(a => a.capabilities.includes(capability)).map(a => `<option value="${escape(a.id)}">${escape(a.name)}${a.adapterAvailable ? '' : ' · adapter unavailable'}</option>`).join('');
  if ($('worker').innerHTML !== html) { $('worker').innerHTML = html; if ([...$('worker').options].some(o => o.value === previous)) $('worker').value = previous; }
}
$('operation').onchange = workerOptions;
function replace(id, html) {
  const element = $(id);
  if (element.innerHTML !== html) element.innerHTML = html;
}
async function api(path, data) {
  const response = await fetch(path, { method: data ? 'POST' : 'GET', headers: { 'X-HQ-Client': 'command-center', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(5000) });
  const value = await response.json();
  if (!response.ok) throw Error(value.error || `HTTP ${response.status}`);
  return value;
}
function render(state) {
  snapshot = state;
  $('metrics').innerHTML = Object.entries(state.counts).map(([key, value]) => `<div class="metric"><strong>${value}</strong><span>${escape(key === 'working' ? 'Verified running' : key)}</span></div>`).join('');
  $('summary').textContent = state.cycleComplete ? 'Autonomous cycle complete. All remaining work has explicit blockers.' : `${state.counts.assigned} assignments · ${state.counts.working} verified running · ${state.counts.ready} safe tasks ready`;
  $('agent-count').textContent = ` / ${state.agents.length}`;
  $('agents').innerHTML = state.agents.map(agent => {
    const task = state.tasks.find(t => t.id === agent.assignment);
    return `<button class="agent" data-agent="${escape(agent.id)}"><div class="agent-top"><span class="avatar">${escape(agent.name[0])}</span><div><h3>${escape(agent.name)}</h3><span class="role">${escape(agent.role)}</span></div>${badge(agent.status)}</div><p>${task ? escape(task.title) : agent.adapterAvailable ? 'Available for allowlisted local work' : 'Execution adapter not connected'}</p><p>Progress: ${ago(agent.lastMeaningfulAt, state.now)} · Credits: UNKNOWN</p></button>`;
  }).join('');
  $('queue').innerHTML = state.tasks.length ? [...state.tasks].reverse().map(task => `<div class="queue-row"><button data-task="${escape(task.id)}"><b>${escape(task.title)}</b><small>${escape(task.description)}</small></button><span>${badge(task.stage)}</span><span>${escape(state.agents.find(a => a.id === task.agentId)?.name || 'Unassigned')}<small>Priority ${task.priority} · Attempt ${task.attempts}</small></span><span>${task.claimedAt ? ago(task.claimedAt, task.endedAt ?? state.now).replace(' ago', ' elapsed') : 'Not started'}</span></div>`).join('') : '<p class="empty">No tasks yet. Queue a safe check to observe actual execution.</p>';
  const alerts = Object.values(state.alerts).filter(a => a.active);
  $('alerts').innerHTML = alerts.length ? alerts.map(a => `<div class="alert"><strong>${escape(a.kind)}</strong><p>${escape(a.detail)}</p><p>Agent: ${escape(a.agentId || 'System')} · Task: ${escape(a.taskId || 'Queue')} · Ready: ${a.runnableQueueCount}</p><p>Since progress at alert creation: ${a.sinceProgressMs == null ? 'UNKNOWN' : `${Math.floor(a.sinceProgressMs / 1000)}s`} · Recovery: ${escape(a.recoveryAttempted?.step || 'None')}</p>${a.ownerAction ? `<p><b>Kyle:</b> ${escape(a.ownerAction)}</p>` : ''}<p>External delivery: ${a.deliveredAt ? 'Delivered' : a.deliveryError ? escape(a.deliveryError) : 'Pending / unconfigured'}</p><button data-ack="${escape(a.key)}" ${a.acknowledgedAt || replaying ? 'disabled' : ''}>${a.acknowledgedAt ? 'Acknowledged' : 'Acknowledge'}</button></div>`).join('') : '<p class="empty">No material alerts.</p>';
  const meaningful = state.events.filter(e => !(e.type === 'AGENT_OBSERVED' && e.data.status === 'IDLE') && !(e.type === 'WORKER_EVENT' && e.data.kind === 'HEARTBEAT'));
  replace('events', [...meaningful].reverse().slice(0, 80).map(event => `<div class="event"><b>${escape(event.type === 'WORKER_EVENT' ? event.data.kind : event.type)}</b><small>#${event.seq} · ${new Date(event.at).toLocaleTimeString()}</small>${escape(event.data.summary || event.data.title || event.data.detail || event.data.reason || event.data.name || '')}</div>`).join('') || '<p class="empty">No meaningful events.</p>');
  $('notification-health').textContent = state.health?.externalNotifications === 'CONFIGURED' ? 'Durable outbox → configured webhook. Failed deliveries remain visible and retry.' : 'External delivery is unconfigured. Browser notifications require permission and this tab to remain open.';
  renderWorld();
  if (selected) inspect(selected.type, selected.id, false);
  if (!replaying && 'Notification' in window && Notification.permission === 'granted') for (const alert of alerts) {
    const key = `${alert.key}:${alert.openedAt}`;
    if (!notified.has(key) && !alert.acknowledgedAt) { new Notification(`Hillink HQ · ${alert.kind}`, { body: alert.ownerAction || alert.detail, tag: key }); notified.add(key); }
  }
}
function renderWorld() {
  if (!snapshot) return;
  $('world').className = `world ${skin} ${new Date(snapshot.now).getHours() >= 18 || new Date(snapshot.now).getHours() < 7 ? 'night' : ''}`;
  replace('world', snapshot.agents.map(agent => {
    const task = snapshot.tasks.find(t => t.id === agent.assignment);
    const place = agent.status === 'UNKNOWN' || agent.status === 'OFFLINE' ? 'Connection gate' : ['BLOCKED', 'STALLED', 'RATE_LIMITED'].includes(agent.status) ? 'Triage room' : agent.workstation;
    return `<button class="station ${agent.status.toLowerCase()}" data-agent="${escape(agent.id)}"><small>${escape(place)}</small><span class="character" aria-hidden="true">${skin === 'fantasy' ? '♜' : '▣'}</span>${badge(agent.status)}<h3>${escape(agent.name)}</h3><small>${escape(agent[skin])}</small><p>${task ? escape(`${task.stage} · ${task.title}`) : agent.adapterAvailable ? 'No current task' : 'Awaiting adapter connection'}</p></button>`;
  }).join(''));
}
function inspect(type, id, focus = true) {
  selected = { type, id }; const panel = $('inspection'); panel.hidden = false;
  const agent = type === 'agent' ? snapshot.agents.find(a => a.id === id) : null;
  const task = snapshot.tasks.find(t => t.id === (agent?.assignment || (type === 'task' ? id : null))) || (agent ? snapshot.tasks.filter(t => t.agentId === agent.id).at(-1) : null);
  const unresolved = task?.stage === 'BLOCKED' && snapshot.runs[task.runId] && !snapshot.runs[task.runId].endedAt;
  $('reconcile-panel').hidden = !unresolved || replaying;
  $('reconcile-form').dataset.runId = unresolved ? task.runId : '';
  panel.innerHTML = `<p class="eyebrow">${agent ? 'AGENT INSPECTION' : 'WHAT ARE YOU BUILDING?'}</p><h2>${escape(agent?.name || task?.title)}</h2>${agent ? `<p>${escape(agent.role)} · ${escape(agent.provider)} · Model: ${escape(agent.model || 'UNKNOWN')} ${badge(agent.status)}</p><p class="muted">Capabilities: ${escape(agent.capabilities.join(', '))}<br>Execution: ${escape(agent.executionAdapter || 'UNAVAILABLE')} · Telemetry: ${escape(agent.telemetryAdapter || 'UNAVAILABLE')}<br>Credits / cost: UNKNOWN${agent.usage ? `<br>Measured ${agent.usage.elapsedMs}ms · RSS ${agent.usage.rssBytes ?? 'UNKNOWN'} bytes · Source ${escape(agent.usage.source)}` : ''}</p>` : ''}${task ? `<h3>${escape(task.title)} ${badge(task.stage)}</h3><p>${escape(task.description)}</p><p class="muted">Owner: ${escape(task.agentId || 'Unassigned')} · ETA: UNKNOWN · Last meaningful progress: ${ago(task.lastMeaningfulAt, snapshot.now)}</p>${task.blocker ? `<p>Blocker: ${escape(task.blocker)}</p>` : ''}${task.ownerAction ? `<p>Kyle action: ${escape(task.ownerAction)}</p>` : ''}<h3>Evidence / tests / branches / handoffs</h3><ul>${task.evidence.map(e => `<li><b>${escape(e.kind)}</b> · ${escape(e.summary)}${e.url ? ` <a href="${escape(e.url)}" target="_blank" rel="noopener noreferrer">Evidence</a>` : ''}${e.files ? `<br>${e.files.map(escape).join(', ')}` : ''}</li>`).join('')}</ul>` : '<p class="muted">No active assignment. No execution is inferred from registration.</p>'}`;
  if (focus) { panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); panel.focus({ preventScroll: true }); }
}
document.addEventListener('click', async event => {
  const agent = event.target.closest('[data-agent]'), task = event.target.closest('[data-task]'), ack = event.target.closest('[data-ack]');
  if (agent) inspect('agent', agent.dataset.agent);
  if (task) inspect('task', task.dataset.task);
  if (ack && !replaying) { try { await api('/api/alerts/ack', { key: ack.dataset.ack }); await refresh(); } catch (e) { $('notice').textContent = e.message; } }
});
for (const view of ['command', 'world']) $(`${view}-tab`).onclick = () => {
  $('world-panel').hidden = view !== 'world';
  $('command-tab').setAttribute('aria-selected', String(view === 'command')); $('world-tab').setAttribute('aria-selected', String(view === 'world'));
};
for (const value of ['real', 'fantasy']) $(value).onclick = () => { skin = value; for (const name of ['real', 'fantasy']) $(name).setAttribute('aria-pressed', String(name === skin)); renderWorld(); };
$('owner-required').onchange = () => { $('owner-label').hidden = !$('owner-required').checked; $('owner-action').required = $('owner-required').checked; };
$('task-form').onsubmit = async event => {
  event.preventDefault(); if (replaying) return;
  try {
    await api('/api/tasks', { title: $('task-title').value, description: $('description').value, operation: $('operation').value, preferredAgentId: $('worker').value || null, priority: Number($('priority').value), safety: $('owner-required').checked ? 'owner-required' : 'local-read-only', ownerAction: $('owner-required').checked ? $('owner-action').value : null });
    $('form-result').textContent = 'Task recorded. Execution starts only after a worker acknowledges.'; await refresh();
  } catch (error) { $('form-result').textContent = error.message; }
};
$('notifications').onclick = async () => { if ('Notification' in window) { const permission = await Notification.requestPermission(); $('notifications').textContent = `Notifications: ${permission}`; } else $('notifications').textContent = 'Browser notifications unavailable'; };
$('reconcile-form').onsubmit = async event => {
  event.preventDefault(); if (replaying) return;
  try {
    await api('/api/runs/reconcile', { runId: $('reconcile-form').dataset.runId, confirmedStopped: $('termination-confirmed').checked, evidence: $('termination-evidence').value });
    $('reconcile-result').textContent = 'Termination confirmation recorded. The unfinished task remains blocked.';
    $('termination-evidence').value = ''; $('termination-confirmed').checked = false; await refresh();
  } catch (error) { $('reconcile-result').textContent = error.message; }
};
function replayMode(value) { replaying = value; $('task-form').querySelectorAll('input,select,textarea,button').forEach(el => { el.disabled = value; }); }
async function replay(seq) { replayMode(true); render(await api(`/api/history?seq=${seq}`)); $('notice').textContent = `REPLAY · event ${seq}. Historical state; all dispatch controls disabled.`; }
$('replay').onclick = async () => { try { clearInterval(replayTimer); await replay(Number($('replay-seq').value)); } catch (e) { $('notice').textContent = e.message; } };
$('replay-play').onclick = () => {
  clearInterval(replayTimer); let seq = Number($('replay-seq').value);
  replayTimer = setInterval(async () => { if (seq >= (liveSnapshot?.seq ?? 0)) { clearInterval(replayTimer); return; } seq = Math.min(seq + 4, liveSnapshot.seq); $('replay-seq').value = seq; try { await replay(seq); } catch { clearInterval(replayTimer); } }, 1000);
};
$('live').onclick = () => { clearInterval(replayTimer); replayMode(false); $('notice').textContent = ''; refresh(); };
async function refresh() {
  try {
    if (!token) token = (await api('/api/session')).token;
    liveSnapshot = await api('/api/state');
    $('connection').textContent = `Local service · ${liveSnapshot.health.controller}`; $('connection-dot').className = 'online';
    if (!$('operation').options.length) $('operation').innerHTML = Object.entries(liveSnapshot.operations).map(([id, op]) => `<option value="${escape(id)}">${escape(op.label)}</option>`).join('');
    workerOptions();
    if (!replaying) { render(liveSnapshot); $('notice').textContent = liveSnapshot.health.lastError || ''; }
  } catch (error) {
    token = null; $('connection').textContent = 'Connection lost · state UNKNOWN'; $('connection-dot').className = '';
    $('notice').textContent = `Live telemetry unavailable: ${error.message}. Working animation suspended.`;
    if (!replaying && snapshot) render({ ...snapshot, cycleComplete: false, counts: { ...snapshot.counts, working: 'UNKNOWN' }, agents: snapshot.agents.map(a => ({ ...a, status: 'UNKNOWN' })), health: { controller: 'UNKNOWN' } });
  }
}
await refresh(); setInterval(refresh, 2000);
