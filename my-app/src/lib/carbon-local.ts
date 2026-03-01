/**
 * Carbon predictor: computes CO₂e for transport, activities, and hotel from itinerary.
 * Used by POST /api/infer/carbon and by client fallback when the API fails.
 */
import type { Itinerary, CarbonResult, CarbonItem } from "@/types";
import { haversine } from "./haversine";
import {
  EMISSION_FACTORS,
  RADIATIVE_FORCING_MULTIPLIER,
  ACTIVITY_FACTORS,
  HOTEL_FACTOR_PER_NIGHT,
} from "./carbon";

export function carbonPredictorLocal(itinerary: Itinerary): CarbonResult {
  const items: CarbonItem[] = [];

  for (const day of itinerary.days) {
    for (const seg of day.transport) {
      const mode = seg.mode;
      const origin = seg.origin;
      const dest = seg.destination;
      const fromCoords =
        origin && dest
          ? haversine(origin.lat, origin.lng, dest.lat, dest.lng)
          : 0;
      // Use segment distance when coords are missing or zero (e.g. flight IATA-only)
      const distKm =
        fromCoords > 0 ? fromCoords : (seg.distance_km ?? 0);

      let emission: number;
      if (mode.startsWith("flight")) {
        const factor =
          distKm < 1500 ? EMISSION_FACTORS.flight_short : EMISSION_FACTORS.flight_long;
        emission = distKm * factor * RADIATIVE_FORCING_MULTIPLIER;
      } else {
        const factor = EMISSION_FACTORS[mode] ?? EMISSION_FACTORS.car;
        emission = distKm * factor;
      }

      items.push({
        id: seg.id,
        type: "transport",
        description: `${mode} ${origin?.name ?? ""} → ${dest?.name ?? ""}`,
        distance_km: Math.round(distKm * 100) / 100,
        emission_kg: Math.round(emission * 1000) / 1000,
      });
    }

    for (const act of day.activities) {
      const cat = (act.category ?? "default").toLowerCase();
      const emission =
        ACTIVITY_FACTORS[cat as keyof typeof ACTIVITY_FACTORS] ??
        ACTIVITY_FACTORS.default;
      items.push({
        id: act.id,
        type: "activity",
        description: act.name,
        distance_km: null,
        emission_kg: Math.round(emission * 1000) / 1000,
      });
    }

    const hotel = day.hotel;
    if (hotel) {
      items.push({
        id: hotel.id,
        type: "hotel",
        description: hotel.name,
        distance_km: null,
        emission_kg: Math.round(HOTEL_FACTOR_PER_NIGHT * 1000) / 1000,
      });
    }
  }

  const total_kg =
    Math.round(items.reduce((s, i) => s + i.emission_kg, 0) * 1000) / 1000;
  return { items, total_kg };
}
