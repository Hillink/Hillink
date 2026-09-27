// Lets `node --test` resolve the app's "@/..." import alias to .ts files in the repo root.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = path.join(root, specifier.slice(2));
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
      if (existsSync(candidate) && !candidate.endsWith(path.sep)) {
        try {
          if (!(await import("node:fs")).statSync(candidate).isFile()) continue;
        } catch {
          continue;
        }
        return next(pathToFileURL(candidate).href, context);
      }
    }
  }
  return next(specifier, context);
}
