import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(projectRoot, ".env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("usage: node scripts/verify-login.mjs <email> <password>");
  process.exit(1);
}

const { data, error } = await supabase.auth.signInWithPassword({ email, password });

if (error) {
  console.error(`login failed: ${error.message}`);
  process.exit(1);
}

console.log(JSON.stringify({ userId: data.user?.id, email: data.user?.email }, null, 2));
process.exit(0);
