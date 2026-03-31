import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(projectRoot, ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function applyMigration(migrationName) {
  const migrationPath = path.join(projectRoot, "supabase", `${migrationName}.sql`);

  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, "utf-8");
  console.log(`📋 Applying migration: ${migrationName}`);
  console.log(`📁 File: ${migrationPath}`);

  try {
    // Use the Supabase RPC to execute SQL through the admin client
    // We'll use the query method on the PostgreSQL client
    const { error } = await admin.rpc("exec_sql", {
      sql_query: sql,
    });

    if (error?.code === "PGRST202") {
      // Function doesn't exist, try direct execution via Supabase client
      console.log("⚠️  exec_sql function not available, attempting direct execution...");
      
      // For direct SQL execution, we need to split statements and execute them individually
      const statements = sql
        .split(";")
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith("--"));

      for (const statement of statements) {
        let execError = null;
        try {
          const result = await admin.rpc("exec", {
            query: statement + ";",
          });
          execError = result.error;
        } catch {
          execError = { code: "PGRST202", message: "exec RPC unavailable" };
        }

        if (execError && execError.code === "PGRST202") {
          console.error("❌ Neither exec_sql nor exec RPC is available in this project.");
          process.exit(1);
        }

        if (execError) {
          console.error(`❌ Error executing statement: ${execError.message}`);
          process.exit(1);
        }
      }

      console.log("✅ Attempted direct execution (results may vary)");
      console.log("⚠️  Note: If tables still don't exist, you may need to apply the SQL manually via Supabase dashboard.");
      return;
    }

    if (error) {
      console.error(`❌ Error applying migration: ${error.message}`);
      process.exit(1);
    }

    console.log(`✅ Migration applied successfully!`);
  } catch (err) {
    console.error(`❌ Unexpected error: ${err.message}`);
    console.log("\n📌 Manual application:");
    console.log("1. Go to: https://supabase.com/dashboard/project/_/sql/new");
    console.log(`2. Copy contents of: ${migrationPath}`);
    console.log("3. Paste and execute in SQL editor");
    process.exit(1);
  }
}

const migrationName = process.argv[2] || "deliverables";
await applyMigration(migrationName);
