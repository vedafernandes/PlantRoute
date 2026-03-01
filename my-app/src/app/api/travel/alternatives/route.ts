/**
 * Returns alternative transport options to flying: train, bus, and drive.
 * Uses Google Directions API for drive (real times); distance-based estimates for train/bus.
 */
import { NextRequest, NextResponse } from "next/server";
import { haversine } from "@/lib/haversine";
import { fetchDirectionsForMode } from "@/lib/google-maps";
import { EMISSION_FACTORS } from "@/lib/carbon";
import type { TransportSegment } from "@/types";

const DEFAULT_ORIGIN = { lat: 41.8781, lng: -87.6298, name: "Chicago" };

const TRAIN_SPEED_KMH = 90;
const BUS_SPEED_KMH = 75;
const TRAIN_PRICE_PER_KM = 0.12;
const BUS_PRICE_PER_KM = 0.10;
const DRIVE_PRICE_PER_KM = 0.25;

const MAX_TRAIN_KM = 1500;
const MAX_BUS_KM = 1200;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { origin: originParam, destination, date, direction } = body as {
    origin?: { lat: number; lng: number; name: string };
    destination?: { lat: number; lng: number; name: string };
    date?: string;
    direction?: "arrival" | "departure";
  };

  if (!destination || typeof destination.lat !== "number" || typeof destination.lng !== "number") {
    return NextResponse.json(
      { error: "destination with lat/lng required" },
      { status: 400 }
    );
  }

  const originCoords =
    originParam && typeof originParam.lat === "number" && typeof originParam.lng === "number"
      ? originParam
      : DEFAULT_ORIGIN;
  const destName = destination.name ?? "Destination";
  const originName = originCoords.name ?? "Origin";
  const dir = direction ?? "arrival";

  const origin =
    dir === "arrival"
      ? { ...originCoords, lat: originCoords.lat, lng: originCoords.lng, name: originName }
      : { ...destination, lat: destination.lat, lng: destination.lng, name: destName };
  const dest =
    dir === "arrival"
      ? { ...destination, lat: destination.lat, lng: destination.lng, name: destName }
      : { ...originCoords, lat: originCoords.lat, lng: originCoords.lng, name: originName };

  const distance_km = haversine(origin.lat, origin.lng, dest.lat, dest.lng);
  const alternatives: TransportSegment[] = [];

  if (distance_km <= 0) {
    return NextResponse.json({ alternatives: [] });
  }

  if (distance_km <= MAX_TRAIN_KM) {
    const duration_minutes = Math.ceil((distance_km / TRAIN_SPEED_KMH) * 60);
    const emission_kg = Math.round(distance_km * (EMISSION_FACTORS.train ?? 0.04) * 1000) / 1000;
    const price_usd = Math.round(distance_km * TRAIN_PRICE_PER_KM * 100) / 100;
    alternatives.push({
      id: `train-${dir}-${destName.replace(/\s/g, "-")}`,
      mode: "train",
      origin: { ...origin, lat: origin.lat, lng: origin.lng },
      destination: { ...dest, lat: dest.lat, lng: dest.lng },
      distance_km: Math.round(distance_km * 100) / 100,
      emission_kg,
      price_usd,
      duration_minutes: Math.max(60, duration_minutes),
      search_url: `https://www.amtrak.com/routes.html`,
    });
  }

  if (distance_km <= MAX_BUS_KM) {
    const duration_minutes = Math.ceil((distance_km / BUS_SPEED_KMH) * 60);
    const emission_kg = Math.round(distance_km * (EMISSION_FACTORS.bus ?? 0.08) * 1000) / 1000;
    const price_usd = Math.round(distance_km * BUS_PRICE_PER_KM * 100) / 100;
    alternatives.push({
      id: `bus-${dir}-${destName.replace(/\s/g, "-")}`,
      mode: "bus",
      origin: { ...origin, lat: origin.lat, lng: origin.lng },
      destination: { ...dest, lat: dest.lat, lng: dest.lng },
      distance_km: Math.round(distance_km * 100) / 100,
      emission_kg,
      price_usd,
      duration_minutes: Math.max(90, duration_minutes),
      search_url: `https://www.greyhound.com/`,
    });
  }

  const driveResult = await fetchDirectionsForMode(
    origin.lat,
    origin.lng,
    dest.lat,
    dest.lng,
    "driving"
  );

  if (driveResult) {
    const emission_kg =
      Math.round(driveResult.distance_km * (EMISSION_FACTORS.car ?? 0.2) * 1000) / 1000;
    const price_usd =
      Math.round(driveResult.distance_km * DRIVE_PRICE_PER_KM * 100) / 100;
    alternatives.push({
      id: `drive-${dir}-${destName.replace(/\s/g, "-")}`,
      mode: "car",
      origin: { ...origin, lat: origin.lat, lng: origin.lng },
      destination: { ...dest, lat: dest.lat, lng: dest.lng },
      distance_km: Math.round(driveResult.distance_km * 100) / 100,
      emission_kg,
      price_usd,
      duration_minutes: driveResult.duration_minutes,
      search_url: `https://www.google.com/maps/dir/${encodeURIComponent(origin.name)}/${encodeURIComponent(dest.name)}`,
    });
  }

  return NextResponse.json({
    alternatives: alternatives.sort((a, b) => (a.emission_kg ?? 0) - (b.emission_kg ?? 0)),
  });
}
