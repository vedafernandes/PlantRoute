/**
 * Google Flights redirect helper — no pricing API, no scraping.
 *
 * Why we redirect instead of booking directly:
 * - Real-time flight APIs (e.g. Amadeus) were unreliable and slow for hackathon iteration.
 * - Google Flights is the source of truth for prices and availability; we don't duplicate that.
 * - We only compute distance-based CO₂e and build a link so users can see real options and book elsewhere.
 */

import { getAirportCoords } from "./airport-coords";
import { haversine } from "./haversine";
import {
  EMISSION_FACTORS,
  RADIATIVE_FORCING_MULTIPLIER,
} from "./carbon";

/** ~800 km/h for rough duration when we only have distance */
const AVG_FLIGHT_KMH = 800;

export interface GoogleFlightsSegment {
  /** URL to open this route on Google Flights (user sees real prices & availability there). */
  booking_url: string;
  /** Estimated CO₂e in kg (distance-based, not from scraping). */
  co2e_estimate_kg: number;
  /** Great-circle distance in km. */
  distance_km: number;
  /** Rough duration in minutes (distance / 800 km/h). */
  duration_minutes: number;
  /** Short/long haul for emission factor. */
  mode: "flight_short" | "flight_long";
}

/**
 * Build a Google Flights search URL (one-way or round-trip).
 * Uses the simple q= query format: "Flights to DEST from ORIGIN on DATE" or "... through RETURN_DATE".
 */
export function buildGoogleFlightsUrl(
  origin: string,
  destination: string,
  departureDate: string,
  returnDate?: string
): string {
  const o = encodeURIComponent(origin.trim());
  const d = encodeURIComponent(destination.trim());
  const dep = encodeURIComponent(departureDate);
  if (returnDate && returnDate.trim() !== "") {
    const ret = encodeURIComponent(returnDate.trim());
    return `https://www.google.com/travel/flights?q=Flights%20to%20${d}%20from%20${o}%20on%20${dep}%20through%20${ret}`;
  }
  return `https://www.google.com/travel/flights?q=Flights%20to%20${d}%20from%20${o}%20on%20${dep}`;
}

/**
 * Returns booking_url (Google Flights), co2e_estimate (kg), distance_km, and rough duration.
 * Does NOT call any flight API; uses airport coords + haversine for distance, then our carbon factors.
 */
export function getGoogleFlightsSegment(
  origin: string,
  destination: string,
  departureDate: string,
  returnDate?: string
): GoogleFlightsSegment {
  const originCode = origin.trim().toUpperCase().slice(0, 3);
  const destCode = destination.trim().toUpperCase().slice(0, 3);

  const origCoords = getAirportCoords(originCode);
  const destCoords = getAirportCoords(destCode);

  let distance_km = 0;
  if (origCoords && destCoords) {
    distance_km = haversine(origCoords[0], origCoords[1], destCoords[0], destCoords[1]);
    distance_km = Math.round(distance_km * 100) / 100;
  }
  if (distance_km <= 0) {
    distance_km = 1000;
  }

  const mode: "flight_short" | "flight_long" = distance_km >= 1500 ? "flight_long" : "flight_short";
  const factor = mode === "flight_long" ? EMISSION_FACTORS.flight_long : EMISSION_FACTORS.flight_short;
  const co2e_estimate_kg =
    Math.round(distance_km * factor * RADIATIVE_FORCING_MULTIPLIER * 1000) / 1000;
  const duration_minutes = Math.round((distance_km / AVG_FLIGHT_KMH) * 60);

  const booking_url = buildGoogleFlightsUrl(originCode, destCode, departureDate, returnDate);

  return {
    booking_url,
    co2e_estimate_kg,
    distance_km,
    duration_minutes,
    mode,
  };
}
