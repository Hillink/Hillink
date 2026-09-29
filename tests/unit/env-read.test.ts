import { test } from "node:test";
import assert from "node:assert/strict";
import { envValue } from "../../lib/env/read.ts";

test("settings are trimmed but keep their case", () => {
  assert.equal(envValue("CRON_SECRET", { CRON_SECRET: " AbC123\n" }), "AbC123");
  assert.equal(envValue("STRIPE_PRICE_GROWTH", { STRIPE_PRICE_GROWTH: "price_XyZ " }), "price_XyZ");
});

test("missing or blank settings read as unset", () => {
  assert.equal(envValue("CRON_SECRET", {}), undefined);
  assert.equal(envValue("CRON_SECRET", { CRON_SECRET: "   " }), undefined);
});
