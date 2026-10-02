// Phone page for HQ's "Waiting for Kyle" queue (owner/door.mjs). The device secret is an HttpOnly cookie this page
// cannot read; the session token lives only in memory. Every decision is confirmed with a second tap.
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = t => (Number.isFinite(t) ? new Date(t).toLocaleString() : '—');
let token = null, armed = null, items = [], timer = null;

async function call(path, data) {
  const headers = { 'X-HQ-Client': 'owner-phone', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}) };
  const res = await fetch(path, { method: data ? 'POST' : 'GET', headers, body: data ? JSON.stringify(data) : undefined, credentials: 'same-origin' });
  const value = await res.json().catch(() => ({}));
  if (!res.ok) { const e = Error(value.error || `HTTP ${res.status}`); e.status = res.status; e.code = value.code; throw e; }
  return value;
}
const status = (text, error = false) => { $('status').textContent = text; $('status').className = error ? 'error' : ''; };

async function open() {
  try {
    const s = await call('/owner/api/session', {});
    token = s.token; $('device').textContent = `Paired as ${s.device.label}`;
    $('pair').hidden = true; $('queue').hidden = false; $('footer').hidden = false;
    await load();
  } catch (e) {
    token = null; $('queue').hidden = true; $('footer').hidden = true; $('pair').hidden = false;
    status(e.status === 429 ? e.message : 'This phone is not paired, or its pairing ended.', e.status === 429);
  }
}
async function load() {
  try {
    const r = await call('/owner/api/waiting');
    items = r.items; armed = null; render();
    status(`${items.length ? `${items.length} waiting` : 'Nothing waiting'} · updated ${new Date().toLocaleTimeString()}`);
  } catch (e) { if (e.status === 401) return open(); status(e.message, true); }
}
function render() {
  $('empty').hidden = items.length > 0;
  $('items').innerHTML = items.map((it, i) => {
    const ev = it.evidence;
    const rows = [
      ['Objective', `${esc(it.objective.title)}<br><span class="muted">${esc(it.objective.text)}</span>`],
      ['Requested by', esc(it.requestedBy)],
      ['Action', it.kind === 'gate' ? `${esc(it.action.gate)}${it.action.stage ? ` · ${esc(it.action.stage)}` : ''}` : esc(it.action.question)],
      ['Why', esc(it.reason)],
      ['Gate', esc(it.gateType)],
      ['Risk', `${esc(ev.risk ?? '—')}${ev.riskReasons.length ? `<br><span class="muted">${ev.riskReasons.map(esc).join('<br>')}</span>` : ''}`],
      ...(ev.branch ? [['Branch', esc(ev.branch)]] : []),
      ...(ev.commit ? [['Commit', esc(String(ev.commit).slice(0, 12))]] : []),
      ...(ev.files.length ? [['Files', ev.files.map(esc).join('<br>')]] : []),
      ...(ev.verification ? [['HQ checks', ev.verification.ok ? `passed (${ev.verification.checks})` : `FAILED: ${ev.verification.failed.map(esc).join(', ')}`]] : []),
      ...(ev.review ? [['Review', `${esc(ev.review.agent)}: ${esc(ev.review.verdict)}${ev.review.recommendation ? ` · ${esc(ev.review.recommendation)}` : ''}`]] : []),
      ['Steps', ev.steps.map(s => `${esc(s.kind)} ${esc(s.agent ?? '')} ${esc(s.status)}`).join('<br>') || '—'],
      ['Requested', esc(when(it.requestedAt))],
      ['Decide by', `${esc(when(it.expiresAt))} <span class="muted">(then refresh)</span>`],
    ];
    const buttons = it.action.choices.map(c => {
      const cls = c.id === 'approve' || c.id === 'approve_scope' || c.id === 'accept_implementation' ? 'approve' : c.id === 'deny' || c.id === 'stop' ? 'deny' : '';
      const key = `${i}:${c.id}`;
      return `<button type="button" class="${cls}${armed === key ? ' armed' : ''}" data-i="${i}" data-choice="${esc(c.id)}">${armed === key ? 'Tap again to confirm: ' : ''}${esc(c.label)}</button>`;
    }).join('');
    return `<article class="item"><div><span class="tag ${ev.risk === 'high' ? 'high' : ''}">${esc(it.kind === 'gate' ? 'APPROVAL' : 'DECISION')}</span> <span class="tag">${esc(it.objective.id.slice(0, 8))}</span></div><h3>${esc(it.objective.title)}</h3><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl><label>Note (optional)<textarea data-note="${i}" maxlength="600" rows="2"></textarea></label><div class="choices">${buttons}</div></article>`;
  }).join('');
}
$('items').addEventListener('click', async ev => {
  const b = ev.target.closest('button[data-choice]'); if (!b) return;
  const i = Number(b.dataset.i), choice = b.dataset.choice, key = `${i}:${choice}`, it = items[i];
  if (armed !== key) { armed = key; const notes = [...document.querySelectorAll('textarea[data-note]')].map(t => t.value); render(); document.querySelectorAll('textarea[data-note]').forEach((t, j) => { t.value = notes[j]; }); return; }
  const note = document.querySelector(`textarea[data-note="${i}"]`)?.value ?? '';
  b.disabled = true;
  try {
    await call('/owner/api/decide', { itemId: it.id, fingerprint: it.fingerprint, token: it.decisionToken, choice, note });
    status(`Recorded: ${choice} on ${it.objective.title}. HQ continues on its own.`);
  } catch (e) { status(`Not recorded: ${e.message}`, true); if (e.status === 401) return open(); }
  await load();
});
$('pair-form').addEventListener('submit', async ev => {
  ev.preventDefault();
  try { await call('/owner/api/pair', { code: $('pair-code').value }); $('pair-code').value = ''; await open(); }
  catch (e) { status(e.message, true); }
});
$('refresh').addEventListener('click', load);
$('logout').addEventListener('click', async () => { try { await call('/owner/api/logout', {}); } catch { /* already gone */ } token = null; status('Locked. Reload to open again.'); $('queue').hidden = true; $('footer').hidden = true; });
document.addEventListener('visibilitychange', () => { if (!document.hidden && token) load(); });
timer = setInterval(() => { if (token && !document.hidden && armed === null) load(); }, 20_000);
open();
