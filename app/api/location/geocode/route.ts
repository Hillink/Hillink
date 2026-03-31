import { NextRequest, NextResponse } from "next/server";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";

type Body = {
  city?: string;
  state?: string;
};

export async function POST(req: NextRequest) {
  const access = await requireRoleAccess(["athlete", "business", "admin"]);
  if (!access.ok) {
    return access.response;
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const city = (body.city || "").trim();
  const state = (body.state || "").trim();

  if (!city || !state) {
    return NextResponse.json({ error: "city and state are required" }, { status: 400 });
  }

  if (city.length > 120 || state.length > 120) {
    return NextResponse.json({ error: "invalid city/state" }, { status: 400 });
  }

  try {
    const query = encodeURIComponent(`${city}, ${state}, United States`);
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`, {
      headers: {
        "User-Agent": "hillink-location-api/1.0",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ error: "geocode lookup failed" }, { status: 502 });
    }

    const rows = (await response.json()) as Array<{ lat: string; lon: string }>;
    if (!rows.length) {
      return NextResponse.json({ lat: null, lon: null });
    }

    const lat = parseFloat(rows[0].lat);
    const lon = parseFloat(rows[0].lon);

    if (isNaN(lat) || isNaN(lon)) {
      return NextResponse.json({ lat: null, lon: null });
    }

    return NextResponse.json({ lat, lon });
  } catch {
    return NextResponse.json({ error: "geocode lookup failed" }, { status: 502 });
  }
}
