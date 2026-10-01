// HQ requires Node 24 or newer (package.json engines). npm does not enforce engines, and Node 22 reports node:test
// events differently (an empty acceptance file once passed under it), so HQ checks the version itself and refuses to
// run on anything older. The guest scripts in sandbox/guest carry their own copy of this check (they run standalone).
export const MIN_NODE_MAJOR = 24;
export const nodeMajor = version => Number(/^v?(\d+)\./.exec(String(version ?? ''))?.[1] ?? NaN);
export function assertSupportedNode(version = process.versions.node, what = 'Hillink HQ') {
  const major = nodeMajor(version);
  if (!(major >= MIN_NODE_MAJOR)) throw Error(`${what} requires Node ${MIN_NODE_MAJOR} or newer; this is Node ${String(version).slice(0, 40)}. Refusing to start.`);
  return major;
}
