import { expect, test } from "@playwright/test";
import { loginViaAdminPortal, loginViaUserPortal, testUsers } from "./helpers/auth";

test("admin can approve pending athlete and unlock athlete portal", async ({ browser }) => {
  const athleteContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const athletePage = await athleteContext.newPage();
  const adminPage = await adminContext.newPage();

  await loginViaUserPortal(athletePage, testUsers.athlete3.email, testUsers.athlete3.password);
  await athletePage.waitForURL(/\/athlete\/pending/, { timeout: 90_000 });
  await expect(athletePage.getByRole("heading", { name: "Athlete Application Under Review" })).toBeVisible();

  await loginViaAdminPortal(adminPage, testUsers.admin.email, testUsers.admin.password);
  await adminPage.getByPlaceholder("Search email, id, role...").fill("hillink+athlete3@test.local");

  const userRow = adminPage.locator("tbody tr", { hasText: "hillink+athlete3@test.local" }).first();
  await expect(userRow).toBeVisible();
  await userRow.getByRole("button", { name: "Approve Athlete" }).click();

  await expect(adminPage.locator(".success-message")).toContainText("Athlete verification status set to approved");
  await expect(userRow).toContainText(/approved/i);

  await athletePage.goto("/athlete", { waitUntil: "domcontentloaded" });
  await expect(athletePage.getByRole("heading", { name: "Athlete Portal" })).toBeVisible();

  await athleteContext.close();
  await adminContext.close();
});
