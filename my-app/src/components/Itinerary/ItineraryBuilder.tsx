"use client";

import { useState, useCallback, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowLeft } from "lucide-react";
import type { GeoPoint } from "@/types";
import type {
  Itinerary,
  StoredItinerary,
  UserPreferences,
  Hotel,
  Activity,
  ItineraryDay,
  TransportSegment,
  CarbonResult,
} from "@/types";
import type { NormalizedPlace } from "@/types";
import { normalizedPlaceToHotel } from "@/lib/places-utils";
import { scoreItinerary } from "@/lib/interest-scorer";
import { applyCarbonResult } from "@/lib/apply-carbon";
import { carbonPredictorLocal } from "@/lib/carbon-local";
import { HotelSelector } from "./HotelSelector";
import { ActivitySelector } from "./ActivitySelector";
import { TravelOptionsPanel } from "./TravelOptionsPanel";
import { LocationSelect, DEFAULT_ORIGIN } from "./LocationSelect";
import { CarbonCompareModal } from "@/components/UI/CarbonCompareModal";
import { formatDate } from "@/lib/utils";
import { haversine } from "@/lib/haversine";

const STORAGE_KEY = "plantroute_itineraries";
const FLIGHT_MIN_DISTANCE_KM = 500; /** Only show flight options when origin–destination > this */

interface ItineraryBuilderProps {
  city: GeoPoint;
  onClose: () => void;
  initialPreferences?: UserPreferences | null;
}

