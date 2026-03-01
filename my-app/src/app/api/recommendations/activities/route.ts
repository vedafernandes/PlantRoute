import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { validateQuery } from "@/lib/validate";
import { ActivitiesQuerySchema } from "@/lib/schemas";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getPreferenceByUserId } from "@/lib/preference-db";
import {
  buildBatchScoreRequest,
  mergeAndRank,
  rankActivitiesFallback,
  type RankedActivity,
} from "@/lib/recommendations";
import { categorizeActivitiesWithGemini } from "@/lib/gemini";
import type { Activity } from "@/types";
import { ATTRACTION_TYPES } from "@/types";
import { normalizedPlaceToActivity } from "@/lib/places-utils";
import type { NormalizedPlace } from "@/types";

export async function GET(req: NextRequest) {
  const rateLimitResponse = await withRateLimit(req, RATE_LIMITS.amadeus, null);
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = new URL(req.url);
  const query = Object.fromEntries(searchParams);
  const validated = validateQuery(ActivitiesQuerySchema, query);
  if (validated.error) return validated.error;

  const { city, limit } = validated.data;
  const requestLimit = Math.max(limit, 45);

  let preferences = null;
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (userId) {
      const pref = await getPreferenceByUserId(userId);
      preferences = pref?.preferences ?? null;
    }
  } catch {
    // continue without preferences
  }

  const baseUrl = req.nextUrl.origin;
  let activities: Activity[];
  try {
    const res = await fetch(
      `${baseUrl}/api/amadeus/activities?city=${encodeURIComponent(city)}&limit=${requestLimit}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch activities", activities: [] },
        { status: 502 }
      );
    }
    const data = (await res.json()) as { activities?: NormalizedPlace[] | Activity[] };
    const raw = Array.isArray(data.activities) ? data.activities : [];
    activities = raw.map((a) =>
      "type" in a && a.type === "attraction"
        ? normalizedPlaceToActivity(a as NormalizedPlace, city)
        : (a as Activity)
    );
  } catch (e) {
    console.error("[recommendations] Failed to fetch activities:", String(e));
    return NextResponse.json(
      { error: "Failed to fetch activities", activities: [] },
      { status: 502 }
    );
  }

  if (activities.length === 0) {
    return NextResponse.json({
      activities: [],
      message: "No real places found",
    });
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    try {
      const categories = await categorizeActivitiesWithGemini(
        geminiKey,
        activities.map((a) => ({ name: a.name, category: a.category }))
      );
      activities.forEach((a, i) => {
        a.category = categories[i] ?? a.category;
      });
    } catch (e) {
      console.warn("[recommendations] Gemini categorization failed:", String(e));
    }
  }

  const engineUrl = process.env.PREFERENCE_ENGINE_XGBOOST_URL?.trim();
  let ranked: RankedActivity[];

  if (engineUrl) {
    try {
      const body = buildBatchScoreRequest(preferences, activities);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      const res = await fetch(`${engineUrl.replace(/\/$/, "")}/batch_score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const batch = (await res.json()) as {
          scores?: Array<{ fit_score?: number; regret_probability?: number; explanation?: string[] | null }>;
        };
        const raw = batch.scores ?? [];
        const expectedLen = activities.length;
        if (raw.length !== expectedLen) {
          console.warn(
            "[recommendations] Engine returned scores length",
            raw.length,
            "expected",
            expectedLen,
            "- using fallback"
          );
          ranked = rankActivitiesFallback(activities, preferences?.interests ?? []);
        } else {
          const scores = raw.map((s) => {
            const fit = typeof s.fit_score === "number" ? Math.max(0, Math.min(1, s.fit_score)) : 0.5;
            return {
              fit_score: fit,
              regret_probability: typeof s.regret_probability === "number" ? s.regret_probability : 0,
              explanation: s.explanation ?? null,
            };
          });
          ranked = mergeAndRank(activities, scores);
        }
      } else {
        const errText = await res.text().catch(() => "");
        console.warn("[recommendations] Engine returned", res.status, errText.slice(0, 200));
        ranked = rankActivitiesFallback(activities, preferences?.interests ?? []);
      }
    } catch (e) {
      console.warn("[recommendations] Engine request failed, using fallback:", String(e));
      ranked = rankActivitiesFallback(activities, preferences?.interests ?? []);
    }
  } else {
    ranked = rankActivitiesFallback(activities, preferences?.interests ?? []);
  }

  const minPerCategory = 5;
  const byCategory = new Map<string, RankedActivity[]>();
  for (const a of ranked) {
    const cat = (a.category ?? "culture").toLowerCase();
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(a);
  }
  const ordered: RankedActivity[] = [];
  for (const cat of ATTRACTION_TYPES) {
    const list = byCategory.get(cat) ?? [];
    ordered.push(...list.slice(0, minPerCategory));
  }
  for (const cat of ATTRACTION_TYPES) {
    const list = byCategory.get(cat) ?? [];
    ordered.push(...list.slice(minPerCategory));
  }
  const uncategorized = ranked.filter((a) => !ATTRACTION_TYPES.includes((a.category ?? "").toLowerCase() as (typeof ATTRACTION_TYPES)[number]));
  ordered.push(...uncategorized);

  return NextResponse.json({ activities: ordered });
}
