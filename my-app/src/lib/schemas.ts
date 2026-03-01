import { z } from "zod";

const geoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  name: z.string().max(200),
});

export const ParsePrefsSchema = z.object({
  text: z.string().min(1).max(2000).trim(),
  userId: z.string().uuid().optional(),
});

export const CarbonRequestSchema = z.object({
  itinerary: z.object({
    id: z.string().min(1).max(100),
    city: z.string().min(1).max(100),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    days: z
      .array(
        z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          activities: z
            .array(
              z.object({
                id: z.string(),
                name: z.string().max(200),
                category: z.string().max(50),
                location: geoPointSchema,
                price_usd: z.number().nonnegative(),
                duration_hours: z.number().positive().max(24),
              })
            )
            .max(20),
          transport: z
            .array(
              z.object({
                id: z.string(),
                mode: z.enum([
                  "flight_short",
                  "flight_long",
                  "train",
                  "bus",
                  "car",
                  "ferry",
                  "walk",
                ]),
                origin: geoPointSchema,
                destination: geoPointSchema,
                price_usd: z.number().nonnegative(),
                duration_minutes: z.number().positive().max(10080),
              })
            )
            .max(10),
          hotel: z.object({
            id: z.string(),
            name: z.string().max(200),
            location: geoPointSchema,
            price_per_night_usd: z.number().nonnegative(),
            stars: z.number().int().min(1).max(5),
          }),
        })
      )
      .max(14),
  }),
});

export const ActivitiesQuerySchema = z.object({
  city: z.string().min(1).max(100).trim(),
  interests: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(80).default(50),
});

export const HotelsQuerySchema = z.object({
  city: z.string().min(1).max(100).trim(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** POST /api/travel/search body: city, dates, interests, budget, origin/destination IATA. */
export const TravelSearchSchema = z.object({
  city: z.string().min(1).max(100).trim(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  interests: z.array(z.string().max(100)).max(20).optional(),
  budgetLevel: z.string().max(50).optional(),
  originIata: z.string().min(1).max(10).trim(),
  destinationIata: z.string().min(1).max(10).trim(),
});

export const FlightsQuerySchema = z.object({
  origin: z.string().min(1).max(100).trim(),
  destination: z.string().min(1).max(100).trim(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(1).max(9).default(1),
});

export const SupermemorySaveSchema = z.object({
  userId: z.string().min(1).max(200),
  type: z.enum(["preferences", "trip"]),
  data: z.record(z.string(), z.unknown()),
});

export const SupermemoryRetrieveQuerySchema = z.object({
  userId: z.string().min(1).max(200),
  type: z.enum(["preferences", "trip"]),
});

// Regret prediction (preference_engine / regret_protection_engine) — matches Python schemas
const travelVibeSchema = z.enum(["Chill", "Adventure", "Family", "Romantic", "Nightlife"]);

export const RegretUserPreferencesSchema = z.object({
  pace: z.number().min(0).max(1).default(0.5),
  crowd_comfort: z.number().min(0).max(1).default(0.5),
  morning_tolerance: z.number().min(0).max(1).default(0.5),
  late_night_tolerance: z.number().min(0).max(1).default(0.5),
  walking_effort: z.number().min(0).max(1).default(0.5),
  budget_comfort: z.number().min(0).max(1).default(0.5),
  planning_vs_spontaneity: z.number().min(0).max(1).default(0.5),
  noise_sensitivity: z.number().min(0).max(1).default(0.5),
  dislike_heat: z.boolean().default(false),
  dislike_cold: z.boolean().default(false),
  dislike_rain: z.boolean().default(false),
  travel_vibe: travelVibeSchema.default("Chill"),
  additional_notes: z.string().max(2000).optional(),
});

export const RegretItineraryItemSchema = z.object({
  start_hour: z.number().min(0).max(24).default(12),
  end_hour: z.number().min(0).max(24).optional(),
  duration_hours: z.number().min(0).max(24).optional(),
  walking_km: z.number().min(0).max(50).default(0),
  walking_km_cumulative_day: z.number().min(0).max(50).optional(),
  crowd_level: z.number().min(0).max(1).default(0.5),
  outdoor_fraction: z.number().min(0).max(1).default(0.5),
  activity_count_today: z.number().int().min(0).max(20).default(1),
  cost_level: z.number().min(0).max(1).default(0.5),
  day_number: z.number().int().min(1).max(30).default(1),
  is_late_night: z.boolean().default(false),
  is_must_see: z.boolean().default(false),
  bad_weather_today: z.boolean().optional(),
});

export const RegretContextSchema = z.object({
  previous_day_walking_km: z.number().min(0).max(50).optional(),
  previous_day_end_hour: z.number().min(0).max(24).optional(),
  sleep_window_start_hour: z.number().min(0).max(24).optional(),
  sleep_window_end_hour: z.number().min(0).max(24).optional(),
  recent_pace_score: z.number().min(0).max(1).optional(),
});

export const RegretRequestSchema = z.object({
  user_preferences: RegretUserPreferencesSchema,
  itinerary_item: RegretItineraryItemSchema,
  context: RegretContextSchema.optional(),
});

const activitySchema = z
  .object({
    id: z.string(),
    name: z.string().max(200),
    category: z.string().max(50),
    location: geoPointSchema,
    price_usd: z.number().nonnegative(),
    duration_hours: z.number().positive().max(24),
  })
  .passthrough();

const hotelSchema = z
  .object({
    id: z.string(),
    name: z.string().max(200),
    location: geoPointSchema,
    price_per_night_usd: z.number().nonnegative(),
    stars: z.number().int().min(1).max(5),
  })
  .passthrough();

export const ScheduleActivitiesSchema = z.object({
  activities: z.array(activitySchema).max(50),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hotel: hotelSchema,
});

/** Request body: suggest hotel by proximity to selected attractions (attractions first, then hotel). */
export const HotelByProximitySchema = z.object({
  city: z.string().min(1).max(100).trim(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  selectedAttractions: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().max(200),
        category: z.string().max(50).optional(),
        location: geoPointSchema,
      })
    )
    .min(1)
    .max(50),
});
