import { createClient } from "@supabase/supabase-js";

export function createWaitlistAdminClient() {
  const url = process.env.WAITLIST_SUPABASE_URL;
  const serviceKey = process.env.WAITLIST_SUPABASE_SERVICE_ROLE_KEY;

  if (
    !url ||
    !serviceKey ||
    url.includes("PASTE_") ||
    serviceKey.includes("PASTE_")
  ) {
    throw new Error(
      "Missing WAITLIST_SUPABASE_URL or WAITLIST_SUPABASE_SERVICE_ROLE_KEY environment variables."
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}