import fs from 'node:fs';
import path from 'node:path';

export class MemoryStore {
  constructor(events = []) { this.events = structuredClone(events); }
  read() { return structuredClone(this.events); }
  append(event) { this.events.push(structuredClone(event)); }
  close() {}
}

// One controller owns the log. A second process must never dispatch from stale state.
export class FileStore {
  constructor(directory) {
    fs.mkdirSync(directory, { recursive: true });
    this.lockPath = path.join(directory, 'controller.lock');
    this.logPath = path.join(directory, 'events.jsonl');
    try { this.lock = fs.openSync(this.lockPath, 'wx', 0o600); }
    catch (error) {
      if (error.code === 'EEXIST') throw Error(`Controller lock exists: ${this.lockPath}. Confirm the previous controller and workers stopped before removing this lock.`);
      throw error;
    }
    fs.writeSync(this.lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    try {
      this.fd = fs.openSync(this.logPath, 'a+', 0o600);
      this.read(); // Fail closed on corruption, never quietly discard evidence.
    } catch (error) { this.close(); throw error; }
  }
  read() {
    const raw = fs.readFileSync(this.logPath, 'utf8');
    if (raw && !raw.endsWith('\n')) throw Error('Incomplete event log tail; preserve the log and repair before restarting.');
    return raw.split('\n').filter(Boolean).map((line, index) => {
      const event = JSON.parse(line);
      if (event.seq !== index + 1 || !event.id || !Number.isFinite(event.at) || typeof event.type !== 'string' || !event.data) throw Error(`Invalid event log at sequence ${index + 1}`);
      return event;
    });
  }
  append(event) {
    const bytes = Buffer.from(JSON.stringify(event) + '\n');
    let offset = 0;
    while (offset < bytes.length) {
      const written = fs.writeSync(this.fd, bytes, offset, bytes.length - offset);
      if (!written) throw Error('Event journal write made no progress');
      offset += written;
    }
    fs.fsyncSync(this.fd);
  }
  close() {
    if (this.fd !== undefined) { fs.closeSync(this.fd); this.fd = undefined; }
    if (this.lock !== undefined) { fs.closeSync(this.lock); this.lock = undefined; fs.unlinkSync(this.lockPath); }
  }
}
