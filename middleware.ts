import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

type Role = "business" | "athlete" | "admin";

function isPrelaunchMode(): boolean {
  const rawValue = process.env.PRELAUNCH_MODE?.trim().toLowerCase();
  // Default is MVP open. Only lock down when PRELAUNCH_MODE is explicitly true/1/on/yes.
  if (!rawValue) return false;
  return ["1", "true", "on", "yes"].includes(rawValue);
}

function isLocalDevRequest(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const host = (req.headers.get("host") || "").toLowerCase();
  return host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
}

function isPublicPath(pathname: string, prelaunchMode: boolean): boolean {
  return (
    pathname === "/" ||
    pathname === "/waitlist" ||
    pathname.startsWith("/waitlist/") ||
    pathname === "/preview" ||
    pathname.startsWith("/preview/") ||
    pathname === "/admin/login" ||
    (!prelaunchMode &&
      (pathname === "/login" || pathname === "/signup" || pathname.startsWith("/signup/")))
  );
}

function expectedRoleForPath(pathname: string): Role | null {
  if (pathname.startsWith("/business")) return "business";
  if (pathname.startsWith("/athlete")) return "athlete";
  if (pathname.startsWith("/admin")) return "admin";
  return null;
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const prelaunchMode = isPrelaunchMode();
  const unauthenticatedRedirectPath = prelaunchMode ? "/waitlist" : "/login";

  // Keep local development unblocked while production remains locked down.
  if (isLocalDevRequest(req)) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname, prelaunchMode)) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.redirect(new URL(unauthenticatedRedirectPath, req.url));
  }

  const response = NextResponse.next();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.redirect(new URL(unauthenticatedRedirectPath, req.url));
  }

  const expectedRole = expectedRoleForPath(pathname);
  if (!expectedRole) {
    return response;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();

  const role = String(profile?.role || "").trim().toLowerCase();
  if (role !== expectedRole) {
    return NextResponse.redirect(new URL("/role-redirect", req.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)"],
};
