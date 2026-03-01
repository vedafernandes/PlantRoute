import { NextRequest, NextResponse } from "next/server";
import { fetchDirectionsForMode } from "@/lib/google-maps";
import { haversine } from "@/lib/haversine";
import { EMISSION_FACTORS } from "@/lib/carbon";

const WALK_THRESHOLD_KM = 2;
const WALK_MAX_RECOMMEND_MINUTES = 60;
const WALK_MAX_DISTANCE_KM = 10; /** No walk option for long/city-to-city legs */
const TRANSIT_PRICE_PER_KM = 0.15;
const CAR_PRICE_PER_KM = 0.35;

export interface TransportOptionResponse {
  mode: "walk" | "transit" | "drive";
  duration_minutes: number;
  distance_km: number;
  emission_kg: number;
  price_usd: number;
  isRecommended: boolean;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { origin, destination } = body as {
    origin?: { lat: number; lng: number };
    destination?: { lat: number; lng: number };
  };
  if (
    !origin ||
    !destination ||
    typeof origin.lat !== "number" ||
    typeof origin.lng !== "number" ||
    typeof destination.lat !== "number" ||
    typeof destination.lng !== "number"
  ) {
    return NextResponse.json(
      { error: "origin and destination with lat/lng required" },
      { status: 400 }
    );
  }

  const straightLineKm = haversine(
    origin.lat,
    origin.lng,
    destination.lat,
    destination.lng
  );
  const fetchWalk = straightLineKm <= WALK_MAX_DISTANCE_KM;

  const [walkResult, transitResult, driveResult] = await Promise.all([
    fetchWalk
      ? fetchDirectionsForMode(
          origin.lat,
          origin.lng,
          destination.lat,
          destination.lng,
          "walking"
        )
      : Promise.resolve(null),
    fetchDirectionsForMode(
      origin.lat,
      origin.lng,
      destination.lat,
      destination.lng,
      "transit"
    ),
    fetchDirectionsForMode(
      origin.lat,
      origin.lng,
      destination.lat,
      destination.lng,
      "driving"
    ),
  ]);

  const options: TransportOptionResponse[] = [];
  if (walkResult && walkResult.duration_minutes <= WALK_MAX_RECOMMEND_MINUTES) {
    const dist = walkResult.distance_km;
    const walkDuration = walkResult.duration_minutes;
    const walkOk = dist <= WALK_THRESHOLD_KM && walkDuration <= WALK_MAX_RECOMMEND_MINUTES;
    options.push({
      mode: "walk",
      duration_minutes: walkDuration,
      distance_km: dist,
      emission_kg: 0,
      price_usd: 0,
      isRecommended: walkOk,
    });
  }
  if (transitResult) {
    const dist = transitResult.distance_km;
    const emission = dist * (EMISSION_FACTORS.bus ?? 0.08);
    const walkRecommended =
      walkResult &&
      walkResult.distance_km <= WALK_THRESHOLD_KM &&
      walkResult.duration_minutes <= WALK_MAX_RECOMMEND_MINUTES;
    options.push({
      mode: "transit",
      duration_minutes: transitResult.duration_minutes,
      distance_km: dist,
      emission_kg: Math.round(emission * 1000) / 1000,
      price_usd:
        transitResult.fare_usd != null
          ? transitResult.fare_usd
          : Math.round(dist * TRANSIT_PRICE_PER_KM * 100) / 100,
      isRecommended: !walkRecommended,
    });
  }
  if (driveResult) {
    const dist = driveResult.distance_km;
    const emission = dist * (EMISSION_FACTORS.car ?? 0.2);
    options.push({
      mode: "drive",
      duration_minutes: driveResult.duration_minutes,
      distance_km: dist,
      emission_kg: Math.round(emission * 1000) / 1000,
      price_usd: Math.round(dist * CAR_PRICE_PER_KM * 100) / 100,
      isRecommended: false,
    });
  }

  if (options.length === 0) {
    return NextResponse.json({
      options: [],
      fallback: true,
      message: "No routes found; use static estimates",
    });
  }

  options.forEach((o) => (o.isRecommended = false));

  return NextResponse.json({ options, fallback: false });
}
