/**
 * Computes transport options (walk, bus, car) for a given distance.
 */
import { EMISSION_FACTORS } from "./carbon";

const WALK_THRESHOLD_KM = 2;
const WALK_MAX_RECOMMEND_MINUTES = 60;
const WALK_SPEED_KMH = 4;
const BUS_SPEED_KMH = 20;
const CAR_SPEED_KMH = 35;
const BUS_PRICE_PER_KM = 0.15;
const CAR_PRICE_PER_KM = 0.35;

export type TransportOptionMode = "walk" | "bus" | "car";

export interface TransportOption {
  mode: TransportOptionMode;
  duration_minutes: number;
  emission_kg: number;
  price_usd: number;
  isRecommended: boolean;
}

export function getTransportOptions(distance_km: number): TransportOption[] {
  const walkDuration = Math.ceil((distance_km / WALK_SPEED_KMH) * 60);
  const includeWalk = walkDuration <= WALK_MAX_RECOMMEND_MINUTES;
  const options: TransportOption[] = [];
  if (includeWalk) {
    options.push({
      mode: "walk",
      duration_minutes: walkDuration,
      emission_kg: 0,
      price_usd: 0,
      isRecommended: false,
    });
  }
  const busDuration = Math.ceil((distance_km / BUS_SPEED_KMH) * 60);
  options.push({
    mode: "bus",
    duration_minutes: busDuration,
    emission_kg: Math.round(distance_km * (EMISSION_FACTORS.bus ?? 0.08) * 1000) / 1000,
    price_usd: Math.round(distance_km * BUS_PRICE_PER_KM * 100) / 100,
    isRecommended: false,
  });
  options.push({
    mode: "car",
    duration_minutes: Math.ceil((distance_km / CAR_SPEED_KMH) * 60),
    emission_kg: Math.round(distance_km * (EMISSION_FACTORS.car ?? 0.2) * 1000) / 1000,
    price_usd: Math.round(distance_km * CAR_PRICE_PER_KM * 100) / 100,
    isRecommended: false,
  });
  return options;
}
