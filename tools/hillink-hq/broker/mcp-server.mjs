// Pass 4.5: the broker's MCP endpoint for the subscription Claude (Streamable HTTP transport, JSON responses).
//
// - Listens on 127.0.0.1 only, on a random port, inside HQ's own process. The sandbox cannot reach it: every sandbox
//   step runs in a network namespace with no interface up (and the WSL instance's steps likewise).
// - One URL and one 256-bit bearer token per session. The token exists only in HQ's memory and in the MCP config file
//   HQ writes (mode 0600, private temp directory) for that one Claude process; it never enters the sandbox.
// - Requests must carry the session's exact Host header (no DNS rebinding) and no Origin (no browser page can call it).
// - Exposes only tools/list and tools/call for the fixed broker tools. No resources, prompts or sampling.
import crypto from 'node:crypto';
import http from 'node:http';
import { BrokerSession } from './session.mjs';
import { TOOLS, BROKER_SERVER } from './policy.mjs';

const MAX_BODY = 1_000_000;
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export class BrokerServer {
  constructor({ host = '127.0.0.1' } = {}) { this.host = host; this.sessions = new Map(); this.server = null; this.stats = { rejected: 0 }; }
  async start() {
    if (this.server) return this;
    this.server = http.createServer((req, res) => this.handle(req, res));
    this.server.headersTimeout = 10_000; this.server.requestTimeout = 400_000;
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(0, this.host, resolve); });
    this.port = this.server.address().port;
    return this;
  }
  // Opens a session bound to one run. Returns what HQ puts in Claude's MCP config (url + token), plus the session.
  open(opts) {
    if (!this.server) throw Error('broker server not started');
    const id = crypto.randomUUID(), token = crypto.randomBytes(32).toString('hex');
    const session = new BrokerSession({ ...opts, id });
    this.sessions.set(id, { session, token });
    const url = `http://${this.host}:${this.port}/mcp/${id}`;
    return { session, url, token, mcpConfig: { mcpServers: { [BROKER_SERVER]: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } } } };
  }
  // Closing removes the session: its URL and token stop existing.
  closeSession(id, reason) { const s = this.sessions.get(id); if (!s) return false; s.session.close(reason); this.sessions.delete(id); return true; }
  async close() {
    for (const id of [...this.sessions.keys()]) this.closeSession(id, 'broker server stopped');
    if (this.server) await new Promise(resolve => this.server.close(() => resolve()));
    this.server?.closeAllConnections?.();
    this.server = null;
  }
  reject(res, status) { this.stats.rejected++; res.writeHead(status, { 'content-type': 'text/plain' }).end(); }
  handle(req, res) {
    const m = /^\/mcp\/([0-9a-f-]{36})$/.exec(req.url ?? '');
    const entry = m && this.sessions.get(m[1]);
    if (!entry) return this.reject(res, 404);
    if (req.headers.host !== `${this.host}:${this.port}` || req.headers.origin !== undefined) return this.reject(res, 403);
    if (!same(req.headers.authorization ?? '', `Bearer ${entry.token}`)) return this.reject(res, 401);
    if (req.method !== 'POST') return this.reject(res, 405);
    let size = 0; const chunks = [];
    req.on('data', d => { size += d.length; if (size > MAX_BODY) { req.destroy(); } else chunks.push(d); });
    req.on('end', async () => {
      let msg; try { msg = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return this.rpc(res, null, null, { code: -32700, message: 'parse error' }); }
      if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return this.rpc(res, msg?.id ?? null, null, { code: -32600, message: 'invalid request' });
      if (msg.id === undefined) { res.writeHead(202).end(); return; } // notifications need no answer
      // The session may have been closed while this request was in flight.
      if (!this.sessions.has(m[1])) return this.reject(res, 404);
      try { return this.rpc(res, msg.id, await this.dispatch(entry.session, msg)); }
      catch (error) { return this.rpc(res, msg.id, null, { code: error.rpcCode ?? -32603, message: String(error.message).slice(0, 200) }); }
    });
  }
  async dispatch(session, msg) {
    switch (msg.method) {
      case 'initialize': return { protocolVersion: typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion.slice(0, 20) : '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'hillink-hq-broker', version: '4.5' }, instructions: 'Hillink HQ implementation broker. These tools are your only access to the task repository, which lives in a disposable sandbox. HQ enforces every limit.' };
      case 'ping': return {};
      case 'tools/list': return { tools: TOOLS };
      case 'tools/call': {
        const r = await session.call(msg.params?.name, msg.params?.arguments);
        return { content: [{ type: 'text', text: r.text }], isError: r.isError };
      }
      default: throw Object.assign(Error('method not supported'), { rpcCode: -32601 });
    }
  }
  rpc(res, id, result, error = null) {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(error ? { jsonrpc: '2.0', id, error } : { jsonrpc: '2.0', id, result }));
  }
}
