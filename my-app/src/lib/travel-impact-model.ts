/**
 * Google Travel Impact Model API — free, same CO₂e methodology as Google Flights.
 * Requires flight legs (origin, destination, carrier, flight number, date).
 * @see https://developers.google.com/travel/impact-model
 */

const API_BASE = "https://travelimpactmodel.googleapis.com/v1";

export interface FlightLeg {
  origin: string;
  destination: string;
  operatingCarrierCode: string;
  flightNumber: number;
  departureDate: { year: number; month: number; day: number };
}

interface EmissionsGramsPerPax {
  first?: number;
  business?: number;
  premiumEconomy?: number;
  economy?: number;
}

interface FlightWithEmissions {
  flight?: FlightLeg;
  emissionsGramsPerPax?: EmissionsGramsPerPax;
}

interface ComputeResponse {
  flightEmissions?: FlightWithEmissions[];
}

/**
 * Get CO₂e (kg) per passenger for given flight legs. Uses economy class.
 * Returns array in same order as input; missing emissions are 0.
 */
export async function computeFlightEmissions(
  apiKey: string,
  legs: FlightLeg[]
): Promise<number[]> {
  if (!apiKey.trim() || legs.length === 0) return legs.map(() => 0);

  const body = {
    flights: legs.map((f) => ({
      origin: f.origin.slice(0, 3).toUpperCase(),
      destination: f.destination.slice(0, 3).toUpperCase(),
      operatingCarrierCode: f.operatingCarrierCode.slice(0, 2).toUpperCase(),
      flightNumber: Number(f.flightNumber) || 0,
      departureDate: f.departureDate,
    })),
  };

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/flights:computeFlightEmissions?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return legs.map(() => 0);
  }

  if (!res.ok) return legs.map(() => 0);
  let data: ComputeResponse;
  try {
    data = (await res.json()) as ComputeResponse;
  } catch {
    return legs.map(() => 0);
  }

  const list = data.flightEmissions ?? [];
  return list.map((item) => {
    const grams = item.emissionsGramsPerPax?.economy ?? item.emissionsGramsPerPax?.premiumEconomy ?? 0;
    return Math.round((grams / 1000) * 1000) / 1000;
  });
}
