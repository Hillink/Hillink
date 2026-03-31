import { expect, test } from "@playwright/test";
import { loginViaAdminPortal, loginViaUserPortal, testUsers } from "./helpers/auth";

test("role-based login redirects work for athlete, business, and admin", async ({ browser }) => {
  const athleteContext = await browser.newContext();
  const athletePage = await athleteContext.newPage();
  await loginViaUserPortal(athletePage, testUsers.athlete1.email, testUsers.athlete1.password, /\/athlete/);
  await expect(athletePage.getByRole("heading", { name: "Athlete Portal" })).toBeVisible();
  await athleteContext.close();

  const businessContext = await browser.newContext();
  const businessPage = await businessContext.newPage();
  await loginViaUserPortal(businessPage, testUsers.business2.email, testUsers.business2.password, /\/business/);
  await expect(businessPage.getByRole("heading", { name: "Business Portal" })).toBeVisible({ timeout: 45_000 });
  await businessContext.close();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await loginViaAdminPortal(adminPage, testUsers.admin.email, testUsers.admin.password);
  await expect(adminPage.getByRole("heading", { name: "Admin Portal" })).toBeVisible();
  await adminContext.close();
});
