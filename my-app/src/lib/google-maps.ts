/**
 * Google Maps API (Geocoding + Places) for server-side use.
 * Uses GOOGLE_MAPS_API_KEY or GOOGLE_MAPS_KEY from env.
 * Geocode results are cached in memory; use coordinates for all Places searches.
 */

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json";
const PLACES_NEARBY_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";
const PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

const COORD_CACHE = new Map<string, { lat: number; lng: number }>();
const DEFAULT_RADIUS_M = 5000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const PLACES_CACHE = new Map<string, { data: unknown[]; ts: number }>();
const PLACES_CACHE_TTL_MS = 60 * 1000;
const DETAILS_CACHE = new Map<string, { data: PlaceDetailsResult; ts: number }>();
const DETAILS_CACHE_TTL_MS = 5 * 60 * 1000;
const DETAILS_FIELDS = "price_level,rating,user_ratings_total,photos,vicinity";

function getApiKey(): string | null {
  const key =
    process.env.GOOGLE_MAPS_API_KEY?.trim() || process.env.GOOGLE_MAPS_KEY?.trim();
  return key || null;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  name: string;
}

/**
 * Geocode a city name to lat/lng. Results are cached by normalized city name.
 */
export async function geocodeWithGoogle(city: string): Promise<GeocodeResult | null> {
  const key = city.trim().toLowerCase();
  const cached = COORD_CACHE.get(key);
  if (cached) return { ...cached, name: city.trim() };

  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `${GEOCODE_URL}?address=${encodeURIComponent(city.trim())}&key=${apiKey}`,
      { next: { revalidate: 0 } }
    );
    const data = (await res.json()) as {
      status: string;
      results?: Array<{
        geometry: { location: { lat: number; lng: number } };
        formatted_address?: string;
        address_components?: Array<{ long_name: string; types: string[] }>;
      }>;
    };
    if (data.status !== "OK" || !data.results?.[0]) return null;
    const loc = data.results[0].geometry.location;
    const lat = Number(loc.lat);
    const lng = Number(loc.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    COORD_CACHE.set(key, { lat, lng });
    return { lat, lng, name: city.trim() };
  } catch {
    return null;
  }
}

const PLACE_PHOTO_BASE = "https://maps.googleapis.com/maps/api/place/photo";

/** Result from Place Details API (subset we use). */
export interface PlaceDetailsResult {
  price_level?: number;
  rating?: number;
  user_ratings_total?: number;
  photo_reference?: string;
  vicinity?: string;
}

export interface PlaceResult {
  place_id: string;
  name: string;
  lat: number;
  lng: number;
  rating?: number;
  price_level?: number;
  user_ratings_total?: number;
  types: string[];
  vicinity?: string;
  photo_reference?: string;
  /** URL for first photo (maxwidth=800). Built from photo_reference when present. */
  photo_url?: string;
}

/** price_level (0–4) → estimated USD (midpoint of range for display). */
function priceLevelToEstimateUsd(level?: number): number | undefined {
  if (level == null || level < 0 || level > 4) return undefined;
  const map: Record<number, number> = { 0: 15, 1: 40, 2: 85, 3: 175, 4: 350 };
  return map[level];
}

/** price_level (0–4) → $ to $$$$$. */
function priceLevelToTier(level?: number): string | undefined {
  if (level == null || level < 0 || level > 4) return undefined;
  return ["$", "$$", "$$$", "$$$$", "$$$$$"][level];
}

/**
 * Fetch Place Details for a single place_id. Returns null on failure (fail silently).
 * Cached briefly to avoid duplicate requests.
 */
