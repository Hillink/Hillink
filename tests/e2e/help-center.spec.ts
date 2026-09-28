import { expect, test, type Page } from "@playwright/test";
import { loginViaAdminPortal, loginViaUserPortal, testUsers } from "./helpers/auth";

// Help Center: signed-in only, and each account type only ever gets its own articles.
// Needs the Help Center migrations (supabase/migrations/20260928000600 and 000610) in the test database.

const NOT_FOUND = "We couldn't find that help article";

async function expectNotFound(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByText(NOT_FOUND)).toBeVisible();
}

test.describe("Help Center", () => {
  test("signed-out visitors are sent to login, then back to the article", async ({ page }) => {
    await page.goto("/help/payments/when-do-i-get-paid");
    await expect(page).toHaveURL(/\/login\?next=%2Fhelp%2Fpayments%2Fwhen-do-i-get-paid/);
    await page.getByLabel("Email").fill(testUsers.athlete1.email);
    await page.getByLabel("Password").fill(testUsers.athlete1.password);
    await page.locator("form").evaluate((form) => (form as HTMLFormElement).requestSubmit());
    await expect(page).toHaveURL(/\/help\/payments\/when-do-i-get-paid$/);
    await expect(page.getByRole("heading", { name: "When do I get paid?" })).toBeVisible();
  });

  test("signed-out API calls are refused", async ({ request }) => {
    expect((await request.get("/api/help/search?q=paid")).status()).toBe(401);
    expect((await request.get("/api/help/articles/when-do-i-get-paid")).status()).toBe(401);
  });

  test("athletes only see athlete and shared help", async ({ page }) => {
    await loginViaUserPortal(page, testUsers.athlete1.email, testUsers.athlete1.password);
    await page.goto("/help");
    await expect(page.getByText("Help for Athletes")).toBeVisible();
    await expect(page.getByRole("heading", { name: "HILLink for athletes: start here" })).toBeVisible();
    await expect(page.getByText("HILLink for businesses: start here")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Plans & billing/ })).toHaveCount(0);

    // Search for a business-only topic.
    await page.goto("/help/search?q=fund+payment");
    await expect(page.getByText("How do athlete payments work?")).toHaveCount(0);

    // Direct URLs to business, admin-only and planned articles fail the same way as missing ones.
    await expectNotFound(page, "/help/payments/paying-athletes");
    await expectNotFound(page, "/help/internal/managing-help-articles");
    await expectNotFound(page, "/help/rewards/rewards-store");
    await expectNotFound(page, "/help/payments/no-such-article");

    // Asking to preview as another role does nothing for non-admins.
    await page.goto("/help?as=business");
    await expect(page.getByText("Help for Athletes")).toBeVisible();

    // Same rules through the API.
    const search = await page.request.get("/api/help/search?q=fund+payment+plans&as=business");
    const slugs = ((await search.json()).results as { slug: string }[]).map((r) => r.slug);
    expect(slugs).not.toContain("paying-athletes");
    expect(slugs).not.toContain("business-plans");
    expect((await page.request.get("/api/help/articles/paying-athletes")).status()).toBe(404);
    expect((await page.request.get("/api/help/articles/when-do-i-get-paid")).status()).toBe(200);
    expect((await page.request.get("/api/help/articles/cancelling-a-campaign")).status()).toBe(404);

    // The one welcome-email link goes to the athlete guide.
    await page.goto("/help/start-here");
    await expect(page).toHaveURL(/\/help\/getting-started\/athlete-start-here$/);
  });

  test("businesses only see business and shared help", async ({ page }) => {
    await loginViaUserPortal(page, testUsers.business1.email, testUsers.business1.password);
    await page.goto("/help");
    await expect(page.getByText("Help for Businesses")).toBeVisible();
    await expect(page.getByRole("heading", { name: "HILLink for businesses: start here" })).toBeVisible();
    await expect(page.getByText("HILLink for athletes: start here")).toHaveCount(0);

    await page.goto("/help/search?q=fund+payment");
    await expect(page.getByRole("link", { name: /How do athlete payments work\?/ })).toBeVisible();

    await expectNotFound(page, "/help/payments/when-do-i-get-paid");
    await expectNotFound(page, "/help/internal/managing-help-articles");
    expect((await page.request.get("/api/help/articles/when-do-i-get-paid")).status()).toBe(404);
    expect((await page.request.get("/api/help/articles/cancelling-a-campaign")).status()).toBe(200);

    await page.goto("/help/start-here");
    await expect(page).toHaveURL(/\/help\/getting-started\/business-start-here$/);
  });

  test("an article moved to another topic still opens from its old link", async ({ page }) => {
    await loginViaUserPortal(page, testUsers.athlete1.email, testUsers.athlete1.password);
    await page.goto("/help/troubleshooting/when-do-i-get-paid");
    await expect(page).toHaveURL(/\/help\/payments\/when-do-i-get-paid$/);
  });

  test("admins see everything and can preview each role", async ({ page }) => {
    await loginViaAdminPortal(page, testUsers.admin.email, testUsers.admin.password);
    await page.goto("/help/rewards/rewards-store");
    await expect(page.getByText("Customers can't see this article.")).toBeVisible();
    await page.goto("/help/internal/managing-help-articles");
    await expect(page.getByRole("heading", { name: "Managing Help Center articles" })).toBeVisible();

    await page.goto("/help/payments/paying-athletes?as=athlete");
    await expect(page.getByText(NOT_FOUND)).toBeVisible();

    await page.goto("/admin/help");
    await expect(page.getByRole("heading", { name: "Help Center articles" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Spending points in the rewards store" })).toBeVisible();
  });

  test("help pages fit a phone screen", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await loginViaUserPortal(page, testUsers.athlete1.email, testUsers.athlete1.password);
    for (const path of ["/help", "/help/getting-started/athlete-start-here", "/help/search?q=paid", "/help/payments"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
    }
    await context.close();
  });
});
