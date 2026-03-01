/** Map basemap style keys. Used by map and search bar theming. */
export type BasemapKey = "light" | "outdoors" | "streets" | "dark" | "satellite";

export const BASEMAP_OPTIONS: { key: BasemapKey; label: string }[] = [
  { key: "light", label: "Light" },
  { key: "outdoors", label: "Outdoors" },
  { key: "streets", label: "Streets" },
  { key: "dark", label: "Dark" },
  { key: "satellite", label: "Satellite" },
];

export type TransportMode =
  | "flight_short"
  | "flight_long"
  | "train"
  | "bus"
  | "car"
  | "ferry"
  | "walk";

export interface GeoPoint {
  lat: number;
  lng: number;
  name: string;
}

/** Normalized place from Google Places for map + list UI. */
export interface NormalizedPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  rating?: number;
  price_level?: number;
  /** Estimated USD from price_level (0–4); midpoint of range for display. */
  price_estimate_usd?: number;
  /** $ to $$$$$ from price_level. */
  price_tier?: string;
  user_ratings_total?: number;
  vicinity?: string;
  type: "hotel" | "attraction";
  photo_reference?: string;
  /** URL for first photo (maxwidth=800). Use for display; also mapped to Activity.image_url. */
  photo_url?: string;
}

export interface TransportSegment {
  id: string;
  mode: TransportMode;
  origin: GeoPoint;
  destination: GeoPoint;
  distance_km?: number;
  emission_kg?: number;
  price_usd: number;
  duration_minutes: number;
  provider?: string;
  /** For flights: airline logo URL (e.g. Kiwi CDN). */
  provider_logo_url?: string;
  /** For flights: link to Expedia search for this route (book there for accurate price). */
  search_url?: string;
}

export interface Activity {
  id: string;
  name: string;
  category: string;
  location: GeoPoint;
  price_usd: number;
  duration_hours: number;
  emission_kg?: number;
  interest_score?: number;
  amadeus_id?: string;
  image_url?: string;
  /** Price tier for display only, e.g. "$", "$$", "$$$" (no actual amount). */
  price_tier?: string;
}

export interface Hotel {
  id: string;
  name: string;
  location: GeoPoint;
  price_per_night_usd: number;
  stars: number;
  emission_kg_per_night?: number;
  /** Estimated transport CO₂ (kg) for round trips hotel ↔ attractions over the stay; set when attractions are known. */
  estimated_transport_kg?: number;
  amadeus_id?: string;
  image_url?: string;
}

export interface ItineraryDay {
  date: string;
  activities: Activity[];
  transport: TransportSegment[];
  hotel: Hotel;
}

export interface Itinerary {
  id: string;
  city: string;
  start_date: string;
  end_date: string;
  days: ItineraryDay[];
  total_price_usd: number;
  total_emission_kg: number;
  interest_match_score: number;
  regret_score: number;
}

/** List item in localStorage: may include original itinerary for carbon compare. */
export type StoredItinerary = Itinerary & {
  confirmed?: boolean;
  /** Snapshot of the plan before switching to a lower-carbon alternative; used to toggle back. */
  originalItinerary?: Itinerary;
};

export interface CarbonItem {
  id: string;
  type: "transport" | "activity" | "hotel";
  description: string;
  distance_km: number | null;
  emission_kg: number;
}

export interface CarbonResult {
  items: CarbonItem[];
  total_kg: number;
}

/** Slider values 0–1. Stored under Profile → Travel Preferences. */
export interface TravelPreferences {
  trip_pace: number; // 0 = very relaxed, 1 = very packed
  crowd_comfort: number; // 0 = hate crowds, 1 = don't mind
  morning_tolerance: number; // 0 = avoid early mornings, 1 = totally fine
  late_night_tolerance: number; // 0 = prefer early nights, 1 = love late nights
  walking_effort: number; // 0 = minimal walking, 1 = long walks/hikes fine
  budget_level: number; // 0 = budget, 1 = premium
  planning_vs_spontaneity: number; // 0 = mostly free time, 1 = mostly pre-planned
  noise_sensitivity: number; // 0 = very sensitive, 1 = don't mind noise
  /** 0 = don't care about carbon, 1 = strongly prefer low-carbon options */
  eco_preference?: number;
  dislike_heat: boolean;
  dislike_cold: boolean;
  dislike_rain: boolean;
  /** Explicit opt-out for weather dislikes (user tapped "None"). */
  no_weather_dislikes?: boolean;
  /** Multi-select vibe tags (preferred field for UI). */
  travel_vibes?: TravelVibe[];
  /** Legacy single-select compatibility field. */
  travel_vibe?: "Chill" | "Adventure" | "Family" | "Romantic" | "Nightlife";
  additional_notes?: string;
  /** Set when user completes onboarding so we don't show the form again. */
  completed?: boolean;
}

export type TravelVibe = NonNullable<TravelPreferences["travel_vibe"]>;

export const TRAVEL_VIBES: TravelVibe[] = [
  "Chill",
  "Adventure",
  "Family",
  "Romantic",
  "Nightlife",
];

/** Attraction types for multi-select "what kinds of attractions you like". Aligns with activity categories / interest-scorer. */
export const ATTRACTION_TYPES = [
  "museum",
  "culture",
  "outdoor",
  "nature",
  "food",
  "nightlife",
  "wellness",
  "beach",
  "ski",
] as const;
export type AttractionType = (typeof ATTRACTION_TYPES)[number];

export const DEFAULT_TRAVEL_PREFERENCES: TravelPreferences = {
  trip_pace: 0.5,
  crowd_comfort: 0.5,
  morning_tolerance: 0.5,
  late_night_tolerance: 0.5,
  walking_effort: 0.5,
  budget_level: 0.5,
  planning_vs_spontaneity: 0.5,
  noise_sensitivity: 0.5,
  eco_preference: 0.5,
  dislike_heat: false,
  dislike_cold: false,
  dislike_rain: false,
  no_weather_dislikes: false,
  travel_vibes: [],
  travel_vibe: undefined,
  additional_notes: "",
};

export interface UserPreferences {
  interests: string[];
  budget_level: "budget" | "mid" | "luxury";
  carbon_sensitivity: "low" | "medium" | "high";
  avoid_flying: boolean;
  party_size: number;
  raw_text?: string;
  travel?: TravelPreferences;
}

export interface UserProfile {
  id: string;
  preferences: UserPreferences;
  trip_count: number;
  past_trips: string[];
}
