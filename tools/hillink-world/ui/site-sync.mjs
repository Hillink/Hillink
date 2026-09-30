// Pass 5B correction: how the page gets the generated canonical world (GET /api/site) and keeps it current. Pure
// logic with injected I/O, so it runs in Node tests and the browser alike.
//
//   - The signature of the world being displayed is the one polls compare with, so the first poll that returns a
//     newer world (say, construction completed between boot and the first poll) is applied like any later one.
//   - A boot that cannot load the generated world retries; if it still fails the World says so ('unavailable') and
//     keeps retrying. The hand-built legacy building is shown then only as an identified fallback, never as the live
//     generated World. Legacy as the normal World only when explicitly asked for (?world=legacy).
export const signatureOf = world => (world ? JSON.stringify(world) : null);

// fetchSite(): the world object, or throws. Returns { world, error, attempts }.
export async function loadSite(fetchSite, { attempts = 3, wait = () => Promise.resolve() } = {}) {
  let error = null;
  for (let k = 1; k <= attempts; k++) {
    try { const world = await fetchSite(); if (!world || typeof world !== 'object') throw Error('no world in the response'); return { world, error: null, attempts: k }; }
    catch (e) { error = String(e?.message ?? e).slice(0, 200); if (k < attempts) await wait(k); }
  }
  return { world: null, error, attempts };
}

// source: 'generated' | 'unavailable' | 'legacy' (explicitly selected). apply(world) switches the display to it.
export function createSiteSync({ fetchSite, apply, report = () => {}, source, world = null }) {
  let shown = signatureOf(world), state = source, error = null;
  return {
    get state() { return state; },
    get error() { return error; },
    get shownSignature() { return shown; },
    // The display changed by other means (a demo step on a simulated copy is never polled).
    shown(w) { shown = signatureOf(w); },
    async poll() {
      if (state === 'legacy') return false;
      try {
        const w = await fetchSite();
        if (!w || typeof w !== 'object') throw Error('no world in the response');
        const sig = signatureOf(w), changed = sig !== shown;
        shown = sig; error = null;
        const was = state; state = 'generated';
        if (changed || was !== 'generated') apply(w, { recovered: was === 'unavailable' });
        report({ state, error });
        return changed;
      } catch (e) {
        error = String(e?.message ?? e).slice(0, 200);
        if (state === 'unavailable') report({ state, error }); // a generated world already shown stays shown
        return false;
      }
    },
  };
}

// The label the page shows for its geometry source; null when it is the normal generated World.
export function sourceLabel(state, error) {
  if (state === 'legacy') return 'LEGACY BUILDING (selected with ?world=legacy)';
  if (state === 'unavailable') return `GENERATED WORLD UNAVAILABLE: showing the hand-built legacy building as a fallback${error ? ` (${error})` : ''}. Retrying.`;
  return null;
}
