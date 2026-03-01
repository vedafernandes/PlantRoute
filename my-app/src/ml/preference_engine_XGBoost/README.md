# Preference Engine (XGBoost)

Ranks attractions by **fit score** (travel sliders + liked attraction types) and **low CO2e**.

## Inputs

- **Travel sliders** (0–1): `trip_pace`, `crowd_comfort`, `morning_tolerance`, `late_night_tolerance`, `walking_effort`, `budget_level`, `planning_vs_spontaneity`, `noise_sensitivity`
- **Interests**: list of liked attraction types (e.g. `museum`, `culture`, `outdoor`, `nature`, `food`, `nightlife`, `wellness`, `beach`, `ski`)
- **Per activity**: `category`, `duration_hours`, `emission_kg`, `price_usd`, optional `typical_start_hour`, `typical_crowd_level`

## Outputs

- **fit_score** (0–1), **regret_probability** (0–1), optional **explanation** list

## Train

From `my-app/src`:

```bash
pip install -r ml/preference_engine_XGBoost/requirements.txt
python -m ml.preference_engine_XGBoost.train
```

Model and metadata are written to `src/ml/preference_engine_XGBoost/artifacts/`.

## API (FastAPI)

```bash
uvicorn ml.preference_engine_XGBoost.api:app --reload
```

- `POST /score` — single activity
- `POST /batch_score` — list of activities
- `GET /health`

## Run on Modal

**First-time setup:** Install Modal and log in (from `my-app`):

```bash
pip install -r modal_apps/requirements.txt
modal token new
```

(Sign up at modal.com if needed; the CLI will open a browser.)

From `my-app` (after training so `artifacts/model.joblib` exists):

```bash
modal deploy modal_apps/preference_engine_xgboost.py
```

Set **`PREFERENCE_ENGINE_XGBOOST_URL`** to the deployed URL (e.g. `https://<workspace>--preference-engine-xgboost.modal.run`). The app uses this for ranking attractions. Only this XGBoost app is deployed to Modal; the linear `ml/preference_engine` remains in the repo for reference but is not deployed.

## Use from Next.js

- **Ranked activities API:** `GET /api/recommendations/activities?city=...&limit=...`  
  Fetches activities for the city, loads user preferences (travel + `likedAttractionTypes` → `interests`), calls this engine when `PREFERENCE_ENGINE_XGBOOST_URL` is set, otherwise ranks by interest match + emission. Returns `{ activities: RankedActivity[] }` (each with `fit_score`, optional `regret_probability`, `explanation`).

- **Env:** Set `PREFERENCE_ENGINE_XGBOOST_URL` to your Modal URL (or `http://localhost:8000` for local) to use the XGBoost engine; if unset, the app uses fallback ranking.
