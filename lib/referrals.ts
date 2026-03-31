export function generateReferralCode(userId: string): string {
  const normalized = userId.replace(/-/g, "").toUpperCase();

  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }

  const prefix = normalized.slice(0, 4).padEnd(4, "X");
  const suffix = hash.toString(36).toUpperCase().slice(0, 4).padEnd(4, "0");

  return `HL-${prefix}-${suffix}`;
}
