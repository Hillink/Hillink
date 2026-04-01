import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // During build/prerender this module can execute on the server.
    // Return a placeholder client to avoid hard build failures for prelaunch pages.
    return createServerClient("https://placeholder.supabase.co", "placeholder-anon-key", {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // no-op
        },
      },
    });
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as never);
          });
        } catch {
          // no-op when called from a context that can't set cookies
        }
      },
    },
  });
}