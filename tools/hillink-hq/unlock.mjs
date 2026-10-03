import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyState, reduce } from './engine.mjs';

// Conservative convenience after a stopped controller with no unresolved workers.
// Uncertain workers still require manual investigation; this never kills a process.
export function unlock(directory) {
const lockPath = path.join(directory, 'controller.lock');
const raw = fs.readFileSync(lockPath, 'utf8');
const { pid } = JSON.parse(raw);
if (!Number.isSafeInteger(pid) || pid <= 0) throw Error('Invalid controller PID; investigate manually');
try { process.kill(pid, 0); throw Error('Controller PID still exists; refusing to unlock'); }
catch (error) { if (error.code !== 'ESRCH') throw error; }
const journal = fs.readFileSync(path.join(directory, 'events.jsonl'), 'utf8');
if (journal && !journal.endsWith('\n')) throw Error('Incomplete journal; refusing to unlock');
const events = journal.split('\n').filter(Boolean).map((line, index) => {
  const event = JSON.parse(line); if (event.seq !== index + 1) throw Error('Invalid journal sequence'); return event;
});
const state = events.reduce(reduce, emptyState());
if (Object.values(state.runs).some(run => !run.endedAt)) throw Error('Unresolved worker runs exist. Verify every worker stopped before manual lock recovery.');
if (fs.readFileSync(lockPath, 'utf8') !== raw) throw Error('Controller lock changed; refusing to unlock');
fs.unlinkSync(lockPath);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  unlock(process.env.HQ_STATE_DIR || fileURLToPath(new URL('./.state', import.meta.url)));
  console.log('Removed stale controller lock: PID absent and every recorded worker run is terminal. Event history preserved.');
}
