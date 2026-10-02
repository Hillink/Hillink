// The owner door: Kyle approves or denies HQ's owner-gated actions from his phone while the laptop runs HQ.
//
// It is a second HTTP listener on loopback only (HQ_OWNER_PORT, default 4314). The laptop is never exposed: the phone
// reaches it only through the Cloudflare named tunnel HQ already uses (an outbound connection from the laptop), on its
// own hostname (HQ_OWNER_HOST), ideally behind Cloudflare Access as an outer layer. HQ itself enforces:
//
//   pairing    Kyle starts a pairing in the Command Center (loopback owner API). HQ shows a one-time code (10 minutes,
//              5 wrong tries, one pairing open at a time). The phone exchanges it for a device secret (256 bits) that
//              lives only in an HttpOnly, SameSite=Strict cookie. HQ journals the device with the secret's sha256.
//              Devices expire 30 days after their last use (each session renews them) and Kyle can revoke one in the
//              Command Center.
//   session    The phone trades its device cookie for a short session token (15 minutes idle, 12 hours at most), sent
//              as a bearer header, so a cross-site request can never act. Revoking the device ends its sessions.
//   decisions  Listing "Waiting for Kyle" gives each item a one-time decision token (10 minutes) bound to that session,
//              that item and its fingerprint (owner/queue.mjs). A decision must present all three; HQ consumes the
//              token first, then re-reads the item and refuses if it is gone, decided, superseded or changed. Only
//              then does it call the same Conductor approve/decide the Command Center uses (by kyle, channel phone),
//              with an audit record. The Conductor resumes the objective on its next tick.
//
// Everything in memory here (pairing codes, sessions, decision tokens) is lost on restart: that fails closed.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { findItem, waitingForKyle } from './queue.mjs';
import { deviceView } from './state.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
export const OWNER_LIMITS = { pairingMs: 10 * 60_000, pairFailures: 5, deviceMs: 30 * 86_400_000, renewEveryMs: 86_400_000, sessionIdleMs: 15 * 60_000, sessionMaxMs: 12 * 3_600_000, tokenMs: 10 * 60_000, refusalsPerSession: 10, failuresPerMinute: 30, labelMax: 60, noteMax: 600, bodyMax: 8_192 };
const COOKIE = 'hq_owner_device';
const sha = v => createHash('sha256').update(String(v)).digest('hex');
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const clip = (v, n) => (v == null ? null : String(v).slice(0, n));
// Crockford base32 without padding: easy to read off a laptop screen and type on a phone.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function code() {
  const bytes = randomBytes(20); let bits = 0, value = 0, out = '';
  for (const b of bytes) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  return out.match(/.{4}/g).join('-');
}
const normalizeCode = c => String(c ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');

export class OwnerError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export class OwnerDoor {
  constructor(engine, { conductor = engine.conductor, now = () => engine.now(), limits = {} } = {}) {
    this.engine = engine; this.conductor = conductor; this.now = now;
    this.limits = { ...OWNER_LIMITS, ...limits };
    this.pairing = null;            // the one open pairing: { id, label, codeHash, expiresAt, failures }
    this.sessions = new Map();      // tokenHash -> { id, deviceId, createdAt, lastAt, refusals }
    this.tokens = new Map();        // tokenHash -> { id, itemId, fingerprint, sessionId, deviceId, expiresAt }
    this.latest = new Map();        // `${sessionId}|${itemId}` -> tokenHash (one live token per session and item)
    this.failures = [];             // timestamps of unauthenticated failures, for the global rate limit
  }

  // ---- owner API (loopback Command Center only) ----
  startPairing({ label } = {}, { by } = {}) {
    if (by !== 'kyle') throw Error('Only Kyle can pair a phone.');
    if (typeof label !== 'string' || !label.trim() || label.trim().length > this.limits.labelMax) throw Error(`label must be 1 to ${this.limits.labelMax} characters`);
    const c = code(), id = randomUUID(), expiresAt = this.now() + this.limits.pairingMs;
    this.pairing = { id, label: label.trim(), codeHash: sha(normalizeCode(c)), expiresAt, failures: 0 };
    this.engine.emit('OWNER_PAIRING_STARTED', { pairingId: id, label: label.trim(), expiresAt, by });
    return { pairingId: id, code: c, expiresAt };
  }
  devices() { return Object.values(this.engine.state.owner?.devices ?? {}).map(deviceView); }
  revokeDevice(id, { by, reason = null } = {}) {
    if (by !== 'kyle') throw Error('Only Kyle can revoke a phone.');
    const d = this.engine.state.owner?.devices?.[id];
    if (!d) throw Error('Unknown device');
    if (d.revokedAt) return { id, alreadyRevoked: true };
    this.engine.emit('OWNER_DEVICE_REVOKED', { deviceId: id, by, reason: clip(reason, 300) });
    this.endSessions(s => s.deviceId === id);
    return { id, revoked: true };
  }
  waiting() { return waitingForKyle(this.engine.state); }

  // ---- phone side ----
  limited() {
    const t = this.now();
    this.failures = this.failures.filter(x => t - x < 60_000);
    if (this.failures.length >= this.limits.failuresPerMinute) throw new OwnerError(429, 'rate_limited', 'Too many failed attempts; wait a minute.');
  }
  fail(status, code, message) { this.failures.push(this.now()); return new OwnerError(status, code, message); }

  pair(rawCode, meta = {}) {
    this.limited();
    const p = this.pairing;
    if (!p || p.expiresAt <= this.now()) { this.pairing = null; throw this.fail(401, 'pairing_invalid', 'No pairing is open, or it expired. Start a new one in the HQ Command Center.'); }
    if (!same(sha(normalizeCode(rawCode)), p.codeHash)) {
      p.failures += 1;
      if (p.failures >= this.limits.pairFailures) this.pairing = null;
      throw this.fail(401, 'pairing_invalid', 'That pairing code is not valid.');
    }
    this.pairing = null; // one-time
    const secret = randomBytes(32).toString('base64url'), deviceId = randomUUID(), expiresAt = this.now() + this.limits.deviceMs;
    this.engine.emit('OWNER_DEVICE_PAIRED', { deviceId, label: p.label, credentialHash: sha(secret), pairingId: p.id, expiresAt, ip: clip(meta.ip, 64), userAgent: clip(meta.userAgent, 160) });
    return { deviceId, label: p.label, secret, expiresAt };
  }
  device(secret) {
    if (typeof secret !== 'string' || secret.length < 40 || secret.length > 64) return null;
    const hash = sha(secret);
    let found = null;
    for (const d of Object.values(this.engine.state.owner?.devices ?? {})) if (same(hash, d.credentialHash)) found = d;
    return found && !found.revokedAt && found.expiresAt > this.now() ? found : null;
  }
  openSession(secret) {
    this.limited();
    const d = this.device(secret);
    if (!d) throw this.fail(401, 'device_invalid', 'This phone is not paired with HQ (or its pairing was revoked or expired).');
    const token = randomBytes(32).toString('base64url'), id = randomUUID(), t = this.now();
    // Auto-renew (Kyle, 2026-10-02): a phone that opens the door gets a fresh device lifetime, journaled at most once a
    // day. Only a valid, unrevoked, unexpired device reaches here, so a lapsed or revoked phone still has to re-pair.
    if (d.expiresAt - t < this.limits.deviceMs - this.limits.renewEveryMs) this.engine.emit('OWNER_DEVICE_RENEWED', { deviceId: d.id, expiresAt: t + this.limits.deviceMs });
    this.sessions.set(sha(token), { id, deviceId: d.id, createdAt: t, lastAt: t, refusals: 0 });
    return { token, expiresAt: t + this.limits.sessionIdleMs, device: { id: d.id, label: d.label, expiresAt: d.expiresAt } };
  }
  session(token) {
    this.limited();
    const key = typeof token === 'string' ? sha(token) : null, s = key && this.sessions.get(key), t = this.now();
    if (!s) throw this.fail(401, 'session_invalid', 'Owner session required.');
    const d = this.engine.state.owner?.devices?.[s.deviceId];
    if (t - s.lastAt > this.limits.sessionIdleMs || t - s.createdAt > this.limits.sessionMaxMs || !d || d.revokedAt || d.expiresAt <= t) {
      this.endSessions(x => x.id === s.id);
      throw this.fail(401, 'session_expired', 'Owner session expired; open it again.');
    }
    s.lastAt = t;
    return s;
  }
  endSessions(match) {
    for (const [k, s] of this.sessions) if (match(s)) { this.sessions.delete(k); for (const [tk, tok] of this.tokens) if (tok.sessionId === s.id) this.tokens.delete(tk); }
  }

  // The queue as the phone sees it: each item carries a fresh one-time decision token for this session.
  list(s) {
    const t = this.now();
    for (const [k, tok] of this.tokens) if (tok.expiresAt <= t) this.tokens.delete(k);
    return this.waiting().map(item => {
      const key = `${s.id}|${item.id}`, previous = this.latest.get(key);
      if (previous) this.tokens.delete(previous);
      const token = randomBytes(24).toString('base64url'), hash = sha(token), expiresAt = t + this.limits.tokenMs;
      this.tokens.set(hash, { id: hash.slice(0, 16), itemId: item.id, fingerprint: item.fingerprint, sessionId: s.id, deviceId: s.deviceId, expiresAt });
      this.latest.set(key, hash);
      return { ...item, decisionToken: token, expiresAt };
    });
  }

  decide(s, input, meta = {}) {
    const { itemId, fingerprint, token, choice } = input ?? {};
    const note = typeof input?.note === 'string' && input.note.trim() ? clip(input.note.trim(), this.limits.noteMax) : null;
    const refuse = (status, code, message, tok = null) => {
      this.engine.emit('OWNER_DECISION_REFUSED', { itemId: clip(itemId, 200), code, deviceId: s.deviceId, sessionId: s.id.slice(0, 8), tokenId: tok?.id ?? null, ip: clip(meta.ip, 64) });
      s.refusals += 1;
      if (s.refusals >= this.limits.refusalsPerSession) this.endSessions(x => x.id === s.id);
      return new OwnerError(status, code, message);
    };
    if ([itemId, fingerprint, token, choice].some(v => typeof v !== 'string' || !v || v.length > 300)) throw refuse(400, 'bad_request', 'itemId, fingerprint, token and choice are required.');
    const hash = sha(token), tok = this.tokens.get(hash);
    if (!tok) throw refuse(409, 'token_unknown', 'This decision link was already used or is no longer valid. Refresh and decide again.');
    this.tokens.delete(hash); // one-time: consumed before anything else is checked
    if (this.latest.get(`${tok.sessionId}|${tok.itemId}`) === hash) this.latest.delete(`${tok.sessionId}|${tok.itemId}`);
    if (tok.sessionId !== s.id) throw refuse(403, 'token_session', 'This decision belongs to another session.', tok);
    if (tok.expiresAt <= this.now()) throw refuse(410, 'token_expired', 'This decision expired. Refresh and decide again.', tok);
    if (tok.itemId !== itemId || tok.fingerprint !== fingerprint) throw refuse(409, 'token_mismatch', 'This decision does not match the request it was issued for.', tok);
    const item = findItem(this.engine.state, itemId);
    if (!item) throw refuse(409, 'not_pending', 'This request is no longer waiting for you (decided, cancelled or superseded).', tok);
    if (item.fingerprint !== fingerprint) throw refuse(409, 'changed', 'This request changed since you saw it. Refresh and review it again.', tok);
    if (!item.action.choices.some(c => c.id === choice)) throw refuse(400, 'bad_choice', `choice must be one of ${item.action.choices.map(c => c.id).join(', ')}`, tok);
    const audit = { deviceId: s.deviceId, sessionId: s.id.slice(0, 8), tokenId: tok.id, fingerprint, itemId, ip: clip(meta.ip, 64), userAgent: clip(meta.userAgent, 160), shownUntil: tok.expiresAt };
    // Synchronous from the fingerprint check to the journal write: nothing can change the item in between.
    const out = item.kind === 'gate'
      ? this.conductor.approve(item.objective.id, item.action.gate, choice, { by: 'kyle', note, channel: 'phone', audit })
      : this.conductor.decide(item.objective.id, item.action.decisionId, choice, { by: 'kyle', rationale: note ?? '', channel: 'phone', audit });
    return { itemId, kind: item.kind, objectiveId: item.objective.id, choice, recorded: out };
  }

  // ---- HTTP ----
  async listen({ port = 4314, publicHost = null } = {}) {
    const allowed = new Set([publicHost].filter(Boolean));
    const server = http.createServer((req, res) => this.handle(req, res, { allowed, port: server.address().port, publicHost }));
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    const actual = server.address().port;
    this.server = server;
    return { port: actual, base: `http://127.0.0.1:${actual}`, close: () => new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve); }) };
  }
  async handle(req, res, { allowed, port, publicHost }) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const json = (code, value, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(value)); };
    try {
      const host = req.headers.host ?? '';
      const local = host === `127.0.0.1:${port}` || host === `localhost:${port}`;
      if (!local && !allowed.has(host)) return json(403, { error: 'Invalid host' });
      const secure = !local && host === publicHost;
      const origin = `${secure ? 'https' : 'http'}://${host}`;
      const url = new URL(req.url, origin);
      const assets = { '/owner/': ['owner.html', 'text/html; charset=utf-8'], '/owner/owner.mjs': ['owner.mjs', 'text/javascript'], '/owner/owner.css': ['owner.css', 'text/css'] };
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/owner')) { res.writeHead(302, { Location: '/owner/' }); return res.end(); }
      if (req.method === 'GET' && assets[url.pathname]) { const [file, type] = assets[url.pathname]; res.writeHead(200, { 'Content-Type': type }); return res.end(fs.readFileSync(path.join(here, '..', 'public', file))); }
      if (!url.pathname.startsWith('/owner/api/')) return json(404, { error: 'Not found' });
      // Writes need the page's own header and, when the browser sends them, a same-origin Origin and fetch site.
      if (req.headers['x-hq-client'] !== 'owner-phone' || (req.headers.origin && req.headers.origin !== origin) || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) return json(403, { error: 'Same-origin HQ owner page required' });
      const meta = { ip: req.headers['cf-connecting-ip'] ?? req.socket.remoteAddress, userAgent: req.headers['user-agent'] };
      const bearer = String(req.headers.authorization ?? '').match(/^Bearer (\S{20,100})$/)?.[1] ?? null;
      const deviceCookie = secret => `${COOKIE}=${secret}; HttpOnly; SameSite=Strict; Path=/owner/api/; Max-Age=${Math.floor(this.limits.deviceMs / 1000)}${secure ? '; Secure' : ''}`;
      if (req.method === 'POST' && url.pathname === '/owner/api/pair') {
        const b = await this.body(req);
        const out = this.pair(b?.code, meta);
        return json(201, { deviceId: out.deviceId, label: out.label, expiresAt: out.expiresAt }, { 'Set-Cookie': deviceCookie(out.secret) });
      }
      // A session renews the device (openSession), so the browser's cookie is renewed with it: same secret, fresh Max-Age.
      if (req.method === 'POST' && url.pathname === '/owner/api/session') { const secret = this.cookie(req); return json(201, this.openSession(secret), { 'Set-Cookie': deviceCookie(secret) }); }
      const s = this.session(bearer);
      if (req.method === 'GET' && url.pathname === '/owner/api/waiting') return json(200, { now: this.now(), items: this.list(s) });
      if (req.method === 'POST' && url.pathname === '/owner/api/decide') return json(200, this.decide(s, await this.body(req), meta));
      if (req.method === 'POST' && url.pathname === '/owner/api/logout') { this.endSessions(x => x.id === s.id); return json(200, { ok: true }); }
      return json(404, { error: 'Not found' });
    } catch (error) {
      if (error instanceof OwnerError) return json(error.status, { error: error.message, code: error.code });
      // Anything else (a Conductor refusal, bad JSON) fails closed without detail beyond its message.
      return json(400, { error: clip(error.message, 300), code: 'refused' });
    }
  }
  cookie(req) {
    for (const part of String(req.headers.cookie ?? '').split(';')) { const [k, ...v] = part.trim().split('='); if (k === COOKIE) return v.join('='); }
    return null;
  }
  async body(req) {
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new OwnerError(415, 'json_required', 'JSON content type required');
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > this.limits.bodyMax) throw new OwnerError(413, 'too_large', 'Request too large'); }
    try { return JSON.parse(raw); } catch { throw new OwnerError(400, 'bad_json', 'Invalid JSON'); }
  }
}
