import type { Activity, Hotel, TransportSegment, UserPreferences } from "@/types";
import { ATTRACTION_TYPES } from "@/types";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { createAmadeusClient } from "./amadeus";
import { CITY_TO_IATA, getAirportCoords } from "./airport-coords";

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
] as const;

/** Models that support Google Search + thinking; try preview first. */
const GEMINI_SEARCH_MODELS = [
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
] as const;

async function generateWithModelFallback(
  genAI: GoogleGenAI,
  input: {
    contents: Array<{ role: "user"; parts: Array<{ text: string }> }>;
    config?: { systemInstruction?: { parts: Array<{ text: string }> } };
  }
): Promise<string> {
  for (const model of GEMINI_MODELS) {
    try {
      const result = await genAI.models.generateContent({
        model,
        contents: input.contents,
        config: input.config,
      });
      type Candidate = { content?: { parts?: Array<{ text?: string }> } };
      const raw =
        (result as { candidates?: Candidate[] }).candidates?.[0]?.content?.parts?.[0]
          ?.text ?? "";
      if (raw.trim()) return raw;
    } catch {
      // Try next model and gracefully fall back if none are available.
    }
  }
  return "";
}

const SYSTEM_PROMPT = `You are a travel preference parser. Output ONLY valid JSON matching this schema (no markdown, no code fences):
{
  "interests": string[],
  "budget_level": "budget" | "mid" | "luxury",
  "carbon_sensitivity": "low" | "medium" | "high",
  "avoid_flying": boolean,
  "party_size": number
}
Infer from the user's message. interests: e.g. ["culture", "food", "nature", "adventure", "museum", "outdoor", "restaurant", "nightlife", "wellness", "beach", "ski"]. party_size defaults to 1. avoid_flying: true if they say they hate flying or prefer trains. carbon_sensitivity: high if they care about carbon/low emissions.`;

export async function parsePreferencesWithGemini(
  apiKey: string,
  text: string
): Promise<UserPreferences> {
  const genAI = new GoogleGenAI({ apiKey });
  const raw = await generateWithModelFallback(genAI, {
    contents: [{ role: "user", parts: [{ text }] }],
    config: {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    },
  });
  if (!raw?.trim()) {
    return fallbackParsePreferences(text);
  }
  const cleaned = raw.replace(/```json?\s*/gi, "").replace(/```\s*/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      interests: Array.isArray(parsed.interests) ? parsed.interests : [],
      budget_level:
        parsed.budget_level === "budget" ||
        parsed.budget_level === "mid" ||
        parsed.budget_level === "luxury"
          ? parsed.budget_level
          : "mid",
      carbon_sensitivity:
        parsed.carbon_sensitivity === "low" ||
        parsed.carbon_sensitivity === "medium" ||
        parsed.carbon_sensitivity === "high"
          ? parsed.carbon_sensitivity
          : "medium",
      avoid_flying: Boolean(parsed.avoid_flying),
      party_size:
        typeof parsed.party_size === "number" && parsed.party_size >= 1
          ? Math.min(9, Math.floor(parsed.party_size))
          : 1,
      raw_text: text,
    };
  } catch {
    return fallbackParsePreferences(text);
  }
}

const ATTRACTION_TYPES_SET = new Set<string>(ATTRACTION_TYPES);

/**
 * Classify each activity into one of ATTRACTION_TYPES (museum, culture, outdoor, nature, food, nightlife, wellness, beach, ski)
 * based on name (and optional category hint). Used so tabs and ML model get correct categories instead of everything "culture".
 * Returns one category per activity in the same order; invalid/missing responses default to "culture".
 */
