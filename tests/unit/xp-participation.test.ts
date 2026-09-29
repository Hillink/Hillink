import assert from "node:assert/strict";
import test from "node:test";
import { countJoinedCampaigns, hasJoinedCampaign } from "../../lib/xp.ts";

test("only accepted-or-later applications count as joining a campaign", () => {
  for (const status of ["accepted", "submitted", "approved", "completed", " Accepted "]) {
    assert.equal(hasJoinedCampaign(status), true, status);
  }
  for (const status of ["applied", "declined", "withdrawn", "rejected", "", null, undefined]) {
    assert.equal(hasJoinedCampaign(status), false, String(status));
  }
});

test("three pending applications earn no Campaign Starter progress", () => {
  assert.equal(countJoinedCampaigns([{ status: "applied" }, { status: "applied" }, { status: "applied" }]), 0);
});

test("three accepted campaigns reach the Campaign Starter target", () => {
  assert.equal(
    countJoinedCampaigns([{ status: "accepted" }, { status: "submitted" }, { status: "approved" }, { status: "declined" }]),
    3
  );
});
