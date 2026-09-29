import assert from "node:assert/strict";
import test from "node:test";
import { fetchAllPages } from "../../lib/supabase/paginate.ts";

function table(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ xp_delta: i === 0 ? 1000 : 1 }));
  const calls: [number, number][] = [];
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  };
  return { fetchPage, calls };
}

test("reads every page, so a large old event past the first page still counts (XP-002)", async () => {
  const { fetchPage, calls } = table(101);
  const { data } = await fetchAllPages(fetchPage, 100);
  assert.equal(data!.length, 101);
  assert.equal(data!.reduce((sum, r) => sum + r.xp_delta, 0), 1100);
  assert.deepEqual(calls, [[0, 99], [100, 199]]);
});

test("an exact multiple of the page size ends on an empty page", async () => {
  const { fetchPage, calls } = table(200);
  const { data } = await fetchAllPages(fetchPage, 100);
  assert.equal(data!.length, 200);
  assert.equal(calls.length, 3);
});

test("an error on any page returns the error and no partial total", async () => {
  let n = 0;
  const result = await fetchAllPages(async () => (n++ === 0 ? { data: Array(10).fill({}), error: null } : { data: null, error: { message: "boom" } }), 10);
  assert.deepEqual(result, { data: null, error: { message: "boom" } });
});