export async function categorizeActivitiesWithGemini(
  apiKey: string,
  activities: Array<{ name: string; category?: string }>
): Promise<string[]> {
  if (activities.length === 0) return [];
  const list = activities
    .map((a, i) => `${i + 1}. ${a.name}${a.category ? ` (current: ${a.category})` : ""}`)
    .join("\n");
  const allowed = ATTRACTION_TYPES.join(", ");
  const prompt = `You are a travel activity classifier. Classify each attraction into exactly ONE of these types: ${allowed}.

Attractions (one per line, same order):
${list}

Respond with ONLY a JSON array of strings, one type per attraction in the same order. No explanation. Example: ["museum","culture","outdoor"]`;

  const genAI = new GoogleGenAI({ apiKey });
  const raw = await generateWithModelFallback(genAI, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  const cleaned = raw.replace(/```json?\s*/gi, "").replace(/```\s*/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (!Array.isArray(parsed)) return activities.map(() => "culture");
    return activities.map((_, i) => {
      const v = parsed[i];
      const s = typeof v === "string" ? v.trim().toLowerCase() : "";
      return ATTRACTION_TYPES_SET.has(s) ? s : "culture";
    });
  } catch {
    return activities.map(() => "culture");
  }
}
export async function suggestHotelByProximity(
  apiKey: string,
  city: string,
  selectedAttractions: Array<{ id: string; name: string; location: { lat: number; lng: number; name: string } }>,
  hotels: Array<{ id: string; name: string }>
): Promise<{ hotelId: string; reason: string }> {
  if (hotels.length === 0) {
    return { hotelId: "", reason: "No hotels available." };
  }
  if (hotels.length === 1) {
    return { hotelId: hotels[0]!.id, reason: "Only one hotel available." };
  }
  const genAI = new GoogleGenAI({ apiKey });
  const attractionList = selectedAttractions
    .map((a) => `${a.name} (${a.location.name ?? city})`)
    .join(", ");
  const hotelList = hotels.map((h) => `${h.id}: ${h.name}`).join("\n");
  const prompt = `The traveler is visiting "${city}" and has selected these attractions they want to visit: ${attractionList}.

Here are the available hotels (id and name):
${hotelList}

Which hotel is best for proximity to these attractions (most central / convenient base)? Reply with ONLY valid JSON, no markdown:
{ "hotelId": "<exact id from the list>", "reason": "<one short sentence>" }`;

  const raw = await generateWithModelFallback(genAI, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  if (!raw?.trim()) {
    return { hotelId: hotels[0]!.id, reason: "Central option for your stay." };
  }
  const cleaned = raw.replace(/```json?\s*/gi, "").replace(/```\s*/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as { hotelId?: string; reason?: string };
    const id = String(parsed.hotelId ?? "").trim();
    const found = hotels.some((h) => h.id === id);
    return {
      hotelId: found ? id : hotels[0]!.id,
      reason: String(parsed.reason ?? "Central location for your selected attractions.").slice(0, 200),
    };
  } catch {
    return { hotelId: hotels[0]!.id, reason: "Central option for your stay." };
  }
}

/**
 * Find real hotels using the Amadeus API.
 */
export async function findRealHotels(
  apiKey: string,
  city: string,
  checkIn?: string,
  checkOut?: string,
  adults = 1
): Promise<Array<{ id: string; name: string; description: string; price_per_night_usd: number; stars: number; location: { lat: number; lng: number; name: string } }>> {
    void apiKey;
    const amadeus = createAmadeusClient();

    try {
        const cityCode =
          /^[A-Za-z]{3}$/.test(city)
            ? city.toUpperCase()
            : (await amadeus.referenceData.locations.cities.get({ keyword: city })).data[0]?.iataCode;

        if (!cityCode) {
            console.error("Could not find city code for", city);
            return [];
        }

        const hotelsResponse = await amadeus.referenceData.locations.hotels.byCity.get({ cityCode });
        const baseHotels = Array.isArray(hotelsResponse.data) ? hotelsResponse.data : [];
        const hotelIds = baseHotels
          .map((hotel: any) => hotel.hotelId ?? hotel.id)
          .filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
          .slice(0, 12);
        if (hotelIds.length === 0) return [];

        const nights =
          checkIn && checkOut
            ? Math.max(
                1,
                Math.ceil(
                  (new Date(checkOut).getTime() - new Date(checkIn).getTime()) /
                    (24 * 60 * 60 * 1000)
                )
              )
            : 1;

        const offerParams: Record<string, string> = {
          hotelIds: hotelIds.join(","),
          adults: String(Math.max(1, adults)),
        };
        if (checkIn) offerParams.checkInDate = checkIn;
        if (checkOut) offerParams.checkOutDate = checkOut;

        const offersResponse = await amadeus.shopping.hotelOffersSearch.get(offerParams as any);
        const offers = Array.isArray(offersResponse.data) ? offersResponse.data : [];

        const directoryHotels = baseHotels.slice(0, 20).map((hotel: any, i: number) => {
          const name = String(hotel?.name ?? "Hotel");
          const lat = Number(hotel?.geoCode?.latitude ?? 0);
          const lng = Number(hotel?.geoCode?.longitude ?? 0);
          const starsRaw = Number(hotel?.rating);
          const stars =
            Number.isFinite(starsRaw) && starsRaw > 0
              ? Math.max(1, Math.min(5, Math.round(starsRaw)))
              : 4;
          return {
            id: String(hotel?.hotelId ?? hotel?.id ?? `hotel-dir-${i}`),
            name,
            description: "Amadeus hotel directory listing (price unavailable)",
            price_per_night_usd: 0,
            stars,
            location: {
              lat: Number.isFinite(lat) ? lat : 0,
              lng: Number.isFinite(lng) ? lng : 0,
              name,
            },
          };
        });

        const offerHotels = offers.map((offer: any, i: number) => {
          const total = parseFloat(offer?.offers?.[0]?.price?.total ?? "0");
          const starsRaw = Number(offer?.hotel?.rating);
          const stars =
            Number.isFinite(starsRaw) && starsRaw > 0
              ? Math.max(1, Math.min(5, Math.round(starsRaw)))
              : 4;
          const lat = Number(offer?.hotel?.latitude ?? offer?.hotel?.geoCode?.latitude ?? 0);
          const lng = Number(offer?.hotel?.longitude ?? offer?.hotel?.geoCode?.longitude ?? 0);
          const name = String(offer?.hotel?.name ?? "Hotel");
          return {
            id: String(offer?.hotel?.hotelId ?? offer?.hotel?.id ?? `hotel-${i}`),
            name,
            description: "Real-time hotel offer from Amadeus",
            price_per_night_usd: total > 0 ? total / nights : 0,
            stars,
            location: {
              lat: Number.isFinite(lat) ? lat : 0,
              lng: Number.isFinite(lng) ? lng : 0,
              name,
            },
          };
        });

        // Prefer priced offers, then fill with real directory hotels so UI has multiple options.
        if (offerHotels.length > 0) {
          const seen = new Set<string>(offerHotels.map((h: { id: string }) => h.id));
          const merged = [
            ...offerHotels,
            ...directoryHotels.filter((h: { id: string }) => !seen.has(h.id)),
          ];
          return merged.slice(0, 10);
        }

        // If priced offers are unavailable, still return real hotels from Amadeus by-city directory.
        return directoryHotels.slice(0, 10);
    } catch (e) {
        console.error("Failed to find real hotels with Amadeus:", e);
        return [];
    }
}

/**
 * Find real flight options using the Amadeus API.
 */
export async function findRealFlights(
  apiKey: string,
  origin: string,
  destination: string,
  date: string,
  adults = 1
): Promise<Array<{ id: string; airline: string; flight_number: string; departure_time: string; arrival_time: string; origin_iata: string; destination_iata: string; price_usd: number; duration_minutes: number }>> {
    void apiKey;
    const amadeus = createAmadeusClient();

    try {
        const toDate = (value: string) => new Date(`${value}T00:00:00Z`);
        const formatDate = (d: Date) => d.toISOString().slice(0, 10);
        const shiftDate = (value: string, offsetDays: number) => {
          const d = toDate(value);
          d.setUTCDate(d.getUTCDate() + offsetDays);
          return formatDate(d);
        };

        const resolveCode = async (value: string) => {
          if (/^[A-Za-z]{3}$/.test(value)) return value.toUpperCase();
          const normalized = value.trim().toLowerCase();
          const mapped = CITY_TO_IATA[normalized];
          if (mapped) return mapped;

          const locationResponse = await amadeus.referenceData.locations.get({
            keyword: value,
            subType: "CITY,AIRPORT",
          });
          const locationCode = locationResponse.data[0]?.iataCode as string | undefined;
          if (locationCode) return locationCode;

          const airportResponse = await amadeus.referenceData.locations.get({
            keyword: value,
            subType: "AIRPORT",
          });
          const airportCode = airportResponse.data[0]?.iataCode as string | undefined;
          if (airportCode) return airportCode;

          try {
            const cityResponse = await amadeus.referenceData.locations.cities.get({
              keyword: value,
              include: "AIRPORTS",
            });
            return cityResponse.data[0]?.iataCode as string | undefined;
          } catch {
            const cityResponse = await amadeus.referenceData.locations.cities.get({
              keyword: value,
            });
            return cityResponse.data[0]?.iataCode as string | undefined;
          }
        };

        const [originCode, destinationCode] = await Promise.all([
          resolveCode(origin),
          resolveCode(destination),
        ]);

        if (!originCode || !destinationCode) {
            console.error("Could not find airport codes for the given locations");
            return [];
        }

        const candidateDates = [date, shiftDate(date, 1), shiftDate(date, -1)];
        let offersData: any[] = [];
        for (const candidateDate of candidateDates) {
          const flightOffersResponse = await amadeus.shopping.flightOffersSearch.get({
            originLocationCode: originCode,
            destinationLocationCode: destinationCode,
            departureDate: candidateDate,
            adults: String(Math.max(1, adults)),
            currencyCode: "USD",
          });
          offersData = Array.isArray(flightOffersResponse.data) ? flightOffersResponse.data : [];
          if (offersData.length > 0) break;
        }
        if (offersData.length === 0) return [];

        const parseDurationToMinutes = (isoDuration: string | undefined): number => {
          const match = isoDuration?.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
          if (!match) return 0;
          const hours = parseInt(match[1] ?? "0", 10);
          const minutes = parseInt(match[2] ?? "0", 10);
          return hours * 60 + minutes;
        };

        return offersData.map((offer: any) => ({
            id: String(offer.id ?? crypto.randomUUID()),
            airline: String(offer.validatingAirlineCodes?.[0] ?? offer.itineraries?.[0]?.segments?.[0]?.carrierCode ?? "Unknown"),
            flight_number: String(
              offer.itineraries?.[0]?.segments?.[0]?.number
                ? `${offer.itineraries?.[0]?.segments?.[0]?.carrierCode ?? ""}${offer.itineraries?.[0]?.segments?.[0]?.number}`
                : "N/A"
            ),
            departure_time: String(offer.itineraries?.[0]?.segments?.[0]?.departure?.at ?? ""),
            arrival_time: String(
              offer.itineraries?.[0]?.segments?.[offer.itineraries?.[0]?.segments?.length - 1]?.arrival?.at ?? ""
            ),
            origin_iata: String(offer.itineraries?.[0]?.segments?.[0]?.departure?.iataCode ?? originCode),
            destination_iata: String(
              offer.itineraries?.[0]?.segments?.[offer.itineraries?.[0]?.segments?.length - 1]?.arrival?.iataCode ?? destinationCode
            ),
            price_usd: parseFloat(String(offer.price?.total ?? "0")) || 0,
            duration_minutes: parseDurationToMinutes(offer.itineraries?.[0]?.duration) || 120,
        }));
    } catch (e) {
        console.error("Failed to find real flights with Amadeus:", e);
        return [];
    }
}

/** Params for full travel search (hotels, activities, flights). */
export interface TravelSearchParams {
  city: string;
  startDate: string;
  endDate: string;
  interests?: string[];
  budgetLevel?: string;
  originIata: string;
  destinationIata: string;
}

function flightOfferToSegment(
  offer: {
    id: string;
    origin_iata: string;
    destination_iata: string;
    price_usd: number;
    duration_minutes: number;
  },
  mode: "flight_short" | "flight_long"
): TransportSegment {
  const orig = getAirportCoords(offer.origin_iata);
  const dest = getAirportCoords(offer.destination_iata);
  return {
    id: offer.id,
    mode,
    origin: {
      lat: orig?.[0] ?? 0,
      lng: orig?.[1] ?? 0,
      name: offer.origin_iata,
    },
    destination: {
      lat: dest?.[0] ?? 0,
      lng: dest?.[1] ?? 0,
      name: offer.destination_iata,
    },
    price_usd: offer.price_usd,
    duration_minutes: offer.duration_minutes,
  };
}

/**
 * Full travel search: hotels, arrival/departure flights. Activities left empty (caller can add later).
 */
async function searchTravelWithGemini(
  params: TravelSearchParams
): Promise<{
  hotels: Hotel[];
  activities: Activity[];
  arrivalFlights: TransportSegment[];
  departureFlights: TransportSegment[];
} | null> {
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) return null;

  const { city, startDate, endDate, originIata, destinationIata } = params;

  try {
    const [hotels, arrivalOffers, departureOffers] = await Promise.all([
      findRealHotels(apiKey, city, startDate, endDate),
      findRealFlights(apiKey, originIata, destinationIata, startDate),
      findRealFlights(apiKey, destinationIata, originIata, endDate),
    ]);

    const toHotel = (h: {
      id: string;
      name: string;
      location: { lat: number; lng: number; name: string };
      price_per_night_usd: number;
      stars: number;
    }): Hotel => ({
      id: h.id,
      name: h.name,
      location: h.location,
      price_per_night_usd: h.price_per_night_usd,
      stars: h.stars,
    });

    const arrivalFlights = arrivalOffers.map((o) =>
      flightOfferToSegment(
        {
          id: o.id,
          origin_iata: o.origin_iata,
          destination_iata: o.destination_iata,
          price_usd: o.price_usd,
          duration_minutes: o.duration_minutes,
        },
        o.duration_minutes >= 180 ? "flight_long" : "flight_short"
      )
    );
    const departureFlights = departureOffers.map((o) =>
      flightOfferToSegment(
        {
          id: o.id,
          origin_iata: o.origin_iata,
          destination_iata: o.destination_iata,
          price_usd: o.price_usd,
          duration_minutes: o.duration_minutes,
        },
        o.duration_minutes >= 180 ? "flight_long" : "flight_short"
      )
    );

    return {
      hotels: hotels.map(toHotel),
      activities: [],
      arrivalFlights,
      departureFlights,
    };
  } catch (e) {
    console.error("[searchTravelWithGemini]", e);
    return null;
  }
}

export type QuickSearchResult =
  | { ok: true; text: string }
  | { ok: false; error: string; rateLimit?: boolean; retryAfterSeconds?: number };

/**
 * Quick AI search (Ask an AI Travel Agent): free-form query with Google Search grounding.
 * Returns result with text, or error info (e.g. rate limit with retryAfterSeconds).
 */
export async function quickSearchWithGemini(query: string): Promise<QuickSearchResult> {
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) return { ok: false, error: "GEMINI_API_KEY not set" };

  const genAI = new GoogleGenAI({ apiKey });

  const config = {
    thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
    tools: [{ googleSearch: {} }],
  };
  const contents = [{ role: "user" as const, parts: [{ text: query }] }];

  let lastError: unknown;
  for (const model of GEMINI_SEARCH_MODELS) {
    try {
      const stream = await genAI.models.generateContentStream({
        model,
        config,
        contents,
      });
      let fullText = "";
      for await (const chunk of stream) {
        const t = (chunk as { text?: string }).text ?? "";
        if (t) fullText += t;
      }
      const text = fullText.trim();
      if (text) return { ok: true, text };
    } catch (err) {
      lastError = err;
    }
  }

  console.error("[quickSearchWithGemini]", lastError);
  const errObj = (lastError ?? {}) as { status?: number; code?: number; message?: string };
  const status = errObj?.status ?? errObj?.code;
  const msg = typeof errObj?.message === "string" ? errObj.message : "";
  if (status === 429 || /quota|rate limit|429|RESOURCE_EXHAUSTED/i.test(msg)) {
    const retryMatch = msg.match(/retry in (\d+(?:\.\d+)?)\s*s/i) ?? msg.match(/"retryDelay":\s*"(\d+)s"/);
    const retrySec = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : 60;
    return {
      ok: false,
      error: "Gemini rate limit reached (free tier: 20 requests/day). Try again later.",
      rateLimit: true,
      retryAfterSeconds: retrySec,
    };
  }
  return { ok: false, error: "Request failed" };
}

