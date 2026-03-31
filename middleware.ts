import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

type Role = "business" | "athlete" | "admin";

function isLocalDevRequest(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const host = (req.headers.get("host") || "").toLowerCase();
  return host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
}

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/waitlist" ||
    pathname.startsWith("/waitlist/") ||
    pathname === "/preview" ||
    pathname.startsWith("/preview/") ||
    pathname === "/admin/login"
    // NOTE: /login and /signup are intentionally NOT public at prelaunch.
    // Remove this note and add them here when you're ready to open signups.
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

  // Keep local development unblocked while production remains locked down.
  if (isLocalDevRequest(req)) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.redirect(new URL("/waitlist", req.url));
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
    return NextResponse.redirect(new URL("/waitlist", req.url));
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
