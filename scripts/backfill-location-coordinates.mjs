import path from "node:path";
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
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const geocodeCache = new Map();

function normalizeLocationPart(value) {
  return (value || "").trim().toLowerCase();
}

function locationKey(city, state) {
  const normalizedCity = normalizeLocationPart(city);
  const normalizedState = normalizeLocationPart(state);
  if (!normalizedCity || !normalizedState) return "";
  return `${normalizedCity}|${normalizedState}`;
}

async function geocodeCityState(city, state) {
  const key = locationKey(city, state);
  if (!key) return null;
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  try {
    const query = encodeURIComponent(`${city}, ${state}, United States`);
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`, {
      headers: {
        "User-Agent": "hillink-coordinate-backfill/1.0",
      },
    });

    if (!response.ok) {
      geocodeCache.set(key, null);
      return null;
    }

    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      geocodeCache.set(key, null);
      return null;
    }

    const lat = parseFloat(rows[0].lat);
    const lon = parseFloat(rows[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      geocodeCache.set(key, null);
      return null;
    }

    const coords = { lat, lon };
    geocodeCache.set(key, coords);
    return coords;
  } catch {
    geocodeCache.set(key, null);
    return null;
  }
}

async function ensureCoordinateColumns() {
  const athleteCheck = await admin
    .from("athlete_profiles")
    .select("id, latitude, longitude")
    .limit(1);

  if (athleteCheck.error) {
    throw new Error(
      `Coordinate columns are not available yet. Run supabase/location-coordinates.sql first. Details: ${athleteCheck.error.message}`
    );
  }

  const businessCheck = await admin
    .from("business_profiles")
    .select("id, latitude, longitude")
    .limit(1);

  if (businessCheck.error) {
    throw new Error(
      `Coordinate columns are not available yet. Run supabase/location-coordinates.sql first. Details: ${businessCheck.error.message}`
    );
  }
}

async function fetchRows(table) {
  const { data, error } = await admin
    .from(table)
    .select("id, city, state, latitude, longitude")
    .order("id", { ascending: true })
    .limit(5000);

  if (error) {
    throw new Error(`${table} read failed: ${error.message}`);
  }

  return data || [];
}

async function backfillTable(table) {
  const rows = await fetchRows(table);
  const targets = rows.filter((row) => row.city && row.state && (row.latitude == null || row.longitude == null));

  let updated = 0;
  let skipped = 0;

  for (const row of targets) {
    const coords = await geocodeCityState(row.city, row.state);
    if (!coords) {
      skipped += 1;
      continue;
    }

    const { error } = await admin
      .from(table)
      .update({ latitude: coords.lat, longitude: coords.lon })
      .eq("id", row.id);

    if (error) {
      throw new Error(`${table} update failed for ${row.id}: ${error.message}`);
    }

    updated += 1;
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }

  return {
    scanned: rows.length,
    targeted: targets.length,
    updated,
    skipped,
  };
}

async function main() {
  await ensureCoordinateColumns();

  console.log("Backfilling athlete_profiles coordinates...");
  const athleteResult = await backfillTable("athlete_profiles");
  console.log(JSON.stringify({ table: "athlete_profiles", ...athleteResult }, null, 2));

  console.log("Backfilling business_profiles coordinates...");
  const businessResult = await backfillTable("business_profiles");
  console.log(JSON.stringify({ table: "business_profiles", ...businessResult }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});