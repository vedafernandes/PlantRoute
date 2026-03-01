/**
 * Minimal IATA → (lat, lng) for carbon/distance calculation.
 * Add more as needed.
 */
export const AIRPORT_COORDS: Record<string, [number, number]> = {
  ORD: [41.9742, -87.9073],
  LAX: [33.9416, -118.4085],
  JFK: [40.6413, -73.7781],
  SFO: [37.6213, -122.379],
  LHR: [51.4700, -0.4543],
  CDG: [49.0097, 2.5478],
  FRA: [50.0379, 8.5622],
  AMS: [52.3105, 4.7683],
  MIA: [25.7959, -80.2870],
  DEN: [39.8561, -104.6737],
  ATL: [33.6407, -84.4277],
  CHI: [41.9742, -87.9073],
  PAR: [49.0097, 2.5478],
  ROM: [41.8003, 12.2389],
  FCO: [41.8003, 12.2389],
  BCN: [41.2971, 2.0785],
  MAD: [40.4983, -3.5676],
  LIS: [38.7742, -9.1342],
  NYC: [40.6413, -73.7781],
  LON: [51.4700, -0.4543],
};

/** City name (lowercase) to IATA code for flight search. */
export const CITY_TO_IATA: Record<string, string> = {
  chicago: "ORD",
  "new york": "JFK",
  "los angeles": "LAX",
  "san francisco": "SFO",
  miami: "MIA",
  london: "LHR",
  paris: "CDG",
  rome: "FCO",
  barcelona: "BCN",
  amsterdam: "AMS",
  frankfurt: "FRA",
  lisbon: "LIS",
  madrid: "MAD",
};

export function getCityIata(cityName: string): string {
  const key = cityName.toLowerCase().trim().slice(0, 50);
  return CITY_TO_IATA[key] ?? cityName.slice(0, 3).toUpperCase();
}

export function getAirportCoords(iata: string): [number, number] | null {
  const code = (iata ?? "").toUpperCase().slice(0, 3);
  return AIRPORT_COORDS[code] ?? null;
}
