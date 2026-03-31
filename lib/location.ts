export type LatLng = { lat: number; lon: number };

const geocodeCache: Record<string, LatLng | null> = {};
const geocodePending: Partial<Record<string, Promise<LatLng | null>>> = {};

export function normalizeLocationPart(value?: string | null): string {
  return (value || "").trim().toLowerCase();
}

export function locationKey(city?: string | null, state?: string | null): string {
  const normalizedCity = normalizeLocationPart(city);
  const normalizedState = normalizeLocationPart(state);
  if (!normalizedCity || !normalizedState) return "";
  return `${normalizedCity}|${normalizedState}`;
}

export function milesBetween(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

export function formatMilesLabel(distance: number | null | undefined): string {
  if (distance == null || !isFinite(distance)) return "";
  if (distance < 10) return `${distance.toFixed(1)} mi away`;
  return `${Math.round(distance)} mi away`;
}

export function storedCoords(latitude?: number | string | null, longitude?: number | string | null): LatLng | null {
  const lat = typeof latitude === "string" ? parseFloat(latitude) : latitude;
  const lon = typeof longitude === "string" ? parseFloat(longitude) : longitude;
  if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return null;
  return { lat, lon };
}

export async function geocodeCityState(city: string, state: string): Promise<LatLng | null> {
  const key = locationKey(city, state);
  if (!key) return null;
  if (Object.prototype.hasOwnProperty.call(geocodeCache, key)) return geocodeCache[key];
  if (geocodePending[key]) return geocodePending[key];

  geocodePending[key] = (async () => {
    try {
      const query = encodeURIComponent(`${city}, ${state}, United States`);
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`);
      if (!response.ok) {
        geocodeCache[key] = null;
        return null;
      }

      const rows = (await response.json()) as Array<{ lat: string; lon: string }>;
      if (!rows.length) {
        geocodeCache[key] = null;
        return null;
      }

      const lat = parseFloat(rows[0].lat);
      const lon = parseFloat(rows[0].lon);
      if (isNaN(lat) || isNaN(lon)) {
        geocodeCache[key] = null;
        return null;
      }

      geocodeCache[key] = { lat, lon };
      return geocodeCache[key];
    } catch {
      geocodeCache[key] = null;
      return null;
    } finally {
      delete geocodePending[key];
    }
  })();

  return geocodePending[key];
}