// Read-only views of canonical World state. Pass 5E: the theme interpreter only ever sees these; the 5E correction
// (B7) gives the same view to every downstream consumer (the engine's views, the renderer, the HUD and inspector), so a
// renderer, theme or appearance function that tries to write throws instead of changing a canonical fact.
const RO = new WeakMap(), VIEWS = new WeakSet();
const refuse = () => { throw TypeError('the theme interpreter cannot change canonical state'); };
export function readonly(v) {
  if (v == null || typeof v !== 'object' || VIEWS.has(v)) return v;
  if (RO.has(v)) return RO.get(v);
  const p = new Proxy(v, { get: (t, k) => readonly(Reflect.get(t, k)), set: refuse, defineProperty: refuse, deleteProperty: refuse, setPrototypeOf: refuse, preventExtensions: refuse });
  RO.set(v, p); VIEWS.add(p); return p;
}
export const isReadonly = v => VIEWS.has(v);
