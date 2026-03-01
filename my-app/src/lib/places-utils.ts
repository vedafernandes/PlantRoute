import type { NormalizedPlace, Hotel, Activity } from "@/types";

/** Map price_level (0–4) to approximate USD per night. */
function priceLevelToNightly(priceLevel?: number): number {
  if (priceLevel == null || priceLevel < 0) return 100;
  const map: Record<number, number> = { 0: 60, 1: 90, 2: 120, 3: 180, 4: 280 };
  return map[priceLevel] ?? 120;
}

/** Rating 0–5 to star count 1–5. */
function ratingToStars(rating?: number): number {
  if (rating == null || !Number.isFinite(rating)) return 3;
  return Math.max(1, Math.min(5, Math.round(rating)));
}

/** Map price_level (0–4) to approximate USD for activities. */
function priceLevelToUsd(priceLevel?: number): number {
  if (priceLevel == null || priceLevel < 0) return 0;
  const map: Record<number, number> = { 0: 0, 1: 10, 2: 25, 3: 50, 4: 80 };
  return map[priceLevel] ?? 15;
}

export function normalizedPlaceToHotel(p: NormalizedPlace, cityName: string): Hotel {
  const stars = ratingToStars(p.rating);
  return {
    id: p.id,
    name: p.name,
    location: { lat: p.lat, lng: p.lng, name: cityName },
    price_per_night_usd: priceLevelToNightly(p.price_level),
    stars,
    image_url: p.photo_url,
  };
}

export function normalizedPlaceToActivity(p: NormalizedPlace, cityName: string): Activity {
  const priceUsd = p.price_level != null ? priceLevelToUsd(p.price_level) : 0;
  const tier = p.price_tier ?? (p.price_level != null ? ["$", "$$", "$$$", "$$$$", "$$$$$"][Math.min(4, Math.max(0, p.price_level))] : undefined);
  return {
    id: p.id,
    name: p.name,
    category: "sightseeing",
    location: { lat: p.lat, lng: p.lng, name: cityName },
    price_usd: priceUsd,
    duration_hours: 1.5,
    interest_score: p.rating != null ? p.rating / 5 : undefined,
    image_url: p.photo_url,
    price_tier: tier,
  };
}
