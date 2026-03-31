import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const API_ROOT = path.join(ROOT, "app", "api");
const AUTH_EXEMPT_MARKER = "AUTH_EXEMPT";

function collectRoutes(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRoutes(full, out);
      continue;
    }
    if (entry.isFile() && entry.name === "route.ts") {
      out.push(full);
    }
  }
  return out;
}

function hasGuard(content) {
  return (
    /requireRoleAccess\(/.test(content) ||
    /requireAdminAccess\(/.test(content) ||
    /requireRole\(/.test(content)
  );
}

function isAuthExempt(content) {
  return content.includes(AUTH_EXEMPT_MARKER);
}

function toRelative(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function main() {
  if (!fs.existsSync(API_ROOT)) {
    console.error("API root not found:", API_ROOT);
    process.exit(1);
  }

  const routes = collectRoutes(API_ROOT);
  const failures = [];

  for (const route of routes) {
    const content = fs.readFileSync(route, "utf8");
    if (hasGuard(content) || isAuthExempt(content)) {
      continue;
    }
    failures.push(toRelative(route));
  }

  if (failures.length > 0) {
    console.error("Security check failed: API routes missing explicit access guard.");
    console.error("Add requireRoleAccess/requireAdminAccess, or annotate intentional public routes with AUTH_EXEMPT.");
    for (const f of failures) {
      console.error(` - ${f}`);
    }
    process.exit(1);
  }

  console.log(`Security check passed: ${routes.length} API routes have explicit access guard coverage.`);
}

main();
