export function isPlaceholder(value?: string) {
  if (!value) return true;
  return value.trim().includes("PASTE");
}

export function isValidStripeSecretKey(value?: string) {
  if (!value || isPlaceholder(value)) return false;
  return value.trim().startsWith("sk_");
}

export function isValidStripePriceId(value?: string) {
  if (!value || isPlaceholder(value)) return false;
  return value.trim().startsWith("price_");
}

export function isValidStripeWebhookSecret(value?: string) {
  if (!value || isPlaceholder(value)) return false;
  return value.trim().startsWith("whsec_");
}

export function isValidResendKey(value?: string) {
  if (!value || isPlaceholder(value)) return false;
  return value.trim().startsWith("re_");
}

function getMetaEnvIssues() {
  const issues: string[] = [];

  if (isPlaceholder(process.env.META_APP_ID)) {
    issues.push("META_APP_ID is missing or still set to a placeholder value");
  }

  if (isPlaceholder(process.env.META_APP_SECRET)) {
    issues.push("META_APP_SECRET is missing or still set to a placeholder value");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const redirectUri = process.env.META_REDIRECT_URI;
  if (appUrl && redirectUri && !redirectUri.startsWith(appUrl)) {
    issues.push(
      `META_REDIRECT_URI (${redirectUri}) does not match NEXT_PUBLIC_APP_URL (${appUrl}) and may break local OAuth redirects`
    );
  }

  return issues;
}

export function assertStartupEnv() {
  const metaIssues = getMetaEnvIssues();
  if (!metaIssues.length) return;

  const message = [
    "Startup environment validation failed for Instagram OAuth:",
    ...metaIssues.map((issue) => `- ${issue}`),
  ].join("\n");

  if (process.env.NODE_ENV === "production") {
    throw new Error(message);
  }

  console.warn(message);
}
