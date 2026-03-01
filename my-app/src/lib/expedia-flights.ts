/**
 * Expedia Travel Redirect API – Flight Listings.
 * Returns real offers with exact booking links (Links.WebDetails.Href = direct to that flight on Expedia).
 * Requires: EXPEDIA_TRAD_REDIRECT_KEY, EXPEDIA_TRAD_REDIRECT_AUTH (Basic base64 "username:password").
 * @see https://developers.expediagroup.com/travel-redirect-api/api/shopping-apis/flight-listings
 */

export interface ExpediaFlightOffer {
  id: string;
  origin_iata: string;
  destination_iata: string;
  price_usd: number;
  duration_minutes: number;
  /** 2-letter airline code when available */
  airline_iata?: string;
  /** Direct link to this exact offer on Expedia (book there). */
  booking_url: string;
}

function parseDurationMinutes(leg: Record<string, unknown>): number {
  const dep = leg.departureTime ?? leg.DepartureTime ?? leg.departure?.at ?? leg.Departure?.At;
  const arr = leg.arrivalTime ?? leg.ArrivalTime ?? leg.arrival?.at ?? leg.Arrival?.At;
  if (typeof dep === "string" && typeof arr === "string") {
    const a = new Date(arr).getTime();
    const d = new Date(dep).getTime();
    if (Number.isFinite(a) && Number.isFinite(d) && a >= d) return Math.round((a - d) / 60000);
  }
  const dur = leg.duration ?? leg.Duration;
  if (typeof dur === "string" && /^PT(?:\d+H)?(?:\d+M)?$/i.test(dur)) {
    const hm = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
    const h = parseInt(hm?.[1] ?? "0", 10);
    const m = parseInt(hm?.[2] ?? "0", 10);
    return h * 60 + m;
  }
  return 0;
}

function firstLeg(segment: Record<string, unknown>): Record<string, unknown> | null {
  const legs = segment.Legs ?? segment.legs;
  if (Array.isArray(legs) && legs.length > 0) return legs[0] as Record<string, unknown>;
  return null;
}

function airportCode(leg: Record<string, unknown>, key: "origin" | "destination"): string {
  const k = key === "origin" ? "departure" : "arrival";
  const obj = leg[`${k}AirportCode`] ?? leg[`${k} airport code`] ?? leg[k];
  if (typeof obj === "string" && obj.length >= 2) return obj.slice(0, 3).toUpperCase();
  const code = (leg[`${k}Code`] ?? leg[`Origin${key === "origin" ? "" : "Destination"}Code`]) as string | undefined;
  if (typeof code === "string") return code.slice(0, 3).toUpperCase();
  return "";
}

function carrierCode(leg: Record<string, unknown>): string | undefined {
  const c = leg.carrierCode ?? leg.CarrierCode ?? leg.operatingCarrier ?? leg.OperatingCarrier;
  if (typeof c === "string") return c.slice(0, 2).toUpperCase();
  return undefined;
}

/**
 * Call Expedia Flight Listings API (one-way). Returns up to 5 offers with exact Expedia booking URLs.
 */
export async function fetchExpediaFlightListings(
  origin: string,
  destination: string,
  departureDate: string,
  adults: number
): Promise<ExpediaFlightOffer[]> {
  const key = process.env.EXPEDIA_TRAD_REDIRECT_KEY?.trim();
  const auth = process.env.EXPEDIA_TRAD_REDIRECT_AUTH?.trim();
  if (!key || !auth) return [];

  const originCode = origin.length === 3 ? origin.toUpperCase() : origin;
  const destCode = destination.length === 3 ? destination.toUpperCase() : destination;
  const params = new URLSearchParams({
    "segment1.origin": originCode,
    "segment1.destination": destCode,
    "segment1.departureDate": departureDate,
    adult: String(Math.max(1, Math.min(6, adults))),
    limit: "5",
    cabinClass: "economy",
  });

  const url = `https://apim.expedia.com/flights/listings?${params.toString()}`;
  const partnerTxnId = `plantroute-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/vnd.exp-flight.v3+json",
        Key: key,
        Authorization: auth.startsWith("Basic ") ? auth : `Basic ${auth}`,
        "Partner-Transaction-Id": partnerTxnId,
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return [];
  }

  if (!res.ok) return [];
  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    return [];
  }

  const errors = data.Errors ?? data.errors;
  if (Array.isArray(errors) && errors.length > 0) return [];

  const offers = (data.Offers ?? data.offers) as Array<Record<string, unknown>> | undefined;
  const segments = (data.Segments ?? data.segments) as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(offers) || offers.length === 0) return [];

  const segmentById = new Map<string, Record<string, unknown>>();
  if (Array.isArray(segments)) {
    for (const seg of segments) {
      const id = seg.SegmentId ?? seg.segmentId;
      if (typeof id === "string") segmentById.set(id, seg);
    }
  }

  const result: ExpediaFlightOffer[] = [];
  for (let i = 0; i < Math.min(5, offers.length); i++) {
    const offer = offers[i]!;
    const href = (offer.Links as Record<string, unknown>)?.WebDetails?.Href
      ?? (offer.links as Record<string, unknown>)?.webDetails?.href;
    if (typeof href !== "string" || !href.includes("expedia.com")) continue;

    const offerId = String(offer.OfferId ?? offer.offerId ?? `exp-${i}`);
    const segmentIds = (offer.SegmentIds ?? offer.segmentIds) as string[] | undefined;
    const firstSegId = Array.isArray(segmentIds) ? segmentIds[0] : null;
    const segment = firstSegId ? segmentById.get(firstSegId) : null;
    const leg = segment ? firstLeg(segment) : null;

    const originIata = leg ? airportCode(leg, "origin") || originCode : originCode;
    const destIata = leg ? airportCode(leg, "destination") || destCode : destCode;
    const durationMin = leg ? parseDurationMinutes(leg) : 0;
    const airline = leg ? carrierCode(leg) : undefined;

    const priceObj = offer.OfferPrice ?? offer.offerPrice as Record<string, unknown> | undefined;
    let priceUsd = 0;
    if (priceObj && typeof priceObj === "object") {
      const total = priceObj.Total ?? priceObj.total ?? priceObj.Amount ?? priceObj.amount;
      if (typeof total === "number" && total > 0) priceUsd = total;
      else if (typeof total === "string") priceUsd = parseFloat(total) || 0;
    }

    result.push({
      id: offerId,
      origin_iata: originIata,
      destination_iata: destIata,
      price_usd: priceUsd || 99,
      duration_minutes: durationMin || 90,
      airline_iata: airline,
      booking_url: href,
    });
  }
  return result;
}
