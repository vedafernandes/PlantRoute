/**
 * Client-side type definitions for carbon API.
 * Emission factors used by src/lib/carbon-local.ts (single source of truth).
 */
import type { Itinerary, CarbonResult } from "@/types";

export const EMISSION_FACTORS: Record<string, number> = {
  flight_short: 0.15,
  flight_long: 0.11,
  train: 0.04,
  bus: 0.08,
  car: 0.2,
  ferry: 0.12,
  walk: 0,
};

export const RADIATIVE_FORCING_MULTIPLIER = 1.9;

export const ACTIVITY_FACTORS: Record<string, number> = {
  museum: 2.5,
  restaurant: 4.0,
  outdoor: 0.5,
  ski: 18.0,
  beach: 0.8,
  nightlife: 3.0,
  wellness: 2.0,
  shopping: 5.0,
  default: 3.0,
};

export const HOTEL_FACTOR_PER_NIGHT = 15.0;

/** kg CO₂ absorbed per mature tree per year (used for trees-saved counter). */
export const KG_PER_TREE = 21;

/** Conservative baseline emission per trip (kg) when computing trees saved. */
export const BASELINE_PER_TRIP_KG = 100;

export type { Itinerary, CarbonResult };
