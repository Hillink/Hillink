// Reads a setting with surrounding whitespace removed. Dashboard-pasted values can carry a stray
// space or newline (CRON_SECRET did on 2026-09-27), which silently breaks exact comparisons.
// Case is preserved: secrets and IDs are case-sensitive. No imports so it can be unit tested with `node --test`.
export function envValue(name: string, env: Record<string, string | undefined> = process.env): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}
