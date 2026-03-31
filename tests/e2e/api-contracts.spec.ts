import { expect, test } from "@playwright/test";
import { loginViaUserPortal, testUsers } from "./helpers/auth";

test("admin-only API endpoints enforce auth and role checks", async ({ browser, request }) => {
  const anonymous = await request.get(`${process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3001"}/api/admin/users`);
  expect(anonymous.status()).toBe(401);

  const athleteContext = await browser.newContext();
  const athletePage = await athleteContext.newPage();
  await loginViaUserPortal(athletePage, testUsers.athlete1.email, testUsers.athlete1.password, /\/athlete/);

  const athleteAdminUsers = await athleteContext.request.get("/api/admin/users");
  expect(athleteAdminUsers.status()).toBe(403);

  const athleteFinanceEvents = await athleteContext.request.get("/api/admin/finance-events");
  expect(athleteFinanceEvents.status()).toBe(403);

  const athletePayout = await athleteContext.request.post("/api/stripe/trigger-payout", {
    data: { applicationId: "00000000-0000-0000-0000-000000000000" },
  });
  expect(athletePayout.status()).toBe(403);
  await athleteContext.close();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await loginViaUserPortal(adminPage, testUsers.admin.email, testUsers.admin.password, /\/admin/);
  await expect(adminPage.getByRole("heading", { name: "Admin Portal" })).toBeVisible();

  const adminUsers = await adminContext.request.get("/api/admin/users");
  expect(adminUsers.status()).toBe(200);
  const adminUsersJson = await adminUsers.json();
  expect(Array.isArray(adminUsersJson.users)).toBeTruthy();

  const invalidVerification = await adminContext.request.post("/api/admin/athlete-verification", {
    data: { userId: "", status: "approved" },
  });
  expect(invalidVerification.status()).toBe(400);

  await adminContext.close();
});
