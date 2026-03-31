import { execFileSync } from "node:child_process";
import path from "node:path";

async function globalSetup() {
  const root = process.cwd();
  const script = path.join(root, "scripts", "seed-test-users.mjs");

  execFileSync("node", [script], {
    stdio: "inherit",
    cwd: root,
  });
}

export default globalSetup;
