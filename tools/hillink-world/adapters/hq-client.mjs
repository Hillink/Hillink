// Browser side of the HQ adapter: polls the World server's read-only HQ feed and feeds the store.
// The World server holds the HQ session; the page never sees an HQ token.
import { emptyWorld } from '../core/state.mjs';
import { makeEvent } from '../core/events.mjs';
import { HqTranslator } from './hq.mjs';

export async function hqAvailable() {
  try { const r = await fetch('/api/hq', { cache: 'no-store' }); return r.ok && !(await r.json()).offline; } catch { return false; }
}

export function connectHq(store, { intervalMs = 2000, onStatus = () => {} } = {}) {
  const translator = new HqTranslator();
  let timer = null, stopped = false, online = null;
  const status = next => { if (next !== online) { online = next; onStatus(next); } };
  async function poll() {
    try {
      const r = await fetch('/api/hq', { cache: 'no-store' });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || body.offline) throw Error(body.error ?? `HTTP ${r.status}`);
      const { reset, events } = translator.ingest(body);
      if (reset) store.replace(emptyWorld()); // backend truth replaces whatever was shown
      store.dispatchAll(events);
      status(true);
    } catch (error) {
      if (online !== false && store.world.systems.hq) store.dispatch(makeEvent('SYSTEM_STATUS', { systemId: 'hq', state: 'down', detail: `HQ unreachable: ${error.message}` }, { source: 'hq' }));
      translator.seq = 0; // rebuild from a fresh snapshot when HQ returns
      status(false);
    }
    if (!stopped) timer = setTimeout(poll, intervalMs);
  }
  poll();
  return () => { stopped = true; clearTimeout(timer); };
}
