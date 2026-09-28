import { NextResponse } from "next/server";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import { buildMetaOAuthUrl, getMetaOAuthConfig } from "@/lib/instagram/oauth";

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
    const state = crypto.randomUUID();

    const url = buildMetaOAuthUrl({
      appId: config.appId,
      redirectUri: config.redirectUri,
      state,
    });

    const response = NextResponse.redirect(url);
    response.cookies.set("hillink_instagram_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/instagram/oauth/callback",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meta OAuth configuration missing";
    const failUrl = new URL("/settings", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
    failUrl.searchParams.set("instagram", "error");
    failUrl.searchParams.set("instagram_message", message);
    return NextResponse.redirect(failUrl);
  }
}
