export const MAX_PROOF_URL_LENGTH = 2048;

export type ProofUrlCheck = { ok: true; url: string } | { ok: false; error: string };

/** Proof links are shown to businesses and admins, so only plain HTTPS URLs are stored. */
export function checkProofUrl(raw: string): ProofUrlCheck {
  const value = raw.trim();
  if (value.length > MAX_PROOF_URL_LENGTH) {
    return { ok: false, error: "Proof URL is too long" };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: "Proof URL must be a valid HTTPS URL" };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Proof URL must use HTTPS" };
  }

  return { ok: true, url: value };
}
