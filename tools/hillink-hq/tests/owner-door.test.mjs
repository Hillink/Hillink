// Phone approvals (owner/door.mjs): Kyle decides HQ's owner-gated actions from a paired phone. Every decision is
// bound to the exact pending request, one-time, expiring, authenticated by a paired device's session, journaled with
// an audit record, and goes through the same Conductor approve/decide the Command Center uses.
import { test } from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createHQ } from '../server.mjs';
import { MemoryStore } from '../store.mjs';
import { waitingForKyle, fingerprintOf } from '../owner/queue.mjs';
import { OwnerDoor } from '../owner/door.mjs';

const until = async (check, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (check()) return true; await new Promise(r => setTimeout(r, 20)); } return false; };

async function start() {
  const hq = await createHQ({ port: 0, store: new MemoryStore(), intervalMs: 20, env: { HQ_OWNER_PORT: '0' }, ownerDoor: true });
  const door = hq.ownerDoor();
  assert.match(door.status, /^ENABLED/, door.status);
  const headers = { 'X-HQ-Client': 'command-center' };
  headers.Authorization = `Bearer ${(await fetch(`${hq.origin}/api/session`, { headers }).then(r => r.json())).token}`;
  const cc = async (path, data) => { const r = await fetch(`${hq.origin}${path}`, { method: data ? 'POST' : 'GET', headers: { ...headers, ...(data ? { 'Content-Type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined }); return { status: r.status, body: await r.json() }; };
  const objective = async (requestedActions = ['production-change'], title = 'Inbox') => {
    const { body } = await cc('/api/objectives', { objective: `Investigate how the ${title} is loaded.`, type: 'investigate', title, requestedActions });
    assert.ok(await until(() => hq.engine.state.objectives[body.id]?.status === 'AWAITING_APPROVAL'), hq.engine.state.objectives[body.id]?.statusReason);
    return body.id;
  };
  return { hq, base: door.base, cc, objective };
}

// fetch() will not send a Host header of our choosing; a raw request can (as the Cloudflare tunnel does).
function raw(base, path, { method = 'GET', headers = {}, body = null } = {}) {
  const u = new URL(base);
  return new Promise((resolve, reject) => {
    const r = http.request({ host: u.hostname, port: u.port, path, method, headers }, res => { let d = ''; res.on('data', c => { d += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d })); });
    r.on('error', reject); if (body) r.write(body); r.end();
  });
}
// A phone: a cookie jar for the device secret, a bearer session token in memory.
function phone(base, { host } = {}) {
  let cookie = null, token = null;
  const h = (extra = {}) => ({ 'X-HQ-Client': 'owner-phone', ...(host ? { Host: host } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra });
  const req = async (path, data, extra) => {
    const r = await fetch(`${base}${path}`, { method: data ? 'POST' : 'GET', headers: h({ ...(data ? { 'Content-Type': 'application/json' } : {}), ...extra }), body: data ? JSON.stringify(data) : undefined });
    const set = r.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    return { status: r.status, body: await r.json().catch(() => null), setCookie: set };
  };
  return {
    req, get cookie() { return cookie; }, set cookie(v) { cookie = v; }, get token() { return token; }, set token(v) { token = v; },
    pair: code => req('/owner/api/pair', { code }),
    open: async () => { const r = await req('/owner/api/session', {}); if (r.status === 201) token = r.body.token; return r; },
    waiting: () => req('/owner/api/waiting'),
    decide: body => req('/owner/api/decide', body),
  };
}
async function paired(t, label = 'Kyle phone') {
  const { body } = await t.cc('/api/owner/pair', { label });
  const p = phone(t.base);
  assert.equal((await p.pair(body.code)).status, 201);
  assert.equal((await p.open()).status, 201);
  return { p, code: body.code };
}
const decided = engine => engine.state.events.filter(e => e.type === 'APPROVAL_DECIDED');
const refusals = engine => engine.state.events.filter(e => e.type === 'OWNER_DECISION_REFUSED').map(e => e.data.code);
const pick = (items, objectiveId) => items.find(x => x.objective.id === objectiveId);

test('valid phone approval: the item shows what Kyle decides, the approval is journaled with an audit record, no secret reaches the journal, and HQ continues by itself', async () => {
  const t = await start();
  try {
    const id = await t.objective();
    const { p } = await paired(t);
    const cookieSet = (await t.cc('/api/owner/devices')).body.devices;
    assert.equal(cookieSet.length, 1); assert.equal(cookieSet[0].credentialHash, undefined, 'the Command Center never sees the credential hash');
    const w = await p.waiting();
    assert.equal(w.status, 200);
    const it = pick(w.body.items, id);
    assert.equal(it.kind, 'gate');
    assert.equal(it.objective.title, 'Inbox'); assert.match(it.objective.text, /Investigate how the Inbox/);
    assert.equal(it.requestedBy, 'kyle');
    assert.equal(it.action.gate, 'production-change'); assert.deepEqual(it.action.choices.map(c => c.id), ['approve', 'deny']);
    assert.ok(it.reason && it.gateType === 'production-change' && Number.isFinite(it.requestedAt) && it.expiresAt > Date.now());
    assert.ok(it.evidence && Array.isArray(it.evidence.riskReasons) && it.evidence.risk);
    assert.match(it.fingerprint, /^[0-9a-f]{64}$/); assert.ok(it.decisionToken.length >= 30);
    // The Command Center sees the same queue (without phone tokens).
    const ccItem = pick((await t.cc('/api/owner/waiting')).body.items, id);
    assert.equal(ccItem.fingerprint, it.fingerprint); assert.equal(ccItem.decisionToken, undefined);

    const r = await p.decide({ itemId: it.id, fingerprint: it.fingerprint, token: it.decisionToken, choice: 'approve', note: 'Approved from my phone.' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const [e] = decided(t.hq.engine);
    assert.equal(e.data.by, 'kyle'); assert.equal(e.data.channel, 'phone'); assert.equal(e.data.decision, 'approve'); assert.equal(e.data.note, 'Approved from my phone.');
    assert.equal(e.data.audit.fingerprint, it.fingerprint); assert.equal(e.data.audit.itemId, it.id);
    assert.equal(e.data.audit.deviceId, cookieSet[0].id); assert.ok(e.data.audit.tokenId && e.data.audit.sessionId && e.data.audit.ip);
    assert.equal(t.hq.engine.state.objectives[id].approvals['production-change'].audit.fingerprint, it.fingerprint);
    // Secrets: neither the device secret, the session token nor the decision token is in the journal.
    const journal = JSON.stringify(t.hq.engine.state.events);
    for (const secret of [p.cookie.split('=')[1], p.token, it.decisionToken]) assert.ok(!journal.includes(secret));
    assert.ok(await until(() => t.hq.engine.state.objectives[id].status !== 'AWAITING_APPROVAL'), 'the Conductor resumed the objective');
    assert.equal(pick((await p.waiting()).body.items, id), undefined);
  } finally { await t.hq.close(); }
});

test('denial: the objective is cancelled per existing policy ("Kyle declined"), journaled from the phone', async () => {
  const t = await start();
  try {
    const id = await t.objective();
    const { p } = await paired(t);
    const it = pick((await p.waiting()).body.items, id);
    assert.equal((await p.decide({ itemId: it.id, fingerprint: it.fingerprint, token: it.decisionToken, choice: 'deny' })).status, 200);
    assert.deepEqual(decided(t.hq.engine).map(e => [e.data.decision, e.data.channel]), [['deny', 'phone']]);
    assert.ok(await until(() => t.hq.engine.state.objectives[id].status === 'CANCELLED'));
    assert.match(t.hq.engine.state.objectives[id].statusReason, /Kyle declined: production-change/);
  } finally { await t.hq.close(); }
});

test('expired: a decision token past its time is refused (and consumed); a fresh listing works', async () => {
  const t = await start();
  try {
    const id = await t.objective();
    const { p } = await paired(t);
    const it = pick((await p.waiting()).body.items, id);
    const realNow = t.hq.owner.now;
    t.hq.owner.now = () => realNow() + t.hq.owner.limits.tokenMs + 1;
    t.hq.owner.sessions.forEach(s => { s.lastAt = t.hq.owner.now(); }); // keep the session itself alive
    const r = await p.decide({ itemId: it.id, fingerprint: it.fingerprint, token: it.decisionToken, choice: 'approve' });
    assert.equal(r.status, 410); assert.equal(r.body.code, 'token_expired');
    assert.equal((await p.decide({ itemId: it.id, fingerprint: it.fingerprint, token: it.decisionToken, choice: 'approve' })).body.code, 'token_unknown', 'an expired token is gone');
    assert.equal(decided(t.hq.engine).length, 0);
    const fresh = pick((await p.waiting()).body.items, id);
    assert.equal((await p.decide({ itemId: fresh.id, fingerprint: fresh.fingerprint, token: fresh.decisionToken, choice: 'approve' })).status, 200);
    assert.deepEqual(refusals(t.hq.engine), ['token_expired', 'token_unknown']);
  } finally { await t.hq.close(); }
});

test('replay: a used decision token is refused, and a refreshed listing replaces the older token', async () => {
  const t = await start();
  try {
    const id = await t.objective();
    const { p } = await paired(t);
    const first = pick((await p.waiting()).body.items, id);
    const second = pick((await p.waiting()).body.items, id);
    assert.notEqual(first.decisionToken, second.decisionToken);
    assert.equal((await p.decide({ itemId: first.id, fingerprint: first.fingerprint, token: first.decisionToken, choice: 'approve' })).body.code, 'token_unknown', 'only the latest token per item is live');
    const body = { itemId: second.id, fingerprint: second.fingerprint, token: second.decisionToken, choice: 'approve' };
    assert.equal((await p.decide(body)).status, 200);
    const again = await p.decide(body);
    assert.equal(again.status, 409); assert.equal(again.body.code, 'token_unknown');
    assert.equal(decided(t.hq.engine).length, 1);
  } finally { await t.hq.close(); }
});

test('mismatched action: a token issued for one request cannot decide another, or a different fingerprint; nor a choice the request does not offer', async () => {
  const t = await start();
  try {
    const a = await t.objective(['production-change'], 'Inbox');
    const b = await t.objective(['database-change'], 'Billing');
    const { p } = await paired(t);
    let items = (await p.waiting()).body.items;
    const ia = pick(items, a), ib = pick(items, b);
    let r = await p.decide({ itemId: ib.id, fingerprint: ib.fingerprint, token: ia.decisionToken, choice: 'approve' });
    assert.equal(r.status, 409); assert.equal(r.body.code, 'token_mismatch');
    items = (await p.waiting()).body.items;
    const ia2 = pick(items, a);
    r = await p.decide({ itemId: ia2.id, fingerprint: pick(items, b).fingerprint, token: ia2.decisionToken, choice: 'approve' });
    assert.equal(r.body.code, 'token_mismatch');
    const ia3 = pick((await p.waiting()).body.items, a);
    r = await p.decide({ itemId: ia3.id, fingerprint: ia3.fingerprint, token: ia3.decisionToken, choice: 'merge' });
    assert.equal(r.status, 400); assert.equal(r.body.code, 'bad_choice');
    assert.equal(decided(t.hq.engine).length, 0);
    assert.equal(t.hq.engine.state.objectives[a].status, 'AWAITING_APPROVAL'); assert.equal(t.hq.engine.state.objectives[b].status, 'AWAITING_APPROVAL');
  } finally { await t.hq.close(); }
});

test('changed or superseded request: a decision made against what Kyle saw is refused once the request changes or is cancelled; a new request needs its own token', async () => {
  const t = await start();
  try {
    const id = await t.objective();
    const { p } = await paired(t);
    const it = pick((await p.waiting()).body.items, id);
    // The work behind the request changes after Kyle looked (a different commit): the binding no longer holds.
    t.hq.engine.emit('OBJECTIVE_RESULT', { objectiveId: id, result: { outcome: 'verified', branch: 'hq/impl/x', commit: 'f'.repeat(40), files: ['a.mjs'] } });
    const changed = await p.decide({ itemId: it.id, fingerprint: it.fingerprint, token: it.decisionToken, choice: 'approve' });
    assert.equal(changed.status, 409); assert.equal(changed.body.code, 'changed');
    const fresh = pick((await p.waiting()).body.items, id);
    assert.notEqual(fresh.fingerprint, it.fingerprint);
    assert.equal(fresh.evidence.commit, 'f'.repeat(40));
    // Superseded: Kyle cancels the objective in the Command Center; the phone's pending decision dies with it.
    await t.cc('/api/objectives/cancel', { id, reason: 'Not needed.' });
    assert.ok(await until(() => t.hq.engine.state.objectives[id].status === 'CANCELLED'));
    const gone = await p.decide({ itemId: fresh.id, fingerprint: fresh.fingerprint, token: fresh.decisionToken, choice: 'approve' });
    assert.equal(gone.status, 409); assert.equal(gone.body.code, 'not_pending');
    // A new request (another objective) has a different id and fingerprint: no older token reaches it.
    const other = await t.objective(['production-change'], 'Search');
    const r = await p.decide({ itemId: `gate:${other}:production-change`, fingerprint: fresh.fingerprint, token: fresh.decisionToken, choice: 'approve' });
    assert.equal(r.body.code, 'token_unknown');
    assert.equal(decided(t.hq.engine).length, 0);
    // Unit: the fingerprint covers the objective as submitted.
    const o = structuredClone(t.hq.engine.state.objectives[other]);
    const before = fingerprintOf(o, 'gate', 'production-change');
    o.input.objective += ' Also drop the users table.';
    assert.notEqual(fingerprintOf(o, 'gate', 'production-change'), before);
  } finally { await t.hq.close(); }
});

test('unauthorized: no device, a forged or revoked device, no session, another session\'s token, wrong host, cross-site and header-less requests all fail closed', async () => {
  const t = await start();
  try {
    const id = await t.objective();
    const anon = phone(t.base);
    assert.equal((await anon.open()).status, 401, 'no device cookie');
    anon.cookie = `hq_owner_device=${'A'.repeat(43)}`;
    assert.equal((await anon.open()).status, 401, 'forged device');
    assert.equal((await anon.waiting()).status, 401, 'no session');
    anon.token = 'x'.repeat(43);
    assert.equal((await anon.waiting()).status, 401, 'forged session');
    assert.equal((await anon.decide({ itemId: 'a', fingerprint: 'b', token: 'c', choice: 'approve' })).status, 401);
    // Pairing codes: wrong codes count, a code works once, five wrong tries close the pairing.
    const { body: pairing } = await t.cc('/api/owner/pair', { label: 'Kyle phone' });
    assert.equal((await phone(t.base).pair('0000-0000')).status, 401);
    const p = phone(t.base);
    assert.equal((await p.pair(pairing.code.toLowerCase())).status, 201, 'codes are case-insensitive');
    assert.match((await p.pair(pairing.code)).setCookie ?? '', /^$/, 'no second device from the same code');
    assert.equal((await phone(t.base).pair(pairing.code)).status, 401, 'one-time pairing code');
    const { body: p2 } = await t.cc('/api/owner/pair', { label: 'Spare' });
    for (let i = 0; i < 5; i++) await phone(t.base).pair(`WRONG-${i}`);
    assert.equal((await phone(t.base).pair(p2.code)).status, 401, 'five wrong tries close the pairing');
    assert.equal((await p.open()).status, 201);
    const it = pick((await p.waiting()).body.items, id);
    // Requests without the page header, from another site, or for another host are refused before anything else.
    assert.equal((await p.req('/owner/api/waiting', null, { 'X-HQ-Client': 'other' })).status, 403);
    assert.equal((await p.req('/owner/api/waiting', null, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await p.req('/owner/api/waiting', null, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await raw(t.base, '/owner/api/waiting', { headers: { Host: 'evil.example', 'X-HQ-Client': 'owner-phone', Authorization: `Bearer ${p.token}` } })).status, 403);
    assert.equal((await raw(t.base, '/owner/', { headers: { Host: 'approve.hillink.io' } })).status, 403, 'a public host only when HQ_OWNER_HOST names it');
    // Another session cannot use this session's decision token.
    const q = phone(t.base); q.cookie = p.cookie;
    assert.equal((await q.open()).status, 201);
    const stolen = await q.decide({ itemId: it.id, fingerprint: it.fingerprint, token: it.decisionToken, choice: 'approve' });
    assert.equal(stolen.status, 403); assert.equal(stolen.body.code, 'token_session');
    // Revoking the device ends its sessions at once and the cookie no longer opens one.
    const dev = (await t.cc('/api/owner/devices')).body.devices.find(d => !d.revokedAt);
    assert.equal((await t.cc('/api/owner/revoke', { id: dev.id, reason: 'Lost phone.' })).status, 200);
    assert.equal((await p.waiting()).status, 401);
    assert.equal((await p.open()).status, 401);
    // The owner API is still loopback + session only.
    assert.equal((await fetch(`${t.hq.origin}/api/owner/pair`, { method: 'POST', headers: { 'X-HQ-Client': 'command-center', 'Content-Type': 'application/json' }, body: '{"label":"x"}' })).status, 401);
    assert.equal(decided(t.hq.engine).length, 0);
    assert.equal(t.hq.engine.state.objectives[id].status, 'AWAITING_APPROVAL');
  } finally { await t.hq.close(); }
});

test('duplicate approval: the second of two phones, or a phone after the Command Center, is refused; exactly one decision is journaled', async () => {
  const t = await start();
  try {
    const id = await t.objective();
    const { p: one } = await paired(t, 'Phone one');
    const { p: two } = await paired(t, 'Phone two');
    const a = pick((await one.waiting()).body.items, id), b = pick((await two.waiting()).body.items, id);
    assert.equal(a.fingerprint, b.fingerprint);
    assert.equal((await one.decide({ itemId: a.id, fingerprint: a.fingerprint, token: a.decisionToken, choice: 'approve' })).status, 200);
    const dup = await two.decide({ itemId: b.id, fingerprint: b.fingerprint, token: b.decisionToken, choice: 'deny' });
    assert.equal(dup.status, 409); assert.equal(dup.body.code, 'not_pending');
    assert.deepEqual(decided(t.hq.engine).map(e => e.data.decision), ['approve']);

    const id2 = await t.objective(['database-change'], 'Billing');
    const c = pick((await one.waiting()).body.items, id2);
    assert.equal((await t.cc('/api/objectives/approve', { id: id2, gate: 'database-change', decision: 'approve' })).status, 200);
    const late = await one.decide({ itemId: c.id, fingerprint: c.fingerprint, token: c.decisionToken, choice: 'approve' });
    assert.equal(late.body.code, 'not_pending');
    assert.deepEqual(decided(t.hq.engine).map(e => [e.data.gate, e.data.channel]), [['production-change', 'phone'], ['database-change', 'command-center']]);
  } finally { await t.hq.close(); }
});

test('Kyle decisions: a decision HQ assigned to Kyle is answered from the phone with one of its options, and HQ applies it', async () => {
  const t = await start();
  try {
    const { body } = await t.cc('/api/objectives', { objective: 'Investigate the inbox loader.', type: 'investigate', title: 'Loader' });
    const id = body.id;
    assert.ok(await until(() => t.hq.engine.state.objectives[id]?.plan));
    t.hq.engine.emit('DECISION_REQUESTED', { objectiveId: id, decisionId: 'kyle-spend-1', question: 'Spend on another attempt?', options: [{ id: 'retry', label: 'Retry' }, { id: 'stop', label: 'Stop' }], resume: { authority: 'kyle', type: 'spend', stepId: t.hq.engine.state.objectives[id].order[0] } });
    t.hq.engine.emit('OBJECTIVE_TRANSITION', { objectiveId: id, to: 'AWAITING_DECISION', reason: 'Kyle must decide: Spend on another attempt?' });
    const { p } = await paired(t);
    const it = pick((await p.waiting()).body.items, id);
    assert.equal(it.kind, 'decision'); assert.equal(it.gateType, 'decision:spend');
    assert.deepEqual(it.action.choices.map(c => c.id), ['retry', 'stop']);
    assert.equal((await p.decide({ itemId: it.id, fingerprint: it.fingerprint, token: it.decisionToken, choice: 'approve' })).body.code, 'bad_choice');
    const fresh = pick((await p.waiting()).body.items, id);
    assert.equal((await p.decide({ itemId: fresh.id, fingerprint: fresh.fingerprint, token: fresh.decisionToken, choice: 'stop', note: 'Not worth it.' })).status, 200);
    const rec = t.hq.engine.state.events.find(e => e.type === 'DECISION_RECORDED');
    assert.deepEqual([rec.data.by, rec.data.channel, rec.data.choice, rec.data.audit.fingerprint], ['kyle', 'phone', 'stop', fresh.fingerprint]);
    assert.ok(await until(() => t.hq.engine.state.objectives[id].status === 'CANCELLED'));
    // Orchestrator decisions are not Kyle's queue.
    assert.ok(!waitingForKyle({ objectives: { x: { ...t.hq.engine.state.objectives[id], status: 'AWAITING_DECISION', decisions: { d: { id: 'd', status: 'PENDING', question: 'q', options: [], resume: { authority: 'orchestrator' }, requestedAt: 1 } } } } }).length);
  } finally { await t.hq.close(); }
});

test('the door is off unless enabled, listens on loopback only, refuses a bad public host, and a session expires when idle', async () => {
  const off = await createHQ({ port: 0, store: new MemoryStore(), intervalMs: 50, env: {} });
  try {
    assert.equal(off.ownerDoor().status, 'DISABLED');
    const headers = { 'X-HQ-Client': 'command-center' };
    headers.Authorization = `Bearer ${(await fetch(`${off.origin}/api/session`, { headers }).then(r => r.json())).token}`;
    const r = await fetch(`${off.origin}/api/owner/pair`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{"label":"x"}' });
    assert.equal(r.status, 400); assert.match((await r.json()).error, /not enabled/);
  } finally { await off.close(); }
  const bad = await createHQ({ port: 0, store: new MemoryStore(), intervalMs: 50, env: { HQ_OWNER_PORT: '0', HQ_OWNER_HOST: 'approve.hillink.io/evil' }, ownerDoor: true });
  try { assert.match(bad.ownerDoor().status, /^UNAVAILABLE: HQ_OWNER_HOST/); } finally { await bad.close(); }
  const t = await start();
  try {
    assert.equal(t.hq.owner.server.address().address, '127.0.0.1');
    const { p } = await paired(t);
    assert.equal((await p.waiting()).status, 200);
    const realNow = t.hq.owner.now;
    t.hq.owner.now = () => realNow() + t.hq.owner.limits.sessionIdleMs + 1;
    assert.equal((await p.waiting()).status, 401);
    t.hq.owner.now = realNow;
    assert.equal((await p.open()).status, 201, 'the paired device opens a new session');
    // The public host gets a Secure cookie; loopback does not.
    const pub = await createHQ({ port: 0, store: new MemoryStore(), intervalMs: 50, env: { HQ_OWNER_PORT: '0', HQ_OWNER_HOST: 'approve.hillink.io' }, ownerDoor: true });
    try {
      const door = pub.owner;
      const { code } = door.startPairing({ label: 'Kyle phone' }, { by: 'kyle' });
      const headers = { Host: 'approve.hillink.io', 'X-HQ-Client': 'owner-phone', 'Content-Type': 'application/json' };
      assert.equal((await raw(pub.ownerDoor().base, '/owner/api/pair', { method: 'POST', headers: { ...headers, Origin: 'http://approve.hillink.io' }, body: JSON.stringify({ code }) })).status, 403, 'the public origin is https');
      const r = await raw(pub.ownerDoor().base, '/owner/api/pair', { method: 'POST', headers: { ...headers, Origin: 'https://approve.hillink.io' }, body: JSON.stringify({ code }) });
      assert.equal(r.status, 201, r.body); assert.match(r.headers['set-cookie'][0], /HttpOnly; SameSite=Strict; Path=\/owner\/api\/; Max-Age=\d+; Secure/);
      assert.equal((await raw(pub.ownerDoor().base, '/owner/', { headers: { Host: 'approve.hillink.io' } })).status, 200);
      assert.throws(() => door.startPairing({ label: 'x' }, { by: 'chatgpt' }), /Only Kyle/);
    } finally { await pub.close(); }
  } finally { await t.hq.close(); }
  assert.ok(new OwnerDoor({ state: {}, now: () => 0, emit() {} }).limits.tokenMs > 0);
});
