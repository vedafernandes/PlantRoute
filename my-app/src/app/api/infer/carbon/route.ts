import { NextRequest, NextResponse } from "next/server";
import { validateBody } from "@/lib/validate";
import { CarbonRequestSchema } from "@/lib/schemas";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { carbonFromGrid } from "@/lib/carbon-from-grid";
import { carbonPredictorLocal } from "@/lib/carbon-local";

/**
 * Uses grid carbon intensity (Electricity Maps) when ELECTRICITY_MAPS_API_KEY is set
 * and the destination has data; otherwise falls back to carbon-local (transport +
 * activity + hotel factors).
 */
export async function POST(req: NextRequest) {
  const rateLimitResponse = await withRateLimit(req, RATE_LIMITS.carbon, null);
  if (rateLimitResponse) return rateLimitResponse;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validated = validateBody(CarbonRequestSchema, body);
  if (validated.error) return validated.error;

  const itinerary = validated.data.itinerary as Parameters<typeof carbonPredictorLocal>[0];

  const gridResult = await carbonFromGrid(itinerary);
  const result = gridResult ?? carbonPredictorLocal(itinerary);
  return NextResponse.json(result);
}
