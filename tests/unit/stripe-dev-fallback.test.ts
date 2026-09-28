import assert from "node:assert/strict";
import test from "node:test";
import { isStripeDevFallbackAllowed } from "../../lib/env/validation.ts";

test("Stripe dev fallback is opt-in", () => {
  assert.equal(isStripeDevFallbackAllowed({ nodeEnv: "development" }), false);
  assert.equal(isStripeDevFallbackAllowed({ nodeEnv: "development", fallbackFlag: "" }), false);
  assert.equal(isStripeDevFallbackAllowed({ nodeEnv: "development", fallbackFlag: "false" }), false);
  assert.equal(isStripeDevFallbackAllowed({ nodeEnv: "development", fallbackFlag: "true" }), true);
  assert.equal(isStripeDevFallbackAllowed({ nodeEnv: "development", fallbackFlag: "1" }), true);
  assert.equal(isStripeDevFallbackAllowed({ nodeEnv: "development", fallbackFlag: "yes" }), true);
});

test("Stripe dev fallback is never allowed in production", () => {
  for (const fallbackFlag of [undefined, "", "false", "true", "1", "yes"]) {
    assert.equal(
      isStripeDevFallbackAllowed({ nodeEnv: "production", vercelEnv: "production", fallbackFlag }),
      false
    );
    assert.equal(
      isStripeDevFallbackAllowed({ nodeEnv: "production", vercelEnv: "preview", fallbackFlag }),
      false
    );
    assert.equal(
      isStripeDevFallbackAllowed({ nodeEnv: "development", vercelEnv: "production", fallbackFlag }),
      false
    );
  }
});

test("Stripe dev fallback may be explicitly enabled in preview", () => {
  assert.equal(
    isStripeDevFallbackAllowed({ nodeEnv: "production", vercelEnv: "preview", fallbackFlag: "true" }),
    false,
    "NODE_ENV=production remains fail-closed even for preview"
  );
  assert.equal(
    isStripeDevFallbackAllowed({ nodeEnv: "development", vercelEnv: "preview", fallbackFlag: "true" }),
    true
  );
});
