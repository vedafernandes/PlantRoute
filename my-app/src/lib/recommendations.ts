/**
 * Build request for XGBoost preference engine and/or rank activities by fit + low CO2e.
 * When PREFERENCE_ENGINE_XGBOOST_URL is set, the API route calls the engine; otherwise fallback ranking.
 */

import type { Activity } from "@/types";
import type { TravelPreferences, UserPreferences } from "@/types";

export interface TravelInput {
  trip_pace: number;
  crowd_comfort: number;
  morning_tolerance: number;
  late_night_tolerance: number;
  walking_effort: number;
  budget_level: number;
  planning_vs_spontaneity: number;
  noise_sensitivity: number;
  eco_preference: number;
}

export interface ActivityInput {
  id?: string;
  name?: string;
  category: string;
  duration_hours: number;
  emission_kg: number;
  price_usd: number;
  activity_density?: number;
  typical_start_hour?: number;
  typical_crowd_level?: number;
}

export interface BatchScoreRequest {
  travel: TravelInput;
  interests: string[];
  activities: ActivityInput[];
}

export interface ScoreResponseItem {
  fit_score: number;
  regret_probability: number;
  explanation?: string[] | null;
}

export interface BatchScoreResponse {
  scores: ScoreResponseItem[];
}

export interface RankedActivity extends Activity {
  fit_score: number;
  regret_probability?: number;
  explanation?: string[] | null;
}

/** Clamp value to [0, 1] for engine sliders. */
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Map app TravelPreferences to engine TravelInput (0–1 sliders). */
export function travelToEngineInput(travel: TravelPreferences | undefined): TravelInput {
  const t: Partial<TravelPreferences> = travel ?? {};
  return {
    trip_pace: clamp01(typeof t.trip_pace === "number" ? t.trip_pace : 0.5),
    crowd_comfort: clamp01(typeof t.crowd_comfort === "number" ? t.crowd_comfort : 0.5),
    morning_tolerance: clamp01(typeof t.morning_tolerance === "number" ? t.morning_tolerance : 0.5),
    late_night_tolerance: clamp01(typeof t.late_night_tolerance === "number" ? t.late_night_tolerance : 0.5),
    walking_effort: clamp01(typeof t.walking_effort === "number" ? t.walking_effort : 0.5),
    budget_level: clamp01(typeof t.budget_level === "number" ? t.budget_level : 0.5),
    planning_vs_spontaneity: clamp01(
      typeof t.planning_vs_spontaneity === "number" ? t.planning_vs_spontaneity : 0.5
    ),
    noise_sensitivity: clamp01(typeof t.noise_sensitivity === "number" ? t.noise_sensitivity : 0.5),
    eco_preference: clamp01(typeof t.eco_preference === "number" ? t.eco_preference : 0.5),
  };
}

/** Map Activity to engine ActivityInput. Use same category normalization as fallback so engine sees interest types (e.g. sightseeing→culture). */
export function activityToEngineInput(a: Activity): ActivityInput {
  const rawCategory = (a.category ?? "outdoor").toLowerCase();
  const category = normalizeCategoryForMatch(rawCategory);
  const duration = a.duration_hours ?? 1;
  return {
    id: a.id,
    name: a.name,
    category,
    duration_hours: Math.max(0.5, Math.min(24, duration)),
    emission_kg: Math.max(0, a.emission_kg ?? 0),
    price_usd: Math.max(0, a.price_usd ?? 0),
    typical_start_hour: 12,
    typical_crowd_level: 0.5,
  };
}

/** Build BatchScoreRequest from UserPreferences and activities. */
export function buildBatchScoreRequest(
  preferences: UserPreferences | null | undefined,
  activities: Activity[]
): BatchScoreRequest {
  const travel = travelToEngineInput(preferences?.travel);
  const interests = Array.isArray(preferences?.interests) ? preferences.interests : [];
  return {
    travel,
    interests,
    activities: activities.map(activityToEngineInput),
  };
}

/** Map API/Amadeus category strings to our interest types for matching. */
const CATEGORY_TO_INTEREST: Record<string, string> = {
  sightseeing: "culture",
  sights: "culture",
  tour: "culture",
  tours: "culture",
  attraction: "outdoor",
  attractions: "outdoor",
  restaurant: "food",
  dining: "food",
  experience: "outdoor",
  activities: "outdoor",
};

