import { expect, Page } from "@playwright/test";

const appUrl = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3001";

export const testUsers = {
  admin: { email: "hillink+admin@test.local", password: "Password123!" },
  business1: { email: "hillink+business1@test.local", password: "Password123!" },
  business2: { email: "hillink+business2@test.local", password: "Password123!" },
  athlete1: { email: "hillink+athlete1@test.local", password: "Password123!" },
  athlete2: { email: "hillink+athlete2@test.local", password: "Password123!" },
  athlete3: { email: "hillink+athlete3@test.local", password: "Password123!" },
};

export async function loginViaUserPortal(page: Page, email: string, password: string, expectedPath?: RegExp) {
  await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForTimeout(2_000);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.locator("form").evaluate((form) => {
    (form as HTMLFormElement).requestSubmit();
  });

  if (expectedPath) {
    await page.waitForURL(expectedPath, { timeout: 90_000 });
  } else {
    await page.waitForURL(/\/(athlete|business|admin|role-redirect)/, { timeout: 90_000 });
  }
}

export async function loginViaAdminPortal(page: Page, email: string, password: string) {
  await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForTimeout(2_000);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.locator("form").evaluate((form) => {
    (form as HTMLFormElement).requestSubmit();
  });
  await page.waitForURL(/\/admin/, { timeout: 90_000 });
}
