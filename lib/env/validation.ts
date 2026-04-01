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

  // Instagram OAuth validation is opt-in during prelaunch.
  if (process.env.ENABLE_INSTAGRAM_OAUTH_VALIDATION !== "true") {
    return issues;
  }

  const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI || process.env.META_REDIRECT_URI;

  // Keep OAuth optional in prelaunch: only enforce if any related env is configured.
  const hasAnyOAuthConfig = Boolean(appId || appSecret || redirectUri);
  if (!hasAnyOAuthConfig) {
    return issues;
  }

  if (isPlaceholder(appId)) {
    issues.push(
      "INSTAGRAM_APP_ID is missing or still set to a placeholder value (legacy META_APP_ID also supported)"
    );
  }

  if (isPlaceholder(appSecret)) {
    issues.push(
      "INSTAGRAM_APP_SECRET is missing or still set to a placeholder value (legacy META_APP_SECRET also supported)"
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl && redirectUri && !redirectUri.startsWith(appUrl)) {
    issues.push(
      `Instagram redirect URI (${redirectUri}) does not match NEXT_PUBLIC_APP_URL (${appUrl}) and may break OAuth redirects`
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

  console.warn(message);
}
