# 🌿 PlantRoute

**AI-powered travel planning that helps you explore the world without costing it the earth.**

[![Next.js](https://img.shields.io/badge/Next.js-TypeScript-black?logo=next.js)](https://nextjs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-Database-2D3748?logo=prisma)](https://www.prisma.io/)
[![Gemini](https://img.shields.io/badge/Google-Gemini_API-4285F4?logo=google)](https://ai.google.dev/)
[![Mapbox](https://img.shields.io/badge/Mapbox-3D_Maps-000000?logo=mapbox)](https://www.mapbox.com/)
[![Modal](https://img.shields.io/badge/Modal-ML_Inference-6E56CF)](https://modal.com/)

---

## The Problem

Travel is one of life's great joys — but it has a real environmental cost. Tourism accounts for roughly **8% of global carbon emissions**, according to Sustainable Travel International. A single long-haul flight burns enough fuel to melt down tons of polar ice, and hotels run energy-hungry HVAC and amenities around the clock to keep guests comfortable.

Most travelers don't see this cost when they book. The carbon impact of a flight or a hotel stay is invisible at the point of decision — so it never factors into the decision at all.

**PlantRoute makes that impact visible**, and turns it into an advantage: an AI trip planner that builds personalized itineraries while steering travelers toward lower-carbon flights, hotels, and activities — without asking them to sacrifice a great trip.

---

## What It Does

🌍 **Interactive 3D globe** — A searchable, Mapbox-powered 3D map with visual previews of any destination.

🕺 **Personalized activity recommendations** — Suggests activities based on user preferences, powered by a custom-trained LLM.

✈️ **Carbon-aware travel options** — Surfaces flights and hotels at a destination, ranked using a custom carbon-emissions scoring algorithm.

🗓️ **Auto-generated daily itineraries** — Builds a full day-by-day schedule that users can freely edit and rearrange.

🎮 **Gamified leaderboard** — Ranks users by lowest average CO₂ per trip, turning sustainable choices into friendly competition.

🌐 **One-click booking handoff** — Redirects straight to Expedia to finalize and book the generated plan.

🤖 **AI travel assistant** — A conversational chatbot (powered by Google Gemini) to answer questions and refine plans in real time.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js (TypeScript) |
| **Backend** | Python |
| **Database / ORM** | Prisma |
| **Authentication** | NextAuth |
| **Mapping** | Mapbox API (3D map rendering) |
| **Travel Data** | Amadeus API (flights/hotels), Google Places API |
| **AI / LLM** | Google Gemini API (recommendations + chatbot), custom-trained LLM for personalization |
| **ML Inference** | Modal (serverless inference for prediction models) |
| **Memory / Personalization** | Supermemory integration for storing preferences and trip history |
| **Carbon Scoring** | In-house emissions-calculation algorithm |

### How It Works

1. **Preference & history modeling** — A custom-trained LLM predicts recommendations from user preferences and past trips stored in our database.
2. **Live travel data** — Flight and hotel options are pulled in real time via the Amadeus API and enriched with Google Places data.
3. **Carbon scoring** — Each option is scored using our own emissions-calculation algorithm.
4. **AI selection** — Google Gemini evaluates scored options to select and recommend the best hotel and flight combinations.
5. **Memory** — User preferences and trip history persist across sessions via Prisma + Supermemory, so recommendations improve over time.
6. **Itinerary generation** — A day-by-day schedule is generated and rendered on the 3D Mapbox globe, fully editable by the user.
7. **Booking** — Finalized plans hand off directly to Expedia for booking.

---

## Challenges We Ran Into

- Integrating the **Amadeus API** with **Google Gemini** to turn raw flight/hotel data into meaningful recommendations.
- Sourcing a **mature, reliable carbon-emissions dataset** to ground our calculations.
- Correctly wiring the **Gemini API** into the chatbot pipeline for real-time conversation.
- Designing an accurate, defensible methodology for **calculating carbon emissions** across flights and hotel stays.

---

## Accomplishments We're Proud Of

- Successfully connected a wide range of third-party APIs into one cohesive product.
- Built something genuinely useful for nudging travelers toward greener choices — not just a demo.
- Deeply integrated modern AI (LLMs, inference services, conversational agents) throughout the stack, not bolted on as an afterthought.
- Shipped a clean, intuitive UI.
- Delivered an applicable, polished project with a team made up mostly of first- and second-time hackers.
- Strong teamwork, with each member contributing in their area of strength.

---

## What We Learned

- How to quickly evaluate and integrate unfamiliar third-party APIs under time pressure.
- How to move from brainstorm to working implementation in a matter of hours.
- How to design product strategies (like visible carbon scoring and gamification) that actually nudge user behavior toward a goal.

---

## Roadmap

- [ ] Consolidate the current set of APIs into fewer, more multi-functional services to simplify the stack.
- [ ] Evolve the point-based leaderboard system into a full rewards program.

---

## Getting Started

```bash
# Clone the repository
git clone https://github.com/<your-org>/plantroute.git
cd plantroute

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Add your API keys: AMADEUS_API_KEY, GEMINI_API_KEY, MAPBOX_TOKEN,
# DATABASE_URL, NEXTAUTH_SECRET, SUPERMEMORY_API_KEY, MODAL_TOKEN

# Set up the database
npx prisma migrate dev

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

---
