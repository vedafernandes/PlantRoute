import { NextRequest, NextResponse } from "next/server";
import { validateQuery } from "@/lib/validate";
import { FlightsQuerySchema } from "@/lib/schemas";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getGoogleFlightsSegment, buildGoogleFlightsUrl } from "@/lib/google-flights";
import { computeFlightEmissions, type FlightLeg } from "@/lib/travel-impact-model";
import { findRealFlights } from "@/lib/gemini";
import { getAirportCoords } from "@/lib/airport-coords";
import { haversine } from "@/lib/haversine";
import { EMISSION_FACTORS, RADIATIVE_FORCING_MULTIPLIER } from "@/lib/carbon";
import type { TransportSegment } from "@/types";

/** Remove segments that have the same distance, duration, and emissions (keep first of each). */
function dedupeFlights(segments: TransportSegment[]): TransportSegment[] {
  const seen = new Set<string>();
  return segments.filter((s) => {
    const d = s.distance_km ?? 0;
    const key = `${Math.round(d)}|${s.duration_minutes}|${Math.round(s.emission_kg ?? 0)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Flights: Amadeus + Travel Impact Model when keys set; else redirect-only (distance-based CO₂e).
 */

export async function GET(req: NextRequest) {
  const rateLimitResponse = await withRateLimit(req, RATE_LIMITS.amadeus, null);
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = new URL(req.url);
  const query = Object.fromEntries(searchParams);
  const validated = validateQuery(FlightsQuerySchema, query);
  if (validated.error) return validated.error;

  const { origin, destination, date, adults } = validated.data;
  const originCode = origin.trim().toUpperCase().slice(0, 3);
  const destCode = destination.trim().toUpperCase().slice(0, 3);

  const travelImpactKey = process.env.GOOGLE_TRAVEL_IMPACT_API_KEY?.trim() || process.env.GOOGLE_CLOUD_API_KEY?.trim();
  const hasAmadeus = process.env.AMADEUS_API_KEY?.trim() && process.env.AMADEUS_API_SECRET?.trim();
  if (travelImpactKey && hasAmadeus) {
    try {
      const flights = await findRealFlights(
        process.env.GEMINI_API_KEY?.trim() ?? "",
        originCode,
        destCode,
        date,
        adults ?? 1
      );
      if (flights.length > 0) {
        const [y, m, d] = date.split("-").map(Number);
        const legs: FlightLeg[] = flights.slice(0, 5).map((f) => {
          const numMatch = f.flight_number.replace(/\D/g, "") || "0";
          return {
            origin: f.origin_iata,
            destination: f.destination_iata,
            operatingCarrierCode: f.airline.length === 2 ? f.airline : f.airline.slice(0, 2),
            flightNumber: parseInt(numMatch, 10) || 0,
            departureDate: { year: y, month: m, day: d },
          };
        });
        const emissionsKg = await computeFlightEmissions(travelImpactKey, legs);
        const bookingUrl = buildGoogleFlightsUrl(originCode, destCode, date);
        const origCoords = getAirportCoords(originCode);
        const destCoords = getAirportCoords(destCode);
        const segments: TransportSegment[] = flights.slice(0, 5).map((f, i) => {
          const oCoord = getAirportCoords(f.origin_iata);
          const dCoord = getAirportCoords(f.destination_iata);
          const fromCoords =
            oCoord && dCoord
              ? Math.round(haversine(oCoord[0], oCoord[1], dCoord[0], dCoord[1]) * 100) / 100
              : null;
          const distance_km = fromCoords ?? Math.round((f.duration_minutes / 60) * 800 * 100) / 100;
          const mode = f.duration_minutes >= 180 ? "flight_long" : "flight_short";
          const distForEmission = distance_km;
          const factor = mode === "flight_long" ? EMISSION_FACTORS.flight_long : EMISSION_FACTORS.flight_short;
          const fallbackEmission = Math.round(distForEmission * factor * RADIATIVE_FORCING_MULTIPLIER * 1000) / 1000;
          const emission_kg = (emissionsKg[i] != null && emissionsKg[i] > 0) ? emissionsKg[i]! : fallbackEmission;
          return {
            id: `${f.id ?? "flight"}-${i}`,
            mode,
            origin: {
              lat: origCoords?.[0] ?? 0,
              lng: origCoords?.[1] ?? 0,
              name: f.origin_iata,
            },
            destination: {
              lat: destCoords?.[0] ?? 0,
              lng: destCoords?.[1] ?? 0,
              name: f.destination_iata,
            },
            distance_km,
            emission_kg,
            price_usd: 0,
            duration_minutes: f.duration_minutes,
            provider: f.airline,
            provider_logo_url: `https://images.kiwi.com/airlines/64/${f.airline.slice(0, 2)}.png`,
            search_url: bookingUrl,
          };
        });
        return NextResponse.json({ flights: dedupeFlights(segments), source: "amadeus_travel_impact_free" });
      }
    } catch {
      // fall through to redirect-only
    }
  }

  const gf = getGoogleFlightsSegment(originCode, destCode, date);
  const origCoords = getAirportCoords(originCode);
  const destCoords = getAirportCoords(destCode);

  const segment: TransportSegment = {
    id: `flight-${originCode}-${destCode}-${date}`,
    mode: gf.mode,
    origin: {
      lat: origCoords?.[0] ?? 0,
      lng: origCoords?.[1] ?? 0,
      name: originCode,
    },
    destination: {
      lat: destCoords?.[0] ?? 0,
      lng: destCoords?.[1] ?? 0,
      name: destCode,
    },
    distance_km: gf.distance_km,
    emission_kg: gf.co2e_estimate_kg,
    price_usd: 0,
    duration_minutes: gf.duration_minutes,
    search_url: gf.booking_url,
  };

  return NextResponse.json({
    flights: [segment],
    source: "google_flights_redirect",
  });
}
