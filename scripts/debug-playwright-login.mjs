import { chromium } from "@playwright/test";

const appUrl = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3001";
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("usage: node scripts/debug-playwright-login.mjs <email> <password>");
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on("request", (request) => {
  if (request.url().includes("supabase.co") || request.url().includes("/auth/v1/")) {
    console.log(`[request] ${request.method()} ${request.url()}`);
  }
});

page.on("response", async (response) => {
  if (response.url().includes("supabase.co") || response.url().includes("/auth/v1/")) {
    console.log(`[response] ${response.status()} ${response.url()}`);
  }
});

page.on("requestfailed", (request) => {
  console.log(`[requestfailed] ${request.method()} ${request.url()} :: ${request.failure()?.errorText}`);
});

page.on("console", (msg) => {
  console.log(`[console:${msg.type()}] ${msg.text()}`);
});

page.on("pageerror", (err) => {
  console.log(`[pageerror] ${err.message}`);
});

await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForTimeout(5000);
console.log(
  "hydration-check",
  await page.evaluate(() => ({
    readyState: document.readyState,
    nextData: !!document.getElementById("__NEXT_DATA__"),
    scripts: Array.from(document.scripts).map((script) => script.src).filter(Boolean).slice(0, 10),
  }))
);
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password").fill(password);
console.log("before-click-url", page.url());
console.log("email-value", await page.getByLabel("Email").inputValue());
await page.locator("form").evaluate((form) => form.requestSubmit());

await page.waitForTimeout(10000);

const errorVisible = await page.locator(".error-message").count();
const errorText = errorVisible ? await page.locator(".error-message").first().textContent() : null;
console.log("after-click-url", page.url());
console.log("error-text", errorText);
console.log("body-h1", await page.locator("h1").first().textContent());

await browser.close();
