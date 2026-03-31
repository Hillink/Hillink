import { NextResponse } from "next/server";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import { buildMetaOAuthUrl, encodeOAuthState, getMetaOAuthConfig } from "@/lib/instagram/oauth";

export async function GET() {
  const access = await requireRoleAccess(["athlete"]);
  if (!access.ok) {
    if (access.response.status === 401) {
      return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
    }
    return NextResponse.redirect(new URL("/settings?instagram=forbidden", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
  }
  const userId = access.userId;

  try {
    const config = getMetaOAuthConfig();
    const state = encodeOAuthState({
      userId,
      ts: Date.now(),
      nonce: crypto.randomUUID(),
    });

    const url = buildMetaOAuthUrl({
      appId: config.appId,
      redirectUri: config.redirectUri,
      state,
    });

    return NextResponse.redirect(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meta OAuth configuration missing";
    const failUrl = new URL("/settings", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
    failUrl.searchParams.set("instagram", "error");
    failUrl.searchParams.set("instagram_message", message);
    return NextResponse.redirect(failUrl);
  }
}