export function ItineraryBuilder({
  city,
  onClose,
  initialPreferences,
}: ItineraryBuilderProps) {
  const [step, setStep] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startLocation, setStartLocation] = useState<GeoPoint>(DEFAULT_ORIGIN);
  const [preferences] = useState<UserPreferences | null>(
    initialPreferences ?? null
  );
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null);
  const [selectedActivityIds, setSelectedActivityIds] = useState<Set<string>>(
    new Set()
  );
  const [dailyPlan, setDailyPlan] = useState<ItineraryDay[]>([]);
  const [loadingHotels, setLoadingHotels] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [hotelSuggestionReason, setHotelSuggestionReason] = useState<string | null>(null);
  const [hotelsMessage, setHotelsMessage] = useState<string | null>(null);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [building, setBuilding] = useState(false);
  const [finalItinerary, setFinalItinerary] = useState<Itinerary | null>(null);
  const [regretItinerary, setRegretItinerary] = useState<Itinerary | null>(null);
  const [originalItineraryForRegret, setOriginalItineraryForRegret] = useState<Itinerary | null>(null);

  const { data: session } = useSession();
  const cityName = city.name.split(",")[0]?.trim() ?? city.name;
  const todayIso = new Date().toISOString().slice(0, 10);

  // When user searches or selects a different city while building, revert to first page
  useEffect(() => {
    setStep(1);
    setHotels([]);
    setActivities([]);
    setSelectedHotel(null);
    setSelectedActivityIds(new Set());
    setDailyPlan([]);
    setFinalItinerary(null);
    setRegretItinerary(null);
    setOriginalItineraryForRegret(null);
    setHotelsMessage(null);
    setHotelSuggestionReason(null);
  }, [city.name, city.lat, city.lng]);

  const prefs: UserPreferences = preferences ?? {
    interests: ["culture", "outdoor"],
    budget_level: "mid",
    carbon_sensitivity: "medium",
    avoid_flying: false,
    party_size: 1,
  };

  const parseHotelsResponse = (d: { hotels?: NormalizedPlace[] | Hotel[]; message?: string }) => {
    const raw = d.hotels ?? [];
    if (d.message === "No real places found" || raw.length === 0) {
      setHotelsMessage(d.message ?? "No real places found");
      setHotels([]);
      return;
    }
    setHotelsMessage(null);
    const asHotels = raw.map((h) =>
      "type" in h && h.type === "hotel"
        ? normalizedPlaceToHotel(h as NormalizedPlace, cityName)
        : (h as Hotel)
    );
    setHotels(asHotels);
  };

  useEffect(() => {
    if (step !== 3 || !startDate || !endDate) return;
    setLoadingHotels(true);
    setHotelSuggestionReason(null);
    setHotelsMessage(null);
    const selectedAttractions = activities.filter((a) => selectedActivityIds.has(a.id));
    if (selectedAttractions.length > 0) {
      fetch("/api/recommendations/hotel-by-proximity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: cityName,
          checkIn: startDate,
          checkOut: endDate,
          selectedAttractions: selectedAttractions.map((a) => ({
            id: a.id,
            name: a.name,
            category: a.category,
            location: a.location,
          })),
        }),
        signal: AbortSignal.timeout(15000),
      })
        .then((r) => r.json())
        .then((d) => {
          setHotels(d.hotels ?? []);
          if (d.suggestedHotel) setSelectedHotel(d.suggestedHotel);
          if (d.reason) setHotelSuggestionReason(d.reason);
          setHotelsMessage(d.hotels?.length === 0 ? (d.message ?? "No real places found") : null);
        })
        .catch(() => {
          fetch(
            `/api/amadeus/hotels?city=${encodeURIComponent(cityName)}&checkIn=${startDate}&checkOut=${endDate}`,
            { signal: AbortSignal.timeout(10000) }
          )
            .then((r) => r.json())
            .then(parseHotelsResponse)
            .catch(() => setHotels([]));
        })
        .finally(() => setLoadingHotels(false));
    } else {
      fetch(
        `/api/amadeus/hotels?city=${encodeURIComponent(cityName)}&checkIn=${startDate}&checkOut=${endDate}`,
        { signal: AbortSignal.timeout(10000) }
      )
        .then((r) => r.json())
        .then(parseHotelsResponse)
        .catch(() => setHotels([]))
        .finally(() => setLoadingHotels(false));
    }
  }, [step, cityName, startDate, endDate]);

  useEffect(() => {
    if (startDate && startDate < todayIso) {
      setStartDate(todayIso);
    }
  }, [startDate, todayIso]);

  useEffect(() => {
    const minCheckout = startDate || todayIso;
    if (endDate && endDate < minCheckout) {
      setEndDate(minCheckout);
    }
  }, [endDate, startDate, todayIso]);

  useEffect(() => {
    if (step === 2) {
      setLoadingActivities(true);
      fetch(
        `/api/recommendations/activities?city=${encodeURIComponent(cityName)}&limit=20`,
        { signal: AbortSignal.timeout(50000) }
      )
        .then((r) => r.json())
        .then((d) => setActivities(d.activities ?? []))
        .catch(() => setActivities([]))
        .finally(() => setLoadingActivities(false));
    }
  }, [step, cityName]);

  useEffect(() => {
    if (step === 5 && startDate && endDate) {
      setLoadingFlights(true);
      const originQuery = encodeURIComponent(startLocation.name.split(",")[0]?.trim() ?? startLocation.name);
      const destinationQuery = encodeURIComponent(cityName);
      const destinationCoords = { lat: city.lat, lng: city.lng, name: cityName };
      const distanceKm = haversine(
        startLocation.lat,
        startLocation.lng,
        city.lat,
        city.lng
      );
      const includeFlights = distanceKm >= FLIGHT_MIN_DISTANCE_KM;

      const flightPromises = includeFlights
        ? [
            fetch(
              `/api/amadeus/flights?origin=${originQuery}&destination=${destinationQuery}&date=${startDate}&adults=1`,
              { signal: AbortSignal.timeout(10000) }
            ).then((r) => r.json()),
            fetch(
              `/api/amadeus/flights?origin=${destinationQuery}&destination=${originQuery}&date=${endDate}&adults=1`,
              { signal: AbortSignal.timeout(10000) }
            ).then((r) => r.json()),
          ]
        : [Promise.resolve({ flights: [] }), Promise.resolve({ flights: [] })];

      Promise.all([
        ...flightPromises,
        fetch("/api/travel/alternatives", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: { lat: startLocation.lat, lng: startLocation.lng, name: startLocation.name },
            destination: destinationCoords,
            date: startDate,
            direction: "arrival",
          }),
          signal: AbortSignal.timeout(15000),
        }).then((r) => r.json()),
        fetch("/api/travel/alternatives", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: { lat: startLocation.lat, lng: startLocation.lng, name: startLocation.name },
            destination: destinationCoords,
            date: endDate,
            direction: "departure",
          }),
          signal: AbortSignal.timeout(15000),
        }).then((r) => r.json()),
      ])
        .then(([arr, dep, altArr, altDep]) => {
          const flightsArr = arr.flights ?? [];
          const flightsDep = dep.flights ?? [];
          const altArrOptions = altArr.alternatives ?? [];
          const altDepOptions = altDep.alternatives ?? [];
          const hasDistance = (seg: TransportSegment) => (seg.distance_km ?? 0) > 0;
          const byEmission = (a: { emission_kg?: number }, b: { emission_kg?: number }) =>
            (a.emission_kg ?? 9999) - (b.emission_kg ?? 9999);
          setArrivalOptions(
            [...flightsArr, ...altArrOptions].filter(hasDistance).sort(byEmission)
          );
          setDepartureOptions(
            [...flightsDep, ...altDepOptions].filter(hasDistance).sort(byEmission)
          );
        })
        .catch(() => {
          setArrivalOptions([]);
          setDepartureOptions([]);
        })
        .finally(() => setLoadingFlights(false));
    }
  }, [step, startDate, endDate, cityName, city.lat, city.lng, startLocation.lat, startLocation.lng, startLocation.name]);

  const handleActivityToggle = useCallback((activity: Activity) => {
    setSelectedActivityIds((prev) => {
      const next = new Set(prev);
      if (next.has(activity.id)) next.delete(activity.id);
      else next.add(activity.id);
      return next;
    });
  }, []);

  const handleScheduleActivities = useCallback(async () => {
    if (!selectedHotel || selectedActivityIds.size === 0) return;
    const selectedActs = activities.filter((a) => selectedActivityIds.has(a.id));
    const res = await fetch("/api/infer/schedule-activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activities: selectedActs,
        startDate,
        endDate,
        hotel: selectedHotel,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return;
    const data = await res.json();
    setDailyPlan(data.days ?? []);
  }, [
    selectedHotel,
    selectedActivityIds,
    activities,
    startDate,
    endDate,
  ]);

  const handleCreateDailyPlan = useCallback(async () => {
    setStep(4);
    setGeneratingPlan(true);
    try {
      await handleScheduleActivities();
    } finally {
      setGeneratingPlan(false);
    }
  }, [handleScheduleActivities]);

  const buildFinalItinerary = useCallback(async () => {
    if (!selectedHotel || dailyPlan.length === 0) return;
    setBuilding(true);
    setStep(6);
    try {
      const days: ItineraryDay[] = dailyPlan.map((d) => ({
        ...d,
        transport: [...d.transport],
      }));

      const itinerary: Itinerary = {
        id: crypto.randomUUID(),
        city: cityName,
        start_date: startDate,
        end_date: endDate,
        days,
        total_price_usd: 0,
        total_emission_kg: 0,
        interest_match_score: scoreItinerary(
          { ...({} as Itinerary), days, interest_match_score: 0 },
          prefs
        ),
        regret_score: 0,
      };

      const carbonRes = await fetch("/api/infer/carbon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itinerary }),
        signal: AbortSignal.timeout(10000),
      });
      let carbonData: CarbonResult;
      if (carbonRes.ok) {
        carbonData = await carbonRes.json();
      } else {
        carbonData = carbonPredictorLocal(itinerary);
      }
      const merged = applyCarbonResult(itinerary, {
        items: carbonData.items ?? [],
        total_kg: carbonData.total_kg ?? 0,
      });
      const scored = {
        ...merged,
        interest_match_score: scoreItinerary(merged, prefs),
      };
      setFinalItinerary(scored);

      const stored =
        typeof window !== "undefined"
          ? window.localStorage.getItem(STORAGE_KEY)
          : null;
      const list: StoredItinerary[] = stored ? JSON.parse(stored) : [];
      const originalSnapshot = JSON.parse(JSON.stringify(scored)) as Itinerary;
      if (!list.find((i) => i.id === scored.id)) {
        list.push({ ...scored, confirmed: false, originalItinerary: originalSnapshot });
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      }
      setStep(7);
    } catch (e) {
      console.error(e);
    } finally {
      setBuilding(false);
    }
  }, [
    selectedHotel,
    dailyPlan,
    cityName,
    startDate,
    endDate,
    prefs,
  ]);

  const handleSelectItinerary = (it: Itinerary) => {
    window.location.href = `/itinerary/${it.id}`;
  };

  const handleConfirmTrip = (it: Itinerary) => {
    if (!session?.user) {
      signIn(undefined, { callbackUrl: `/itinerary/${it.id}` });
      return;
    }
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const list: (Itinerary & { confirmed?: boolean })[] = stored ? JSON.parse(stored) : [];
    const idx = list.findIndex((i) => i.id === it.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], confirmed: true };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
    if (session.user) {
      fetch("/api/carbon/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emissionKg: it.total_emission_kg ?? 0,
          itineraryId: it.id,
        }),
      }).catch(() => {});
    }
    window.location.href = `/itinerary/${it.id}`;
  };

  const isExpandedPanel = step >= 6 || building;

  return (
    <>
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed inset-y-0 right-0 w-full max-w-lg z-50 overflow-y-auto"
        style={{
          background: "var(--bg-surface)",
          boxShadow: "-4px 0 40px rgba(0,0,0,0.08)",
        }}
      >
        <div
          className="p-4 flex items-center justify-between border-b sticky top-0 z-10"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border)",
          }}
        >
          <div className="flex items-center gap-2">
            {(step === 2 || step === 3 || step === 4) && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border hover:opacity-90"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text-primary)",
                  background: "var(--bg-elevated)",
                }}
                aria-label={
                  step === 4
                    ? "Back to hotels"
                    : step === 3
                      ? "Back to activities"
                      : "Back to dates"
                }
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-xs font-medium">Back</span>
              </button>
            )}
            <h2
              className="text-lg font-display font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Build itinerary · {cityName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:opacity-80"
            aria-label="Close"
          >
            <X className="w-5 h-5" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        <div className="p-6">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <p
                  className="text-sm"
                  style={{ color: "var(--text-muted)" }}
                >
                  1. Where are you traveling from & when?
                </p>
                <LocationSelect
                  value={startLocation}
                  onChange={setStartLocation}
                  label="Start location"
                  placeholder="Search your city..."
                />
                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <span
                      className="text-xs block mb-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Check-in
                    </span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2"
                      style={{ borderColor: "var(--border)" }}
                    />
                  </label>
                  <label className="block">
                    <span
                      className="text-xs block mb-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Check-out
                    </span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2"
                      style={{ borderColor: "var(--border)" }}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!startDate || !endDate}
                  className="w-full py-3 rounded-xl font-medium text-white disabled:opacity-50"
                  style={{ background: "#2d6a4f" }}
                >
                  Next
                </button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4 min-h-[72vh] flex flex-col"
              >
                <h3
                  className="font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  2. Choose activities
                </h3>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Ranked by your interests and low carbon.
                </p>
                <div className="flex-1 min-h-0">
                  <ActivitySelector
                    activities={activities}
                    selectedIds={selectedActivityIds}
                    onToggle={handleActivityToggle}
                    loading={loadingActivities}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={selectedActivityIds.size === 0}
                  className="w-full py-3 rounded-xl font-medium text-white disabled:opacity-50 mt-auto"
                  style={{ background: "#2d6a4f" }}
                >
                  Next: choose hotel
                </button>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <h3
                  className="font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  3. Choose your hotel
                </h3>
                {hotelSuggestionReason && (
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    Suggested for proximity: {hotelSuggestionReason}
                  </p>
                )}
                <HotelSelector
                  hotels={hotels}
                  selectedHotel={selectedHotel}
                  onSelect={setSelectedHotel}
                  loading={loadingHotels}
                  emptyMessage={hotelsMessage}
                  numNights={
                    startDate && endDate
                      ? Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (24 * 60 * 60 * 1000)))
                      : undefined
                  }
                />
                <button
                  type="button"
                  onClick={handleCreateDailyPlan}
                  disabled={!selectedHotel || selectedActivityIds.size === 0 || generatingPlan}
                  className="w-full py-3 rounded-xl font-medium text-white disabled:opacity-50"
                  style={{ background: "#2d6a4f" }}
                >
                  {generatingPlan ? "Creating daily plan…" : "Create daily plan"}
                </button>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <h3
                  className="font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  4. Daily plan preview
                </h3>
                {dailyPlan.length === 0 ? (
                  <>
                    <p
                      className="text-sm"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Activities grouped by location to minimize travel and carbon—each day focuses on one area.
                    </p>
                    <button
                      type="button"
                      onClick={handleScheduleActivities}
                      className="w-full py-3 rounded-xl font-medium text-white"
                      style={{ background: "#2d6a4f" }}
                    >
                      Generate plan
                    </button>
                  </>
                ) : (
                  <>
                    <div className="space-y-4 max-h-72 overflow-y-auto">
                      {dailyPlan.map((day) => (
                        <div
                          key={day.date}
                          className="rounded-xl p-4 border"
                          style={{
                            background: "var(--bg-elevated)",
                            borderColor: "var(--border)",
                          }}
                        >
                          <p
                            className="font-medium text-sm mb-2"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {formatDate(day.date)}
                          </p>
                          <ul className="text-sm space-y-1">
                            {day.activities.map((a) => (
                              <li
                                key={a.id}
                                style={{ color: "var(--text-muted)" }}
                              >
                                • {a.name}
                              </li>
                            ))}
                          </ul>
                          {day.transport.length > 0 && (
                            <p
                              className="text-xs mt-2"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {day.transport.filter((t) => t.mode === "walk")
                                .length > 0
                                ? "Includes walking"
                                : ""}{" "}
                              {day.transport.filter((t) => t.mode === "bus")
                                .length > 0
                                ? "• Transit"
                                : ""}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={buildFinalItinerary}
                      disabled={building}
                      className="w-full py-3 rounded-xl font-medium text-white disabled:opacity-50"
                      style={{ background: "#2d6a4f" }}
                    >
                      {building ? "Building…" : "Build itinerary"}
                    </button>
                  </>
                )}
              </motion.div>
            )}

            {(step === 6 || building) && (
              <motion.div
                key="building"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6 py-8"
              >
                <p
                  className="text-center font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {building ? "Building your itinerary…" : "Loading…"}
                </p>
                <div className="flex justify-center">
                  <motion.div
                    className="w-12 h-12 rounded-full border-4 border-t-transparent"
                    style={{
                      borderColor: "var(--accent-green)",
                      borderTopColor: "transparent",
                    }}
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  />
                </div>
              </motion.div>
            )}

            {step === 7 && finalItinerary && !building && (
              <motion.div
                key="step7"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <p
                  className="text-sm"
                  style={{ color: "var(--text-muted)" }}
                >
                  Your itinerary is ready!
                </p>
                <div
                  className="rounded-2xl p-5 border"
                  style={{
                    background: "var(--bg-elevated)",
                    borderColor: "var(--border)",
                  }}
                >
                  <p
                    className="text-sm mb-4"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {finalItinerary.days.length} days
                  </p>
                  <div className="mb-4">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{
                        backgroundColor:
                          finalItinerary.total_emission_kg < 20
                            ? "#2d6a4f"
                            : finalItinerary.total_emission_kg <= 100
                              ? "#d47c0f"
                              : "#c1440e",
                      }}
                    >
                      {finalItinerary.total_emission_kg.toFixed(1)} kg CO₂e
                    </span>
                  </div>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOriginalItineraryForRegret((prev) =>
                          prev ?? (JSON.parse(JSON.stringify(finalItinerary)) as Itinerary)
                        );
                        setRegretItinerary(finalItinerary);
                      }}
                      className="w-full py-2 px-4 rounded-xl text-sm font-medium border"
                      style={{
                        borderColor: "var(--accent-green)",
                        color: "var(--accent-green)",
                        background: "transparent",
                      }}
                    >
                      Lower carbon alternative
                    </button>
                    <button
                      type="button"
                      onClick={() => handleConfirmTrip(finalItinerary)}
                      className="w-full py-3 px-4 rounded-xl font-medium text-white"
                      style={{ background: "#2d6a4f" }}
                    >
                      {session?.user ? "Confirm trip" : "Sign in to confirm trip"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectItinerary(finalItinerary)}
                      className="w-full py-2 px-4 rounded-xl text-sm font-medium border"
                      style={{
                        borderColor: "var(--border)",
                        color: "var(--text-muted)",
                        background: "transparent",
                      }}
                    >
                      View itinerary
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {regretItinerary && originalItineraryForRegret && (
        <CarbonCompareModal
          itinerary={regretItinerary}
          originalItinerary={originalItineraryForRegret}
          onClose={() => setRegretItinerary(null)}
          onKeepOriginal={() => {
            setFinalItinerary(originalItineraryForRegret);
            if (typeof window !== "undefined") {
              const stored = window.localStorage.getItem(STORAGE_KEY);
              const list: StoredItinerary[] = stored ? JSON.parse(stored) : [];
              const idx = list.findIndex((i) => i.id === originalItineraryForRegret.id);
              if (idx >= 0) {
                list[idx] = {
                  ...originalItineraryForRegret,
                  confirmed: list[idx]!.confirmed,
                  originalItinerary: originalItineraryForRegret,
                };
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
              }
            }
          }}
          onSwitch={(alt) => {
            setFinalItinerary(alt);
            setRegretItinerary(null);
            if (typeof window !== "undefined") {
              const stored = window.localStorage.getItem(STORAGE_KEY);
              const list: StoredItinerary[] = stored ? JSON.parse(stored) : [];
              const idx = list.findIndex((i) => i.id === alt.id);
              const existing = idx >= 0 ? list[idx]! : null;
              const storedOriginal = existing?.originalItinerary ?? originalItineraryForRegret;
              const entry: StoredItinerary = { ...alt, confirmed: false, originalItinerary: storedOriginal };
              if (idx >= 0) list[idx] = entry;
              else list.push(entry);
              window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
            }
          }}
        />
      )}
    </>
  );
}
