import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const workerPath = fileURLToPath(new URL('./worker.mjs', import.meta.url));
export class LocalAdapter {
  constructor({ spawnWorker = spawn, cancelGraceMs = 1000 } = {}) {
    this.children = new Map(); this.spawnWorker = spawnWorker; this.cancelGraceMs = cancelGraceMs;
  }
  async health() { return { status: 'IDLE', detail: 'Local Node worker launcher available; no model credits source.' }; }
  async start({ task, runId, emit }) {
    if (!['inspect-repo', 'verify-hq', 'verify-unit'].includes(task.operation) || task.safety !== 'local-read-only') throw Error('Unsafe or unsupported operation');
    // No inherited .env, provider tokens, Supabase credentials or arbitrary shell.
    const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
    const child = this.spawnWorker(process.execPath, [workerPath, task.operation], { env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    const entry = { child, closed: false, cancelled: false };
    this.children.set(runId, entry);
    let acknowledged = false, stderr = '';
    child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-1000); });
    child.on('message', message => {
      if (entry.cancelled || entry.closed) return;
      try {
        // The adapter owns terminal completion; an IPC message cannot finish a live process.
        if (['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'].includes(message.kind)) return;
        emit(message);
        if (message.kind === 'ACK') acknowledged = true;
      } catch { void this.cancel(runId); }
    });
    child.on('error', error => { stderr = error.message; });
    entry.closedPromise = new Promise(resolve => child.once('close', (code, signal) => {
      entry.closed = true; this.children.delete(runId);
      try {
        emit({ kind: entry.cancelled ? 'CANCELLED' : code === 0 && acknowledged ? 'COMPLETED' : 'FAILED', summary: entry.cancelled ? 'Worker termination confirmed by process close.' : `Local process exited ${code ?? signal}${stderr ? `: ${stderr}` : ''}` });
      } catch { /* A fenced/recovered run may already be terminal. */ }
      resolve(true);
    }));
  }
  async cancel(runId) {
    const entry = this.children.get(runId);
    if (!entry) return false; // Absence is not proof a pre-restart worker stopped.
    if (entry.cancellation) return entry.cancellation;
    entry.cancelled = true;
    // Two bounded waits fit within the engine's default 3s adapter deadline.
    // Signal acceptance (including SIGKILL) is never proof of termination.
    entry.cancellation = (async () => {
      for (const signal of ['SIGTERM', 'SIGKILL']) {
        if (entry.closed) return true;
        try { entry.child.kill(signal); } catch { /* Still await close evidence. */ }
        let timer;
        try {
          if (await Promise.race([entry.closedPromise, new Promise(resolve => { timer = setTimeout(() => resolve(false), this.cancelGraceMs); })])) return true;
        } finally { clearTimeout(timer); }
      }
      return false; // Keep the run/lease unresolved if even forced termination is unconfirmed.
    })();
    return entry.cancellation;
  }
  async close() { await Promise.all([...this.children.keys()].map(id => this.cancel(id))); }
}
