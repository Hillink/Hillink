import assert from "node:assert/strict";
import test from "node:test";
import { checkProofUrl, MAX_PROOF_URL_LENGTH } from "../../lib/validation/proofUrl.ts";

test("proof URLs must be plain HTTPS", () => {
  assert.deepEqual(checkProofUrl(" https://instagram.com/p/abc "), { ok: true, url: "https://instagram.com/p/abc" });
  assert.equal(checkProofUrl("http://instagram.com/p/abc").ok, false);
  assert.equal(checkProofUrl("javascript:alert(1)").ok, false);
  assert.equal(checkProofUrl("data:text/html,<script>1</script>").ok, false);
  assert.equal(checkProofUrl("not a url").ok, false);
});

test("proof URLs are capped in length", () => {
  const base = "https://example.com/";
  assert.equal(checkProofUrl(base + "a".repeat(MAX_PROOF_URL_LENGTH - base.length)).ok, true);
  assert.equal(checkProofUrl(base + "a".repeat(MAX_PROOF_URL_LENGTH - base.length + 1)).ok, false);
});