/** Simple keyword-based fallback when Gemini is not configured. */
export function fallbackParsePreferences(text: string): UserPreferences {
  const t = text.toLowerCase();
  const interests: string[] = [];
  if (/\b(food|eat|local cuisine|restaurant)\b/.test(t)) interests.push("food", "restaurant");
  if (/\b(museum|art|history|culture)\b/.test(t)) interests.push("culture", "museum");
  if (/\b(nature|hiking|outdoor|park)\b/.test(t)) interests.push("nature", "outdoor");
  if (/\b(beach|sea|sun)\b/.test(t)) interests.push("beach");
  if (/\b(nightlife|bar|club)\b/.test(t)) interests.push("nightlife");
  if (/\b(wellness|spa|relax)\b/.test(t)) interests.push("wellness");
  if (/\b(ski|snow)\b/.test(t)) interests.push("ski");
  if (interests.length === 0) interests.push("culture", "outdoor");

  let budget_level: "budget" | "mid" | "luxury" = "mid";
  if (/\b(budget|cheap|low cost)\b/.test(t)) budget_level = "budget";
  if (/\b(luxury|fancy|high end|5 star)\b/.test(t)) budget_level = "luxury";

  let carbon_sensitivity: "low" | "medium" | "high" = "medium";
  if (/\b(carbon|emission|green|sustainable|eco)\b/.test(t)) carbon_sensitivity = "high";

  const avoid_flying = /\b(hate flying|avoid flying|train|no fly)\b/.test(t);

  const partyMatch = t.match(/\b(\d+)\s*(people|adults|travelers)?\b/);
  const party_size = partyMatch ? Math.min(9, Math.max(1, parseInt(partyMatch[1], 10))) : 1;

  return {
    interests: [...new Set(interests)],
    budget_level,
    carbon_sensitivity,
    avoid_flying,
    party_size,
    raw_text: text,
  };
}

export { searchTravelWithGemini };

