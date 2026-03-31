import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(projectRoot, ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sql = fs.readFileSync(path.join(projectRoot, "supabase/athlete-ratings.sql"), "utf-8");

// Extract project ref from URL
const projectRefMatch = supabaseUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
if (!projectRefMatch) {
  console.error("Could not parse project ref from Supabase URL");
  process.exit(1);
}

const projectRef = projectRefMatch[1];
const apiUrl = `https://${projectRef}.supabase.co/rest/v1/`;
const rpcUrl = `https://${projectRef}.supabase.co/functions/v1/`;

console.log("Attempting to execute athlete ratings schema...\n");

try {
  // Try using fetch to call Supabase edge function or direct API
  const response = await fetch(`https://${projectRef}.supabase.co/graphql/v1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      query: `mutation { executeRawSQL(sql: "${sql.replace(/"/g, '\\"').replace(/\n/g, '\\n')}") }`,
    }),
  });

  const result = await response.json();
  console.log("GraphQL Response:", result);
  
} catch (err) {
  console.error("Failed to execute via API:", err.message);
}

// Fallback: Output instructions for manual execution
console.log("\n" + "=".repeat(70));
console.log("MANUAL SETUP INSTRUCTIONS");
console.log("=".repeat(70) + "\n");

console.log("Since automated execution failed, please:");
console.log("1. Go to: https://app.supabase.com/project/" + projectRef + "/sql/new");
console.log("2. Copy and paste the SQL below");
console.log("3. Click 'Run'\n");

console.log("=".repeat(70));
console.log("START SQL");
console.log("=".repeat(70) + "\n");
console.log(sql);
console.log("\n" + "=".repeat(70));
console.log("END SQL");
console.log("=".repeat(70));

process.exit(0);
