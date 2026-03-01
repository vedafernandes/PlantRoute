/**
 * Grid carbon intensity (CO₂e / kWh) — free, no API key.
 *
 * Uses OpenStreetMap Nominatim (reverse geocode) to get country from lat/lon,
 * then looks up average grid intensity from a static country dataset. Relative
 * sustainability signal only; not real-time and not per-building emissions.
 *
 * Assumptions / limitations:
 * - We do not have hotel- or attraction-specific energy usage; this is grid-level only.
 * - Result is a relative indicator (compare locations), not precise Scope 2.
 * - Intensity data is approximate (country-level averages), not live.
 */

import {
  CARBON_INTENSITY_BY_COUNTRY,
  DEFAULT_INTENSITY,
} from "./grid-intensity-by-country";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

export interface GridCarbonResult {
  /** Carbon intensity in gCO₂eq/kWh (grid average for country). */
  carbonIntensityGPerKwh: number;
  /**
   * Normalized sustainability signal in [0, 1].
   * 0 = greenest (low intensity), 1 = highest intensity.
   */
  normalizedSignal: number;
  /** Country code (e.g. "FR") if resolved. */
  zone?: string;
}

/**
 * Reverse geocode lat/lon to country code via Nominatim (free, no key).
 * Respects 1 req/s; use a descriptive User-Agent per OSM policy.
 */
async function getCountryCode(lat: number, lon: number): Promise<string | null> {
  const url = new URL(`${NOMINATIM_BASE}/reverse`);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "json");

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "PlantRoute/1.0 (sustainable travel hackathon; grid carbon indicator)",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { address?: { country_code?: string } };
    const code = data.address?.country_code;
    return typeof code === "string" ? code.toUpperCase() : null;
  } catch {
    return null;
  }
}

/**
 * Returns grid carbon intensity for a location (free: Nominatim + static data).
 * No API key required.
 *
 * @param lat - Latitude
 * @param lon - Longitude
 * @returns Grid carbon result, or null if reverse geocode fails (then caller can fall back).
 */
export async function getGridCarbonIntensity(
  lat: number,
  lon: number
): Promise<GridCarbonResult | null> {
  try {
    const countryCode = await getCountryCode(lat, lon);
    const carbonIntensityGPerKwh =
      countryCode && CARBON_INTENSITY_BY_COUNTRY[countryCode] != null
        ? CARBON_INTENSITY_BY_COUNTRY[countryCode]
        : DEFAULT_INTENSITY;

    // Normalize to [0, 1]. Typical range ~0–700 gCO2/kWh.
    const NORMALIZE_CAP_G_PER_KWH = 600;
    const normalizedSignal = Math.min(
      1,
      Math.max(0, carbonIntensityGPerKwh / NORMALIZE_CAP_G_PER_KWH)
    );

    return {
      carbonIntensityGPerKwh,
      normalizedSignal,
      zone: countryCode ?? undefined,
    };
  } catch {
    return null;
  }
}
