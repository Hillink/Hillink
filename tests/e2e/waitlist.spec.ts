import { expect, test } from "@playwright/test";

const appUrl = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3001";

async function fillAndAssert(page: Parameters<typeof test>[1] extends (args: infer T) => unknown ? T["page"] : never, selector: string, value: string) {
  const input = page.locator(selector);
  await input.fill(value);
  await expect(input).toHaveValue(value);
}

test("athlete waitlist submission redirects to success", async ({ page }) => {
  const uniqueEmail = `waitlist-athlete-${Date.now()}@test.local`;

  await page.route("**/api/waitlist/athlete", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, id: "test-waitlist-id" }),
    });
  });

  await page.goto(`${appUrl}/waitlist/athlete`, {
    waitUntil: "domcontentloaded",
    timeout: 180_000,
  });

  await expect(page.locator("#school")).toBeEditable();
  // In dev mode, hydration can briefly reset controlled inputs if typed too early.
  await page.waitForTimeout(1200);

  await fillAndAssert(page, "#school", "State University");
  await fillAndAssert(page, "#sport", "Basketball");

  await page.locator('input[name="nil_experience"][value="Not yet, but I want to"]').check();
  await expect(page.locator('input[name="nil_experience"][value="Not yet, but I want to"]')).toBeChecked();
  await page.getByRole("checkbox", { name: "Paid social media posts" }).check();
  await expect(page.getByRole("checkbox", { name: "Paid social media posts" })).toBeChecked();
  await page.locator('input[name="would_use_platform"][value="Yes"]').check();
  await expect(page.locator('input[name="would_use_platform"][value="Yes"]')).toBeChecked();
  await page.getByRole("radio", { name: "Yes, send me the link" }).check();
  await expect(page.getByRole("radio", { name: "Yes, send me the link" })).toBeChecked();

  await fillAndAssert(page, "#athlete-email", uniqueEmail);
  await fillAndAssert(page, "#instagram_handle", "@athlete_local");
  await fillAndAssert(page, "#preferred_business_types", "Gyms, smoothie shops, and sports clinics");

  // Final pre-submit checks to catch any hydration reset before submit.
  await expect(page.locator("#school")).toHaveValue("State University");
  await expect(page.locator("#sport")).toHaveValue("Basketball");
  await expect(page.locator("#athlete-email")).toHaveValue(uniqueEmail);

  await page.getByRole("button", { name: "Join Athlete Waitlist" }).click();

  await page.waitForURL(/\/waitlist\/success/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "You're in." })).toBeVisible();
});
