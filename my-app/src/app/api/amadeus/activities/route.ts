import { NextRequest, NextResponse } from "next/server";
import { validateQuery } from "@/lib/validate";
import { ActivitiesQuerySchema } from "@/lib/schemas";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { fetchPlacesByCity } from "@/lib/google-maps";
import { MOCK_ACTIVITIES } from "@/lib/mocks";

/**
 * GET /api/amadeus/activities?city=&limit=
 * Returns Google Places attractions when GOOGLE_MAPS_API_KEY is set; otherwise mock activities.
 * Limit caps the number returned.
 */
export async function GET(req: NextRequest) {
  const rateLimitResponse = await withRateLimit(req, RATE_LIMITS.amadeus, null);
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = new URL(req.url);
  const query = Object.fromEntries(searchParams);
  const validated = validateQuery(ActivitiesQuerySchema, query);
  if (validated.error) return validated.error;

  const { city, limit } = validated.data;

  const { attractions } = await fetchPlacesByCity(city);
  const capped = attractions.slice(0, limit);

  if (capped.length > 0) {
    return NextResponse.json({
      activities: capped,
      attractions: capped,
      source: "google_places",
    });
  }

  // No Google Places results (e.g. missing GOOGLE_MAPS_API_KEY): return mock activities so places still show
  const mockWithCity = MOCK_ACTIVITIES.slice(0, limit).map((a) => ({
    ...a,
    id: `${a.id}-${city.replace(/\s+/g, "-").toLowerCase()}`,
    location: { ...a.location, name: city },
  }));
  return NextResponse.json({
    activities: mockWithCity,
    attractions: mockWithCity,
    source: "fallback_mock",
  });
}
