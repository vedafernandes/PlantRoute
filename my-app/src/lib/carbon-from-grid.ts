/**
 * Builds a CarbonResult from grid carbon intensity at the itinerary destination.
 *
 * Uses carbon-grid.ts (free: Nominatim reverse geocode + static country intensity)
 * for a representative lat/lon (centroid of the trip). Returns a result in the same
 * shape as the existing carbon predictor so applyCarbonResult and the UI keep working.
 *
 * Assumptions:
 * - Single representative point (centroid) for the whole trip; no per-building energy data.
 * - total_kg is a scaled "trip impact" from grid intensity (relative indicator only).
 */

import type { Itinerary, CarbonResult, CarbonItem } from "@/types";
import { getGridCarbonIntensity } from "./carbon-grid";

/** Scale grid intensity (gCO₂/kWh) to a display "trip impact" (kg). Purely relative. */
const TRIP_IMPACT_SCALE = 0.15;

/**
 * Picks a representative (lat, lon) from the itinerary (centroid of first day's
 * hotel + activities, or first available point).
 */
function itineraryCenter(itinerary: Itinerary): { lat: number; lng: number } | null {
  if (!itinerary.days?.length) return null;
  const day = itinerary.days[0];
  const points: Array<{ lat: number; lng: number }> = [];
  if (day.hotel?.location) {
    points.push(day.hotel.location);
  }
  for (const a of day.activities ?? []) {
    if (a.location) points.push(a.location);
  }
  if (points.length === 0) return null;
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
  return { lat, lng };
}

/**
 * Computes a CarbonResult from grid intensity at the itinerary destination.
 * If the grid lookup fails (e.g. Nominatim timeout), returns null
 * (caller should fall back to carbonPredictorLocal).
 */
export async function carbonFromGrid(itinerary: Itinerary): Promise<CarbonResult | null> {
  const center = itineraryCenter(itinerary);
  if (!center) return null;

  const grid = await getGridCarbonIntensity(center.lat, center.lng);
  if (!grid) return null;

  // Scale to a "trip impact" number for display (relative only; not real kg).
  const total_kg = Math.round(grid.carbonIntensityGPerKwh * TRIP_IMPACT_SCALE * 100) / 100;

  const item: CarbonItem = {
    id: "grid-intensity",
    type: "hotel",
    description: `Grid intensity ${grid.carbonIntensityGPerKwh} gCO₂/kWh${grid.zone ? ` (${grid.zone})` : ""}`,
    distance_km: null,
    emission_kg: total_kg,
  };

  return {
    items: [item],
    total_kg,
  };
}