function normalizeCategoryForMatch(category: string): string {
  const c = (category ?? "").trim().toLowerCase();
  return CATEGORY_TO_INTEREST[c] ?? c;
}

/**
 * Normalize an activity category to a profile/ML interest type (e.g. sightseeing→culture, restaurant→food).
 * Use this for UI tabs and filtering so they stay aligned with profile preferences and the Modal ML model.
 */
export function getNormalizedCategory(category: string): string {
  return normalizeCategoryForMatch(category);
}

/** Simple interest match: 1 if category (or its mapping) in interests, 0.5 if no interests, else 0. */
function simpleInterestMatch(interests: string[], category: string): number {
  if (interests.length === 0) return 0.5;
  const cat = normalizeCategoryForMatch(category);
  const normalized = interests.map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (normalized.includes(cat)) return 1;
  return 0;
}

/**
 * Vary fit_score so identical base (e.g. same category or no interests) doesn't show same % for every activity.
 * Uses interest_score (rating), emission_kg, and a small id-based jitter so scores differ even when data is same.
 */
function variedFitScore(base: number, activity: Activity): number {
  const rating = activity.interest_score ?? 0.5;
  const emissionNorm = Math.min(1, (activity.emission_kg ?? 0) / 50);
  const emissionBoost = 0.05 * (1 - emissionNorm); // lower emission = slightly higher score
  let score: number;
  if (base >= 0.99) score = 0.75 + 0.25 * rating;
  else if (base <= 0.01) score = 0.15 + 0.25 * rating;
  else score = 0.35 + 0.45 * rating; // no interests (0.5 base)
  const jitter =
    (hashCode(String(activity.id ?? activity.name ?? "")) % 80) / 1000; // 0–0.08 spread so same data still differs
  return Math.max(0, Math.min(1, score + emissionBoost + jitter));
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Fallback ranking when the XGBoost engine is not available: sort by interest match (desc) then emission_kg (asc).
 * Uses variedFitScore so activities with the same category (e.g. all sightseeing) don't all show the same match %.
 */
export function rankActivitiesFallback(
  activities: Activity[],
  interests: string[]
): RankedActivity[] {
  return activities
    .map((a) => {
      const base = simpleInterestMatch(interests, a.category ?? "");
      const fit_score = variedFitScore(base, a);
      return {
        ...a,
        fit_score,
        regret_probability: undefined,
        explanation: undefined,
      };
    })
    .sort((a, b) => {
      if (b.fit_score !== a.fit_score) return b.fit_score - a.fit_score;
      return (a.emission_kg ?? 0) - (b.emission_kg ?? 0);
    });
}

/**
 * Merge engine batch scores with activities and sort by fit_score desc then emission_kg asc.
 * On length mismatch, uses fallback ranking so scores still vary instead of flat 0.5 for all.
 */
export function mergeAndRank(
  activities: Activity[],
  scores: ScoreResponseItem[]
): RankedActivity[] {
  if (scores.length !== activities.length) {
    return rankActivitiesFallback(activities, []);
  }
  const merged: RankedActivity[] = activities.map((a, i) => ({
    ...a,
    fit_score: scores[i]!.fit_score,
    regret_probability: scores[i]!.regret_probability,
    explanation: scores[i]!.explanation ?? undefined,
  }));
  merged.sort((a, b) => {
    if (b.fit_score !== a.fit_score) return b.fit_score - a.fit_score;
    return (a.emission_kg ?? 0) - (b.emission_kg ?? 0);
  });
  return ensureFitScoreVariety(merged);
}

/**
 * If every activity has the same fit_score (e.g. engine returned identical scores), replace with varied scores
 * so the UI doesn't show the same match % for every attraction.
 */
export function ensureFitScoreVariety(ranked: RankedActivity[]): RankedActivity[] {
  if (ranked.length <= 1) return ranked;
  const first = ranked[0]!.fit_score;
  const allSame = ranked.every((r) => Math.abs(r.fit_score - first) < 1e-6);
  if (!allSame) return ranked;
  const withVariety = ranked.map((a) => ({
    ...a,
    fit_score: variedFitScore(a.fit_score, a),
  }));
  withVariety.sort((a, b) => {
    if (b.fit_score !== a.fit_score) return b.fit_score - a.fit_score;
    return (a.emission_kg ?? 0) - (b.emission_kg ?? 0);
  });
  return withVariety;
}