export async function fetchPlaceDetails(placeId: string): Promise<PlaceDetailsResult | null> {
  if (!placeId) return null;
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const cached = DETAILS_CACHE.get(placeId);
  if (cached && Date.now() - cached.ts < DETAILS_CACHE_TTL_MS) return cached.data;

  try {
    const url = `${PLACE_DETAILS_URL}?place_id=${encodeURIComponent(placeId)}&fields=${encodeURIComponent(DETAILS_FIELDS)}&key=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    const data = (await res.json()) as {
      status: string;
      result?: {
        price_level?: number;
        rating?: number;
        user_ratings_total?: number;
        photos?: Array<{ photo_reference?: string }>;
        vicinity?: string;
      };
    };
    if (data.status !== "OK" || !data.result) return null;
    const r = data.result;
    const photo_reference = r.photos?.[0]?.photo_reference;
    const out: PlaceDetailsResult = {
      price_level: r.price_level,
      rating: r.rating,
      user_ratings_total: r.user_ratings_total,
      photo_reference,
      vicinity: r.vicinity,
    };
    DETAILS_CACHE.set(placeId, { data: out, ts: Date.now() });
    return out;
  } catch {
    return null;
  }
}

function placesCacheKey(lat: number, lng: number, type: string): string {
  return `${lat.toFixed(4)}_${lng.toFixed(4)}_${type}`;
}

/**
 * Fetch nearby places from Google Places API (Legacy Nearby Search).
 * Uses location + radius; one type per request. Results cached briefly.
 */
export async function fetchNearbyPlaces(
  lat: number,
  lng: number,
  type: string,
  radiusMeters: number = DEFAULT_RADIUS_M
): Promise<PlaceResult[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  const cacheKey = placesCacheKey(lat, lng, type);
  const cached = PLACES_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < PLACES_CACHE_TTL_MS) {
    return cached.data as PlaceResult[];
  }

  try {
    const url = `${PLACES_NEARBY_URL}?location=${lat},${lng}&radius=${radiusMeters}&type=${encodeURIComponent(type)}&key=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    const data = (await res.json()) as {
      status: string;
      results?: Array<{
        place_id?: string;
        name?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
        rating?: number;
        price_level?: number;
        types?: string[];
        vicinity?: string;
        photos?: Array<{ photo_reference?: string }>;
      }>;
    };
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") return [];
    const rawList = (data.results ?? []).map((r) => {
      const photoRef = r.photos?.[0]?.photo_reference;
      const photo_url =
        apiKey && photoRef
          ? `${PLACE_PHOTO_BASE}?maxwidth=800&photo_reference=${encodeURIComponent(photoRef)}&key=${apiKey}`
          : undefined;
      return {
        place_id: r.place_id ?? "",
        name: r.name ?? "Place",
        lat: Number(r.geometry?.location?.lat) || lat,
        lng: Number(r.geometry?.location?.lng) || lng,
        rating: r.rating,
        price_level: r.price_level,
        types: r.types ?? [],
        vicinity: r.vicinity,
        photo_reference: photoRef,
        photo_url,
      };
    });

    const withDetails = await Promise.all(
      rawList.map(async (p) => {
        const details = await fetchPlaceDetails(p.place_id);
        if (!details) return p;
        const photoRef = details.photo_reference ?? p.photo_reference;
        const photo_url =
          apiKey && photoRef
            ? `${PLACE_PHOTO_BASE}?maxwidth=800&photo_reference=${encodeURIComponent(photoRef)}&key=${apiKey}`
            : p.photo_url;
        return {
          ...p,
          rating: details.rating ?? p.rating,
          price_level: details.price_level ?? p.price_level,
          user_ratings_total: details.user_ratings_total,
          vicinity: details.vicinity ?? p.vicinity,
          photo_reference: photoRef ?? p.photo_reference,
          photo_url,
        };
      })
    );

    PLACES_CACHE.set(cacheKey, { data: withDetails, ts: Date.now() });
    return withDetails;
  } catch {
    return [];
  }
}

/** Place types for hotels (lodging). */
export const PLACES_TYPE_LODGING = "lodging";

/** Place types for attractions: tourist_attraction, museum, restaurant, park. */
export const PLACES_TYPES_ATTRACTIONS = [
  "tourist_attraction",
  "museum",
  "restaurant",
  "park",
] as const;

export type NormalizedPlace = import("@/types").NormalizedPlace;

/** Result from Directions API for one travel mode. */
export interface DirectionsLegResult {
  distance_km: number;
  duration_minutes: number;
  /** Transit fare in USD if available; otherwise null. */
  fare_usd?: number | null;
}

