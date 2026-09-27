import { test } from "node:test";
import assert from "node:assert/strict";
import { canRead, effectiveScope, safeHelpReturnPath, scopeForRole } from "../../lib/help/access.ts";
import { validateArticleInput, slugify } from "../../lib/help/validate.ts";
import { HELP_CATEGORIES, RESERVED_HELP_SEGMENTS, START_HERE_SLUGS, articlePath } from "../../lib/help/categories.ts";
import { SEED_ARTICLES } from "../../lib/help/seed-content.ts";

const article = (audience: string, status: string) => ({ audience, status });

test("athletes read live athlete and shared articles only", () => {
  const scope = scopeForRole("athlete");
  assert.ok(canRead(scope, article("athlete", "live")));
  assert.ok(canRead(scope, article("both", "live")));
  assert.ok(!canRead(scope, article("business", "live")));
  assert.ok(!canRead(scope, article("admin", "live")));
  for (const status of ["planned", "experimental", "deprecated", "draft"]) {
    assert.ok(!canRead(scope, article("athlete", status)), status);
  }
});

test("businesses read live business and shared articles only", () => {
  const scope = scopeForRole("business");
  assert.ok(canRead(scope, article("business", "live")));
  assert.ok(canRead(scope, article("both", "live")));
  assert.ok(!canRead(scope, article("athlete", "live")));
  assert.ok(!canRead(scope, article("admin", "live")));
  assert.ok(!canRead(scope, article("business", "draft")));
});

test("admins read everything", () => {
  const scope = scopeForRole("admin");
  assert.ok(canRead(scope, article("admin", "draft")));
  assert.ok(canRead(scope, article("business", "planned")));
});

test("a preview request can only narrow, and only for admins", () => {
  assert.deepEqual(effectiveScope("admin", "athlete"), scopeForRole("athlete"));
  assert.deepEqual(effectiveScope("admin", "business"), scopeForRole("business"));
  assert.deepEqual(effectiveScope("admin", "admin"), scopeForRole("admin"));
  assert.deepEqual(effectiveScope("athlete", "business"), scopeForRole("athlete"));
  assert.deepEqual(effectiveScope("athlete", "admin"), scopeForRole("athlete"));
  assert.deepEqual(effectiveScope("business", "admin"), scopeForRole("business"));
});

test("login only returns people to Help Center paths", () => {
  assert.equal(safeHelpReturnPath("/help"), "/help");
  assert.equal(safeHelpReturnPath("/help/payments/when-do-i-get-paid"), "/help/payments/when-do-i-get-paid");
  for (const bad of ["https://evil.test", "//evil.test", "/admin", "/help/../admin", "/help/a/b/c", "/help?x=1", "/helpx", null, ""]) {
    assert.equal(safeHelpReturnPath(bad), null, String(bad));
  }
});

test("article input is checked before it's saved", () => {
  const good = validateArticleInput({ title: "When do I get paid?", category: "payments", audience: "athlete", status: "live", short_answer: "Soon." });
  assert.ok(good.ok);
  assert.equal(good.ok && good.value.slug, "when-do-i-get-paid");
  assert.ok(!validateArticleInput({ title: "x", category: "payments", audience: "everyone", status: "live" }).ok);
  assert.ok(!validateArticleInput({ title: "x", category: "payments", audience: "both", status: "published" }).ok);
  assert.ok(!validateArticleInput({ title: "x", category: "nope", audience: "both" }).ok);
  assert.ok(!validateArticleInput({ title: "x", slug: "Bad Slug!", category: "payments", audience: "both" }).ok);
  assert.ok(!validateArticleInput({ title: "Live with no answer", category: "payments", audience: "both", status: "live" }).ok);
  // Internal notes can't be published to customers by picking the internal category with a customer audience.
  assert.ok(!validateArticleInput({ title: "x", category: "internal", audience: "both", status: "draft" }).ok);
  const draft = validateArticleInput({ title: "New thing", category: "payments", audience: "both" });
  assert.equal(draft.ok && draft.value.status, "draft");
  assert.equal(slugify("  What's Gold level?? "), "what-s-gold-level");
});

test("category keys never collide with Help Center pages", () => {
  for (const c of HELP_CATEGORIES) assert.ok(!RESERVED_HELP_SEGMENTS.includes(c.key), c.key);
  assert.equal(articlePath({ category: "payments", slug: "when-do-i-get-paid" }), "/help/payments/when-do-i-get-paid");
});

test("starter content is valid, and nothing unreleased or internal is published to customers", () => {
  const slugs = new Set<string>();
  for (const a of SEED_ARTICLES) {
    const checked = validateArticleInput(a as unknown as Record<string, unknown>);
    assert.ok(checked.ok, `${a.slug}: ${!checked.ok && checked.error}`);
    assert.ok(!slugs.has(a.slug), `duplicate ${a.slug}`);
    slugs.add(a.slug);
    if (a.audience !== "admin" && a.status === "live") {
      const text = `${a.title} ${a.short_answer} ${a.body ?? ""} ${(a.steps ?? []).join(" ")}`.toLowerCase();
      for (const word of ["margin", "profitab", "churn", "close rate", "internal", "roadmap", "founder", "simulation", "vulnerab"]) {
        assert.ok(!text.includes(word), `${a.slug} mentions "${word}"`);
      }
    }
  }
  for (const role of ["athlete", "business"] as const) {
    const start = SEED_ARTICLES.find((a) => a.slug === START_HERE_SLUGS[role]);
    assert.ok(start && start.status === "live" && start.audience === role && start.category === "getting-started");
  }
  const store = SEED_ARTICLES.find((a) => a.slug === "rewards-store");
  assert.equal(store?.status, "planned");
});
