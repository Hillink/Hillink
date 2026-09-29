// Local static server for Hillink World. Loopback only, allowlisted files, no API and no data access.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const allowed = new Set(['index.html', 'style.css', 'main.mjs', ...['core', 'engine', 'render', 'ui', 'sim', 'adapters'].flatMap(dir => {
  try { return fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.mjs')).map(f => `${dir}/${f}`); } catch { return []; }
})]);

export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    if (req.method !== 'GET' || !allowed.has(file)) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'" });
    res.end(fs.readFileSync(path.join(root, file)));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.WORLD_PORT || 4320);
  createServer().listen(port, '127.0.0.1', () => console.log(`Hillink World: http://127.0.0.1:${port} (simulation mode; no Hillink data access)`));
}