type DirectionsMode = "driving" | "walking" | "transit";

const DIRECTIONS_CACHE = new Map<string, { data: DirectionsLegResult; ts: number }>();
const DIRECTIONS_CACHE_TTL_MS = 10 * 60 * 1000;

function directionsCacheKey(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  mode: DirectionsMode
): string {
  return `${originLat.toFixed(5)}_${originLng.toFixed(5)}_${destLat.toFixed(5)}_${destLng.toFixed(5)}_${mode}`;
}

/**
 * Fetch directions for a single travel mode from Google Directions API.
 * Returns null if API key missing, request fails, or ZERO_RESULTS.
 */
export async function fetchDirectionsForMode(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  mode: DirectionsMode
): Promise<DirectionsLegResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const cacheKey = directionsCacheKey(originLat, originLng, destLat, destLng, mode);
  const cached = DIRECTIONS_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < DIRECTIONS_CACHE_TTL_MS) return cached.data;

  try {
    const origin = `${originLat},${originLng}`;
    const destination = `${destLat},${destLng}`;
    const url = `${DIRECTIONS_URL}?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=${mode}&key=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    const data = (await res.json()) as {
      status: string;
      routes?: Array<{
        fare?: { value?: number; currency?: string };
        legs?: Array<{
          distance?: { value: number };
          duration?: { value: number };
          duration_in_traffic?: { value: number };
        }>;
      }>;
    };
    if (data.status !== "OK" || !data.routes?.[0]) return null;
    const route = data.routes[0];
    const leg = route.legs?.[0];
    if (!leg) return null;
    const distM = leg.distance?.value ?? 0;
    const durS = leg.duration_in_traffic?.value ?? leg.duration?.value ?? 0;
    const fare = route.fare?.value;
    const result: DirectionsLegResult = {
      distance_km: distM / 1000,
      duration_minutes: Math.ceil(durS / 60),
      fare_usd: fare != null ? fare : null,
    };
    DIRECTIONS_CACHE.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  } catch {
    return null;
  }
}

function toNormalizedPlace(p: PlaceResult, type: "hotel" | "attraction"): NormalizedPlace {
  return {
    id: p.place_id || `${p.name}-${p.lat}-${p.lng}`,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    rating: p.rating,
    price_level: p.price_level,
    price_estimate_usd: priceLevelToEstimateUsd(p.price_level),
    price_tier: priceLevelToTier(p.price_level),
    user_ratings_total: p.user_ratings_total,
    vicinity: p.vicinity,
    type,
    photo_reference: p.photo_reference,
    photo_url: p.photo_url,
  };
}

/**
 * Geocode city once, fetch hotels (lodging) and attractions (all types) in parallel.
 * Uses existing cache; no duplicate geocode or repeated Places calls for same location.
 * Returns empty arrays if no API key or no results.
 */
export async function fetchPlacesByCity(city: string): Promise<{
  hotels: NormalizedPlace[];
  attractions: NormalizedPlace[];
}> {
  const point = await geocodeWithGoogle(city);
  if (!point) return { hotels: [], attractions: [] };

  const { lat, lng } = point;

  const [hotelResults, ...attractionResults] = await Promise.all([
    fetchNearbyPlaces(lat, lng, PLACES_TYPE_LODGING),
    ...PLACES_TYPES_ATTRACTIONS.map((type) => fetchNearbyPlaces(lat, lng, type)),
  ]);

  const hotels: NormalizedPlace[] = hotelResults.slice(0, 20).map((p) => toNormalizedPlace(p, "hotel"));

  const seen = new Set<string>();
  const attractions: NormalizedPlace[] = [];
  for (const list of attractionResults) {
    for (const p of list) {
      const id = p.place_id || `${p.name}-${p.lat}-${p.lng}`;
      if (seen.has(id)) continue;
      seen.add(id);
      attractions.push(toNormalizedPlace(p, "attraction"));
    }
  }

  return { hotels, attractions: attractions.slice(0, 80) };
}
