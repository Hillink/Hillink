// HQ sandbox allowlist proxy: the only network path out of Claude's namespace. HTTP CONNECT on a Unix socket; only
// api.anthropic.com:443 is allowed. Everything else (other hosts, plain HTTP, IP literals, localhost, the Windows
// host) is refused and logged. Runs as root outside Claude's namespace; Claude cannot reconfigure it. The socket is
// root-only: Claude reaches it through the root-owned relay in its namespace; test code cannot reach it at all.
import net from 'node:net';
import fs from 'node:fs';
const [sock, logFile] = process.argv.slice(2);
const ALLOW = new Set(['api.anthropic.com:443']);
const log = line => { try { fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`); } catch { /* best effort */ } };
try { fs.unlinkSync(sock); } catch { /* fresh */ }
const server = net.createServer(client => {
  let head = '';
  client.setTimeout(30_000, () => client.destroy());
  client.on('data', function first(chunk) {
    head += chunk.toString('latin1');
    if (head.length > 8192) { client.end('HTTP/1.1 431 Too Large\r\n\r\n'); return; }
    const end = head.indexOf('\r\n\r\n'); if (end < 0) return;
    client.removeListener('data', first);
    const m = /^CONNECT ([A-Za-z0-9.-]+):(\d{1,5}) HTTP\/1\.[01]\r\n/.exec(head);
    const target = m ? `${m[1].toLowerCase()}:${m[2]}` : null;
    if (!target || !ALLOW.has(target)) { log(`DENY ${head.split('\r\n')[0].slice(0, 200)}`); client.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    const upstream = net.connect({ host: m[1], port: Number(m[2]) }, () => {
      log(`ALLOW ${target}`);
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      const rest = Buffer.from(head.slice(end + 4), 'latin1'); if (rest.length) upstream.write(rest);
      client.pipe(upstream); upstream.pipe(client);
    });
    upstream.on('error', () => client.destroy()); client.on('error', () => upstream.destroy());
  });
});
server.listen(sock, () => { fs.chmodSync(sock, 0o600); log('proxy ready'); });
