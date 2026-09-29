// Help Center access rules against a local Supabase. See docs/HELP_CENTER.md for setup.
// Every query here runs the way the app runs it: as the signed-in user, so the database's row security decides.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const key = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const skip = !url || !key || !anonKey ? "set LOCAL_SUPABASE_URL, LOCAL_SUPABASE_SERVICE_ROLE_KEY and LOCAL_SUPABASE_ANON_KEY" : false;

const EVERY_AUDIENCE = ["athlete", "business", "both", "admin"];
const EVERY_STATUS = ["live", "planned", "experimental", "deprecated", "draft"];
const PREFIX = `zzt${Date.now().toString(36)}`;
const slug = (name: string) => `${PREFIX}-${name}`;

let admin: SupabaseClient;
const as: Record<"athlete" | "business" | "admin" | "norole" | "anon", SupabaseClient> = {} as never;

// Fixture articles share one unusual word so searches only find these, whatever else is in the table.
const WORD = `quokka${PREFIX}`;
const FIXTURES = [
  { name: "athlete-live", audience: "athlete", status: "live" },
  { name: "business-live", audience: "business", status: "live" },
  { name: "both-live", audience: "both", status: "live" },
  { name: "admin-live", audience: "admin", status: "live" },
  { name: "athlete-planned", audience: "athlete", status: "planned" },
  { name: "business-draft", audience: "business", status: "draft" },
  { name: "both-experimental", audience: "both", status: "experimental" },
  { name: "both-deprecated", audience: "both", status: "deprecated" },
];

async function signedIn(role: string | null): Promise<SupabaseClient> {
  const email = `help-${role ?? "none"}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Password123!", email_confirm: true });
  if (error) throw error;
  if (role) await admin.from("profiles").upsert({ id: data.user.id, role });
  const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: loginError } = await client.auth.signInWithPassword({ email, password: "Password123!" });
  if (loginError) throw loginError;
  return client;
}

async function visibleFixtures(client: SupabaseClient): Promise<string[]> {
  const { data } = await client.from("help_articles").select("slug").like("slug", `${PREFIX}-%`);
  return ((data || []) as { slug: string }[]).map((r) => r.slug.slice(PREFIX.length + 1)).sort();
}

// Asks for everything, the way a tampered request or a prompt-injected agent might.
async function searchAskingForEverything(client: SupabaseClient): Promise<string[]> {
  const { data, error } = await client.rpc("search_help_articles", {
    p_query: WORD,
    p_audiences: EVERY_AUDIENCE,
    p_statuses: EVERY_STATUS,
    p_limit: 50,
  });
  if (error) return [`error:${error.code ?? error.message}`];
  return ((data || []) as { slug: string }[]).map((r) => r.slug.slice(PREFIX.length + 1)).sort();
}

before(async () => {
  if (skip) return;
  admin = createClient(url!, key!, { auth: { persistSession: false } });
  const { error } = await admin.from("help_articles").insert(
    FIXTURES.map((f) => ({
      slug: slug(f.name),
      category: f.audience === "admin" ? "internal" : "troubleshooting",
      title: `Test ${f.name} ${WORD}`,
      short_answer: `Fixture ${f.name}`,
      body: `Body for ${f.name}`,
      audience: f.audience,
      status: f.status,
    }))
  );
  if (error) throw error;
  as.athlete = await signedIn("athlete");
  as.business = await signedIn("business");
  as.admin = await signedIn("admin");
  as.norole = await signedIn(null);
  as.anon = createClient(url!, anonKey!, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  await admin.from("help_articles").delete().like("slug", `${PREFIX}-%`);
});

test("athletes read only live athlete and shared articles", { skip }, async () => {
  assert.deepEqual(await visibleFixtures(as.athlete), ["athlete-live", "both-live"]);
});

test("businesses read only live business and shared articles", { skip }, async () => {
  assert.deepEqual(await visibleFixtures(as.business), ["both-live", "business-live"]);
});

test("admins read everything, including drafts, planned features and internal notes", { skip }, async () => {
  assert.deepEqual(await visibleFixtures(as.admin), FIXTURES.map((f) => f.name).sort());
});

test("signed-out visitors and accounts without a role read nothing", { skip }, async () => {
  assert.deepEqual(await visibleFixtures(as.anon), []);
  assert.deepEqual(await visibleFixtures(as.norole), []);
});

test("a direct lookup of another role's article returns nothing", { skip }, async () => {
  for (const [client, name] of [
    [as.athlete, "business-live"],
    [as.athlete, "admin-live"],
    [as.athlete, "athlete-planned"],
    [as.business, "athlete-live"],
    [as.business, "business-draft"],
    [as.business, "admin-live"],
  ] as const) {
    const { data } = await client.from("help_articles").select("slug, body").eq("slug", slug(name)).maybeSingle();
    assert.equal(data, null, `${name} leaked`);
  }
});

test("search can't be widened by asking for more audiences or statuses", { skip }, async () => {
  assert.deepEqual(await searchAskingForEverything(as.athlete), ["athlete-live", "both-live"]);
  assert.deepEqual(await searchAskingForEverything(as.business), ["both-live", "business-live"]);
  assert.equal((await searchAskingForEverything(as.admin)).length, FIXTURES.length);
  assert.deepEqual(await searchAskingForEverything(as.norole), []);
  const anon = await searchAskingForEverything(as.anon);
  assert.ok(anon.length === 1 && anon[0].startsWith("error:"), `anonymous search should be refused, got ${anon}`);
});

test("search narrows to the audiences and statuses the server passes", { skip }, async () => {
  const { data } = await as.admin.rpc("search_help_articles", {
    p_query: WORD,
    p_audiences: ["athlete", "both"],
    p_statuses: ["live"],
    p_limit: 50,
  });
  assert.deepEqual(((data || []) as { slug: string }[]).map((r) => r.slug.slice(PREFIX.length + 1)).sort(), ["athlete-live", "both-live"]);
});

test("search matches word prefixes and ignores query syntax", { skip }, async () => {
  const { data } = await as.athlete.rpc("search_help_articles", {
    p_query: `${WORD.slice(0, 8)} ' & | ! :* ) (`,
    p_audiences: ["athlete", "both"],
    p_statuses: ["live"],
  });
  assert.ok(((data || []) as unknown[]).length >= 2);
});

test("only the server can write articles", { skip }, async () => {
  for (const client of [as.athlete, as.business, as.admin, as.anon]) {
    const { error: insertError } = await client
      .from("help_articles")
      .insert({ slug: slug(`sneaky-${Math.random().toString(36).slice(2, 6)}`), category: "troubleshooting", title: "x", audience: "both", status: "live" });
    assert.ok(insertError, "insert should be refused");
    await client.from("help_articles").update({ status: "live", audience: "both" }).eq("slug", slug("athlete-planned"));
  }
  const { data } = await admin.from("help_articles").select("status, audience").eq("slug", slug("athlete-planned")).single();
  assert.deepEqual(data, { status: "planned", audience: "athlete" });
});
