import { NextRequest, NextResponse } from "next/server";
import { validateQuery } from "@/lib/validate";
import { HotelsQuerySchema } from "@/lib/schemas";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { fetchPlacesByCity } from "@/lib/google-maps";
import { MOCK_HOTELS } from "@/lib/mocks";

/**
 * GET /api/amadeus/hotels?city=&checkIn=&checkOut=
 * Returns Google Places lodging when GOOGLE_MAPS_API_KEY is set; otherwise mock hotels.
 */
export async function GET(req: NextRequest) {
  const rateLimitResponse = await withRateLimit(req, RATE_LIMITS.amadeus, null);
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = new URL(req.url);
  const query = Object.fromEntries(searchParams);
  const validated = validateQuery(HotelsQuerySchema, query);
  if (validated.error) return validated.error;

  const { city } = validated.data;

  const { hotels } = await fetchPlacesByCity(city);

  if (hotels.length > 0) {
    return NextResponse.json({ hotels, source: "google_places" });
  }

  // No Google Places results: return mock hotels so hotels still show
  const mockWithCity = MOCK_HOTELS.map((h, i) => ({
    ...h,
    id: `mock-hotel-${city.replace(/\s+/g, "-").toLowerCase()}-${i}`,
    location: { ...h.location, name: city },
  }));
  return NextResponse.json({ hotels: mockWithCity, source: "fallback_mock" });
}
