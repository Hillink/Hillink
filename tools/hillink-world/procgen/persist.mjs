// Pass 5A: persistence. The saved world is the canonical model itself (seed, structures, placements, anchors,
// operational state and history) plus its fingerprint. Reloading reads it back; it is never regenerated. The
// terrain alone is recomputed from the seed, and terrainOf() refuses a world whose terrain would come out
// different (a changed generator), rather than silently moving the land under the buildings.
import fs from 'node:fs';
import path from 'node:path';
import { stableStringify } from './rng.mjs';
import { createWorld, worldFingerprint, terrainOf, SCHEMA } from './world.mjs';

export function serializeWorld(world) {
  return stableStringify({ format: 'hillink-world', schema: SCHEMA, fingerprint: worldFingerprint(world), world });
}

export function deserializeWorld(text) {
  const doc = JSON.parse(text);
  if (doc?.format !== 'hillink-world') throw Error('not a Hillink World save');
  if (doc.schema !== SCHEMA || doc.world?.schema !== SCHEMA) throw Error(`save schema ${doc.schema} is not ${SCHEMA}`);
  const world = doc.world;
  if (worldFingerprint(world) !== doc.fingerprint) throw Error('the save does not match its fingerprint (edited or truncated)');
  terrainOf(world); // throws if the land would not regenerate identically
  return world;
}

// The world's file: loaded if it exists, founded from the seed and saved if it does not. save() writes atomically
// (temporary file, then rename), so a crash never leaves half a world.
export function openWorldFile(file, { seed = 'hillink', capabilities, terrain } = {}) {
  let world, created = false;
  if (fs.existsSync(file)) world = deserializeWorld(fs.readFileSync(file, 'utf8'));
  else { world = createWorld({ seed, capabilities, terrain }); created = true; }
  const save = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, serializeWorld(world));
    fs.renameSync(tmp, file);
  };
  if (created) save();
  return { world, created, save };
}
