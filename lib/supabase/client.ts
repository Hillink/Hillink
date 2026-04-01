import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // During Next.js prerender/build, this module can be evaluated on the server.
    // Avoid crashing builds for prelaunch pages; runtime browser usage still enforces real env vars.
    if (typeof window === "undefined") {
      return createBrowserClient("https://placeholder.supabase.co", "placeholder-anon-key");
    }
    throw new Error("Missing Supabase environment variables.");
  }

  return createBrowserClient(url, anonKey);
}
