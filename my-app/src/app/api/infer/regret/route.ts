import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Legacy endpoint: the app no longer deploys the linear preference_engine to Modal.
 * Activity recommendations use PREFERENCE_ENGINE_XGBOOST_URL (modal_apps/preference_engine_xgboost.py) only.
 */
export async function POST(req: NextRequest) {
  const rateLimitResponse = await withRateLimit(req, RATE_LIMITS.regret, null);
  if (rateLimitResponse) return rateLimitResponse;

  return NextResponse.json(
    {
      error:
        "Legacy preference engine removed. Use PREFERENCE_ENGINE_XGBOOST_URL for activity ranking (deploy modal_apps/preference_engine_xgboost.py).",
    },
    { status: 410 }
  );
}
