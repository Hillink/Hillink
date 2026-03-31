import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import { decodeOAuthState, getMetaOAuthConfig } from "@/lib/instagram/oauth";

async function fetchJson<T>(url: string) {
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `Meta API request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirect = new URL("/settings", appUrl);

  try {
    const access = await requireRoleAccess(["athlete"]);
    if (!access.ok) {
      if (access.response.status === 401) {
        return NextResponse.redirect(new URL("/login", appUrl));
      }
      redirect.searchParams.set("instagram", "forbidden");
      return NextResponse.redirect(redirect);
    }
    const userId = access.userId;

    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");

    if (!code || !state) {
      redirect.searchParams.set("instagram", "error");
      redirect.searchParams.set("instagram_message", "Missing OAuth code or state");
      return NextResponse.redirect(redirect);
    }

    const parsedState = decodeOAuthState(state);
    if (parsedState.userId !== userId) {
      redirect.searchParams.set("instagram", "error");
      redirect.searchParams.set("instagram_message", "OAuth state mismatch");
      return NextResponse.redirect(redirect);
    }

    const config = getMetaOAuthConfig();

    const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", config.appId);
    tokenUrl.searchParams.set("client_secret", config.appSecret);
    tokenUrl.searchParams.set("redirect_uri", config.redirectUri);
    tokenUrl.searchParams.set("code", code);

    const tokenData = await fetchJson<{
      access_token: string;
      token_type?: string;
      expires_in?: number;
    }>(tokenUrl.toString());

    const longLivedUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
    longLivedUrl.searchParams.set("client_id", config.appId);
    longLivedUrl.searchParams.set("client_secret", config.appSecret);
    longLivedUrl.searchParams.set("fb_exchange_token", tokenData.access_token);

    const longLived = await fetchJson<{
      access_token: string;
      token_type?: string;
      expires_in?: number;
    }>(longLivedUrl.toString()).catch(() => tokenData);

    const userToken = longLived.access_token || tokenData.access_token;

    const pagesUrl = new URL("https://graph.facebook.com/v21.0/me/accounts");
    pagesUrl.searchParams.set("fields", "id,name,access_token");
    pagesUrl.searchParams.set("access_token", userToken);

    const pages = await fetchJson<{
      data?: Array<{ id: string; name?: string; access_token?: string }>;
    }>(pagesUrl.toString());

    let igUserId: string | null = null;
    let igUsername: string | null = null;

    for (const page of pages.data || []) {
      if (!page.access_token) continue;
      const pageInfoUrl = new URL(`https://graph.facebook.com/v21.0/${page.id}`);
      pageInfoUrl.searchParams.set("fields", "instagram_business_account{id,username}");
      pageInfoUrl.searchParams.set("access_token", page.access_token);

      let pageInfo: { instagram_business_account?: { id?: string; username?: string } } = {};
      try {
        pageInfo = await fetchJson<{
          instagram_business_account?: { id?: string; username?: string };
        }>(pageInfoUrl.toString());
      } catch {
        continue;
      }

      if (pageInfo.instagram_business_account?.id) {
        igUserId = pageInfo.instagram_business_account.id;
        igUsername = pageInfo.instagram_business_account.username || null;
        break;
      }
    }

    if (!igUserId) {
      redirect.searchParams.set("instagram", "error");
      redirect.searchParams.set(
        "instagram_message",
        "No Instagram professional account found. Ensure your Instagram is Business/Creator and linked to a Facebook Page."
      );
      return NextResponse.redirect(redirect);
    }

    const expiresAt = longLived.expires_in
      ? new Date(Date.now() + longLived.expires_in * 1000).toISOString()
      : null;

    const adminClient = createAdminClient();
    const { error: upsertError } = await adminClient.from("athlete_instagram_connections").upsert(
      {
        athlete_id: userId,
        ig_user_id: igUserId,
        ig_username: igUsername,
        access_token: userToken,
        token_expires_at: expiresAt,
        connected_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
      },
      { onConflict: "athlete_id" }
    );

    if (upsertError) {
      redirect.searchParams.set("instagram", "error");
      redirect.searchParams.set("instagram_message", upsertError.message);
      return NextResponse.redirect(redirect);
    }

    redirect.searchParams.set("instagram", "connected");
    return NextResponse.redirect(redirect);
  } catch (error) {
    redirect.searchParams.set("instagram", "error");
    redirect.searchParams.set(
      "instagram_message",
      error instanceof Error ? error.message.slice(0, 180) : "Instagram connection failed"
    );
    return NextResponse.redirect(redirect);
  }
}
