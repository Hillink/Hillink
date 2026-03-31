import { expect, test } from "@playwright/test";
import { loginViaAdminPortal, testUsers } from "./helpers/auth";

test("admin can load user table and search seeded accounts", async ({ page }) => {
  await loginViaAdminPortal(page, testUsers.admin.email, testUsers.admin.password);

  await page.getByPlaceholder("Search email, id, role...").fill("hillink+business1@test.local");
  await expect(page.locator("table").first()).toContainText("hillink+business1@test.local");

  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Finance Ledger" })).toBeVisible();
});
