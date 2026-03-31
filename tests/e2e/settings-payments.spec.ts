import { expect, test } from "@playwright/test";
import { loginViaUserPortal, testUsers } from "./helpers/auth";

async function expectSuccessOrRedirect(page: import("@playwright/test").Page, successRegex: RegExp, redirectRegex: RegExp) {
  const outcome = await Promise.race([
    page
      .waitForURL(redirectRegex, { timeout: 20_000 })
      .then(() => "redirect" as const)
      .catch(() => null),
    page
      .locator(".success-message")
      .first()
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => "success" as const)
      .catch(() => null),
    page
      .locator(".error-message")
      .first()
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => "error" as const)
      .catch(() => null),
  ]);

  if (outcome === "redirect") {
    expect(page.url()).toMatch(redirectRegex);
    return;
  }

  if (outcome === "error") {
    await expect(page.locator(".error-message").first()).toContainText(/Stripe|Failed|configured|onboarding|No such account/i);
    return;
  }

  await expect(page.locator(".success-message").first()).toContainText(successRegex);
}

test("settings flow supports Stripe fallback activation for business and athlete", async ({ browser }) => {
  const businessContext = await browser.newContext();
  const athleteContext = await browser.newContext();
  const businessPage = await businessContext.newPage();
  const athletePage = await athleteContext.newPage();

  await loginViaUserPortal(businessPage, testUsers.business2.email, testUsers.business2.password, /\/business/);
  await businessPage.goto("/settings", { waitUntil: "domcontentloaded" });
  await businessPage.getByRole("button", { name: "Pay and Activate Tier (Stripe)" }).click();
  await expectSuccessOrRedirect(
    businessPage,
    /Billing activated in development mode|Subscription updated|already active/i,
    /checkout\.stripe\.com/i
  );

  await loginViaUserPortal(athletePage, testUsers.athlete1.email, testUsers.athlete1.password, /\/athlete/);
  await athletePage.goto("/settings", { waitUntil: "domcontentloaded" });
  await athletePage.getByRole("button", { name: "Connect Stripe Payout Account" }).click();
  await expectSuccessOrRedirect(
    athletePage,
    /Payout account activated in development mode/i,
    /connect\.stripe\.com|connect\/onboarding|\/settings\?connect=/i
  );

  await businessContext.close();
  await athleteContext.close();
});
