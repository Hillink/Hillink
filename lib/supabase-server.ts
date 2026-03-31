import { createClient } from "@/lib/supabase/server";

// Compatibility wrapper used by RBAC helpers.
export async function createServerClient() {
  return createClient();
}
