export type MetaOAuthConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
};

export function getMetaOAuthConfig(): MetaOAuthConfig {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = process.env.META_REDIRECT_URI || `${appUrl}/api/instagram/oauth/callback`;

  if (!appId || appId.includes("PASTE")) {
    throw new Error("META_APP_ID is missing or placeholder");
  }

  if (!appSecret || appSecret.includes("PASTE")) {
    throw new Error("META_APP_SECRET is missing or placeholder");
  }

  return {
    appId,
    appSecret,
    redirectUri,
  };
}

export function encodeOAuthState(payload: { userId: string; ts: number; nonce: string }) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeOAuthState(state: string) {
  const json = Buffer.from(state, "base64url").toString("utf8");
  const parsed = JSON.parse(json) as { userId: string; ts: number; nonce: string };
  return parsed;
}

export function buildMetaOAuthUrl(params: {
  appId: string;
  redirectUri: string;
  state: string;
}) {
  const scopes = [
    "instagram_basic",
    "instagram_manage_insights",
    "pages_show_list",
    "pages_read_engagement",
  ];

  const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes.join(","));

  return url.toString();
}

export function shouldRefreshMetaToken(tokenExpiresAt: string | null | undefined, bufferDays = 14) {
  if (!tokenExpiresAt) return true;
  const expiresAt = new Date(tokenExpiresAt).getTime();
  if (!Number.isFinite(expiresAt)) return true;
  const bufferMs = bufferDays * 24 * 60 * 60 * 1000;
  return expiresAt - Date.now() <= bufferMs;
}

export async function maybeRefreshMetaUserToken(params: {
  accessToken: string | null | undefined;
  tokenExpiresAt?: string | null;
}) {
  const currentToken = params.accessToken || null;
  const currentExpiresAt = params.tokenExpiresAt || null;

  if (!currentToken) {
    return {
      accessToken: null,
      tokenExpiresAt: currentExpiresAt,
      refreshed: false,
      refreshError: null as string | null,
    };
  }

  if (!shouldRefreshMetaToken(currentExpiresAt)) {
    return {
      accessToken: currentToken,
      tokenExpiresAt: currentExpiresAt,
      refreshed: false,
      refreshError: null as string | null,
    };
  }

  try {
    const config = getMetaOAuthConfig();
    const refreshUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    refreshUrl.searchParams.set("grant_type", "fb_exchange_token");
    refreshUrl.searchParams.set("client_id", config.appId);
    refreshUrl.searchParams.set("client_secret", config.appSecret);
    refreshUrl.searchParams.set("fb_exchange_token", currentToken);

    const res = await fetch(refreshUrl.toString(), { method: "GET", cache: "no-store" });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || `Meta token refresh failed (${res.status})`);
    }

    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };

    const nextToken = data.access_token || currentToken;
    const nextExpiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : currentExpiresAt;

    return {
      accessToken: nextToken,
      tokenExpiresAt: nextExpiresAt,
      refreshed: nextToken !== currentToken || nextExpiresAt !== currentExpiresAt,
      refreshError: null as string | null,
    };
  } catch (error) {
    return {
      accessToken: currentToken,
      tokenExpiresAt: currentExpiresAt,
      refreshed: false,
      refreshError: error instanceof Error ? error.message : "Meta token refresh failed",
    };
  }
}
