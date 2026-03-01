import { NextRequest, NextResponse } from "next/server";
import { validateBody } from "@/lib/validate";
import { HotelByProximitySchema } from "@/lib/schemas";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { suggestHotelByProximity } from "@/lib/gemini";
import { normalizedPlaceToHotel } from "@/lib/places-utils";
import { haversine } from "@/lib/haversine";
import { EMISSION_FACTORS } from "@/lib/carbon";
import type { Hotel } from "@/types";
import type { NormalizedPlace } from "@/types";

const BUS_KG_PER_KM = EMISSION_FACTORS.bus ?? 0.08;

/** Centroid of attraction locations (lat/lng). */
function centroid(
  locations: Array<{ lat: number; lng: number }>
): { lat: number; lng: number } {
  if (locations.length === 0) return { lat: 0, lng: 0 };
  const lat = locations.reduce((s, p) => s + p.lat, 0) / locations.length;
  const lng = locations.reduce((s, p) => s + p.lng, 0) / locations.length;
  return { lat, lng };
}

/** Nights between checkIn and checkOut (inclusive). */
function nightsBetween(checkIn: string, checkOut: string): number {
  const start = new Date(checkIn).getTime();
  const end = new Date(checkOut).getTime();
  return Math.max(1, Math.ceil((end - start) / (24 * 60 * 60 * 1000)));
}

/**
 * Estimated transport CO₂ (kg) for round trips hotel ↔ attractions over the stay.
 * One round trip per day, bus factor.
 */
function estimatedTransportKg(
  hotelLat: number,
  hotelLng: number,
  centerLat: number,
  centerLng: number,
  numNights: number
): number {
  const distKm = haversine(hotelLat, hotelLng, centerLat, centerLng);
  const roundTripKm = 2 * distKm * numNights;
  return Math.round(roundTripKm * BUS_KG_PER_KM * 100) / 100;
}

export async function POST(req: NextRequest) {
  const rateLimitResponse = await withRateLimit(req, RATE_LIMITS.amadeus, null);
  if (rateLimitResponse) return rateLimitResponse;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validated = validateBody(HotelByProximitySchema, body);
  if (validated.error) return validated.error;

  const { city, checkIn, checkOut, selectedAttractions } = validated.data;

  const baseUrl = req.nextUrl.origin;
  let hotels: Hotel[];
  try {
    const res = await fetch(
      `${baseUrl}/api/amadeus/hotels?city=${encodeURIComponent(city)}&checkIn=${checkIn}&checkOut=${checkOut}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch hotels", suggestedHotel: null, hotels: [] },
        { status: 502 }
      );
    }
    const data = (await res.json()) as { hotels?: NormalizedPlace[] | Hotel[] };
    const raw = Array.isArray(data.hotels) ? data.hotels : [];
    hotels = raw.map((h) =>
      "type" in h && h.type === "hotel"
        ? normalizedPlaceToHotel(h as NormalizedPlace, city)
        : (h as Hotel)
    );
  } catch (e) {
    console.error(String(e));
    return NextResponse.json(
      { error: "Failed to fetch hotels", suggestedHotel: null, hotels: [] },
      { status: 502 }
    );
  }

  const center = centroid(selectedAttractions.map((a) => a.location));
  const numNights = nightsBetween(checkIn, checkOut);

  const enriched: Hotel[] = hotels.map((h) => {
    const transportKg = estimatedTransportKg(
      h.location.lat,
      h.location.lng,
      center.lat,
      center.lng,
      numNights
    );
    return { ...h, estimated_transport_kg: transportKg };
  });

  const stayKg = (h: Hotel) => h.emission_kg_per_night ?? 15;
  const totalKg = (h: Hotel) => stayKg(h) * numNights + (h.estimated_transport_kg ?? 0);
  const sorted = [...enriched].sort((a, b) => totalKg(a) - totalKg(b));

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      suggestedHotel: sorted[0] ?? null,
      reason: "Hotel suggestion by proximity requires GEMINI_API_KEY. Showing lowest-impact option.",
      hotels: sorted,
    });
  }

  try {
    const { hotelId, reason } = await suggestHotelByProximity(
      apiKey,
      city,
      selectedAttractions.map((a) => ({
        id: a.id,
        name: a.name,
        location: a.location,
      })),
      sorted.map((h) => ({ id: h.id, name: h.name }))
    );
    const suggestedHotel = sorted.find((h) => h.id === hotelId) ?? sorted[0] ?? null;
    return NextResponse.json({
      suggestedHotel,
      reason,
      hotels: sorted,
    });
  } catch (e) {
    console.error(String(e));
    return NextResponse.json({
      suggestedHotel: sorted[0] ?? null,
      reason: "Could not compute proximity suggestion; showing lowest-impact option.",
      hotels: sorted,
    });
  }
}
