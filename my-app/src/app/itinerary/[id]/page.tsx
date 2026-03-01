"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import type { Itinerary, ItineraryDay, Activity, Hotel, StoredItinerary, TransportSegment } from "@/types";
import { ActivityCard } from "@/components/Itinerary/ActivityCard";
import { TransportCard } from "@/components/Itinerary/TransportCard";
import { TransportLegOptions } from "@/components/Itinerary/TransportLegOptions";
import { ActivitySelector } from "@/components/Itinerary/ActivitySelector";
import { HotelSelector } from "@/components/Itinerary/HotelSelector";
import { SavePreferencesBanner } from "@/components/UI/SavePreferencesBanner";
import { CarbonCompareModal } from "@/components/UI/CarbonCompareModal";
import { hotelPriceTier, formatDate } from "@/lib/utils";
import { applyCarbonResult } from "@/lib/apply-carbon";
import { scoreItinerary } from "@/lib/interest-scorer";
import { HOTEL_FACTOR_PER_NIGHT } from "@/lib/carbon";
import { Star, Trash2, Pencil, X, Plus, Building2, GripVertical } from "lucide-react";

const STORAGE_KEY = "plantroute_itineraries";

function isFlight(seg: TransportSegment): boolean {
  return seg.mode === "flight_short" || seg.mode === "flight_long";
}

export default function ItineraryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const id = typeof params.id === "string" ? params.id : "";
  const isEditMode = searchParams.get("edit") === "1";

  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [originalItinerary, setOriginalItinerary] = useState<Itinerary | null>(null);
  const [regretOpen, setRegretOpen] = useState(false);
  const [showSaveBanner, setShowSaveBanner] = useState(false);

  // Edit mode state
  const [addActivityDayIndex, setAddActivityDayIndex] = useState<number | null>(null);
  const [changeHotelOpen, setChangeHotelOpen] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [hotelsLoading, setHotelsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOverDayIndex, setDragOverDayIndex] = useState<number | null>(null);
  const [dragOverActivityKey, setDragOverActivityKey] = useState<string | null>(null);

  const cityName = itinerary?.city ?? "";

  const handleDragStart = (e: React.DragEvent, dayIndex: number, activityId: string) => {
    e.dataTransfer.setData("application/json", JSON.stringify({ activityId, fromDayIndex: dayIndex }));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, dayIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDayIndex(dayIndex);
  };

  const handleActivityDragOver = (e: React.DragEvent, dayIndex: number, activityIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDragOverDayIndex(dayIndex);
    setDragOverActivityKey(`${dayIndex}-${activityIndex}`);
  };

  const handleDragLeave = () => {
    setDragOverDayIndex(null);
    setDragOverActivityKey(null);
  };

  const handleDrop = (e: React.DragEvent, toDayIndex: number, toIndex?: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverDayIndex(null);
    setDragOverActivityKey(null);
    try {
      const { activityId, fromDayIndex } = JSON.parse(e.dataTransfer.getData("application/json"));
      if (activityId != null && typeof fromDayIndex === "number") moveActivity(fromDayIndex, activityId, toDayIndex, toIndex);
    } catch {}
  };

  const handleDelete = () => {
    if (!confirm("Delete this trip? This cannot be undone.")) return;
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list: StoredItinerary[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((i) => i.id !== id);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    router.push("/profile");
  };

  const loadItinerary = useCallback(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list: StoredItinerary[] = raw ? JSON.parse(raw) : [];
    const found = list.find((i) => i.id === id);
    const stored = found as StoredItinerary | undefined;
    setItinerary(found ? JSON.parse(JSON.stringify(found)) : null);
    setOriginalItinerary(stored?.originalItinerary ?? null);
    setShowSaveBanner(list.length >= 1);
  }, [id]);

  const handleConfirmTrip = useCallback(() => {
    if (!itinerary) return;
    if (!session?.user) {
      signIn(undefined, { callbackUrl: `/itinerary/${itinerary.id}` });
      return;
    }
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list: (Itinerary & { confirmed?: boolean })[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((i) => i.id === itinerary.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], confirmed: true };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      setItinerary((prev) => (prev ? { ...prev, confirmed: true } : null));
    }
    fetch("/api/carbon/record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emissionKg: itinerary.total_emission_kg ?? 0,
        itineraryId: itinerary.id,
      }),
    }).catch(() => {});
  }, [itinerary, session?.user]);

  useEffect(() => {
    loadItinerary();
  }, [loadItinerary]);

  // Fetch activities when add-activity modal opens
  useEffect(() => {
    if (addActivityDayIndex === null || !cityName) return;
    setActivitiesLoading(true);
    fetch(`/api/recommendations/activities?city=${encodeURIComponent(cityName)}&limit=50`, {
      signal: AbortSignal.timeout(15000),
    })
      .then((r) => r.json())
      .then((d) => setActivities(d.activities ?? []))
      .catch(() => setActivities([]))
      .finally(() => setActivitiesLoading(false));
  }, [addActivityDayIndex, cityName]);

  // Fetch hotels when change-hotel modal opens
  useEffect(() => {
    if (!changeHotelOpen || !itinerary) return;
    setHotelsLoading(true);
    fetch(
      `/api/amadeus/hotels?city=${encodeURIComponent(cityName)}&checkIn=${itinerary.start_date}&checkOut=${itinerary.end_date}`,
      { signal: AbortSignal.timeout(15000) }
    )
      .then((r) => r.json())
      .then((d) => setHotels(d.hotels ?? []))
      .catch(() => setHotels([]))
      .finally(() => setHotelsLoading(false));
  }, [changeHotelOpen, itinerary, cityName]);

  const removeActivity = (dayIndex: number, activityId: string) => {
    if (!itinerary) return;
    setItinerary({
      ...itinerary,
      days: itinerary.days.map((day, i) =>
        i === dayIndex
          ? { ...day, activities: day.activities.filter((a) => a.id !== activityId) }
          : day
      ),
    });
  };

  const moveActivity = (fromDayIndex: number, activityId: string, toDayIndex: number, toIndex?: number) => {
    if (!itinerary) return;
    const fromDay = itinerary.days[fromDayIndex];
    const activity = fromDay.activities.find((a) => a.id === activityId);
    if (!activity) return;

    const fromIdx = fromDay.activities.findIndex((a) => a.id === activityId);
    const targetIdx = toIndex ?? (toDayIndex === fromDayIndex ? fromIdx : itinerary.days[toDayIndex].activities.length);

    if (fromDayIndex === toDayIndex && fromIdx === targetIdx) return;

    setItinerary({
      ...itinerary,
      days: itinerary.days.map((day, i) => {
        if (i === fromDayIndex) {
          const filtered = day.activities.filter((a) => a.id !== activityId);
          if (i === toDayIndex) {
            const insertIdx = fromIdx < targetIdx ? targetIdx - 1 : targetIdx;
            const next = [...filtered];
            next.splice(Math.max(0, Math.min(insertIdx, next.length)), 0, activity);
            return { ...day, activities: next };
          }
          return { ...day, activities: filtered };
        }
        if (i === toDayIndex) {
          const next = [...day.activities];
          next.splice(Math.min(targetIdx, next.length), 0, activity);
          return { ...day, activities: next };
        }
        return day;
      }),
    });
  };

  const addActivityToDay = (activity: Activity) => {
    if (!itinerary || addActivityDayIndex === null) return;
    const day = itinerary.days[addActivityDayIndex];
    if (!day) return;
    // Remove from any other day (move), then add to target day
    setItinerary({
      ...itinerary,
      days: itinerary.days.map((d, i) => {
        if (i === addActivityDayIndex) {
          const alreadyHere = d.activities.some((a) => a.id === activity.id);
          return { ...d, activities: alreadyHere ? d.activities : [...d.activities, activity] };
        }
        return { ...d, activities: d.activities.filter((a) => a.id !== activity.id) };
      }),
    });
    setAddActivityDayIndex(null);
  };

  const updateTransportSegment = (
    dayIndex: number,
    segmentId: string,
    updates: { mode: TransportSegment["mode"]; duration_minutes: number; emission_kg: number; price_usd: number }
  ) => {
    if (!itinerary) return;
    setItinerary({
      ...itinerary,
      days: itinerary.days.map((day, i) =>
        i === dayIndex
          ? {
              ...day,
              transport: day.transport.map((seg) =>
                seg.id === segmentId
                  ? { ...seg, ...updates }
                  : seg
              ),
            }
          : day
      ),
    });
  };

  const changeHotel = (hotel: Hotel) => {
    if (!itinerary) return;
    setItinerary({
      ...itinerary,
      days: itinerary.days.map((day) => ({ ...day, hotel })),
    });
    setChangeHotelOpen(false);
  };

  const saveEdits = async () => {
    if (!itinerary) return;
    setSaving(true);
    try {
      const itineraryToSave = { ...itinerary, total_price_usd: 0 };
      const carbonRes = await fetch("/api/infer/carbon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itinerary: itineraryToSave }),
        signal: AbortSignal.timeout(10000),
      });
      let finalItinerary = itineraryToSave;
      if (carbonRes.ok) {
        const carbonData = await carbonRes.json();
        finalItinerary = applyCarbonResult(itineraryToSave, {
          items: carbonData.items ?? [],
          total_kg: carbonData.total_kg ?? itineraryToSave.total_emission_kg,
        });
      }
      finalItinerary = {
        ...finalItinerary,
        interest_match_score: scoreItinerary(finalItinerary, {
          interests: ["culture", "outdoor"],
          budget_level: "mid",
          carbon_sensitivity: "medium",
          avoid_flying: false,
          party_size: 1,
        }),
      };

      const raw = window.localStorage.getItem(STORAGE_KEY);
      const list: (Itinerary & { confirmed?: boolean })[] = raw ? JSON.parse(raw) : [];
      const idx = list.findIndex((i) => i.id === itinerary.id);
      const confirmed = idx >= 0 ? list[idx]?.confirmed ?? false : false;
      const updated = { ...finalItinerary, confirmed };
      if (idx >= 0) {
        list[idx] = updated;
      } else {
        list.push(updated);
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      setItinerary(updated);
      if (session?.user) {
        fetch("/api/carbon/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            emissionKg: updated.total_emission_kg ?? 0,
            itineraryId: updated.id,
          }),
        }).catch(() => {});
      }
      router.replace(`/itinerary/${id}`);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const exitEditMode = () => {
    router.replace(`/itinerary/${id}`);
  };

  if (!itinerary) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--bg-primary)" }}>
        <div className="text-center">
          <p className="mb-4" style={{ color: "var(--text-muted)" }}>Itinerary not found.</p>
          <Link href="/" className="text-sm font-medium" style={{ color: "var(--accent-green)" }}>
            Back to map
          </Link>
        </div>
      </div>
    );
  }

  const transportKg = itinerary.days.reduce(
    (s, d) => s + d.transport.reduce((t, seg) => t + (seg.emission_kg ?? 0), 0),
    0
  );
  const activityKg = itinerary.days.reduce(
    (s, d) => s + d.activities.reduce((t, a) => t + (a.emission_kg ?? 0), 0),
    0
  );
  const hotelKg = itinerary.days.reduce(
    (s, d) =>
      s +
      (d.hotel?.emission_kg_per_night ?? HOTEL_FACTOR_PER_NIGHT),
    0
  );
  const totalKg = Math.max(0.01, transportKg + activityKg + hotelKg);

  const stars = Math.min(5, Math.max(1, Math.round(itinerary.interest_match_score * 5)));

  const selectedActivityIds = new Set(
    itinerary.days.flatMap((d) => d.activities.map((a) => a.id))
  );

  const firstDay = itinerary.days[0];
  const lastDay = itinerary.days[itinerary.days.length - 1];
  const arrivalFlight = firstDay?.transport.find(isFlight) ?? null;
  const departureFlight = lastDay?.transport.filter(isFlight).pop() ?? null;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      <header className="border-b sticky top-0 z-10 p-4 flex items-center justify-between" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <Link href="/" className="text-sm font-medium" style={{ color: "var(--accent-green)" }}>
          ← Back to map
        </Link>
        <h1 className="text-lg font-display font-semibold" style={{ color: "var(--text-primary)" }}>
          {itinerary.city} {isEditMode && "(Editing)"}
        </h1>
        <div className="flex items-center gap-2">
          {isEditMode ? (
            <>
              <button
                type="button"
                onClick={exitEditMode}
                className="px-3 py-1.5 text-sm font-medium rounded-lg border"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdits}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium rounded-lg text-white"
                style={{ background: "#2d6a4f" }}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </>
          ) : (
            <>
              <Link
                href={`/itinerary/${itinerary.id}?edit=1`}
                className="p-2 rounded-lg hover:bg-black/5 transition-colors"
                title="Edit trip"
                style={{ color: "var(--text-muted)" }}
              >
                <Pencil className="w-4 h-4" />
              </Link>
              <button
                type="button"
                onClick={handleDelete}
                className="p-2 rounded-lg hover:bg-red-100 transition-colors"
                title="Delete trip"
                style={{ color: "var(--text-muted)" }}
                aria-label="Delete trip"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Arrival flight - separate section at top */}
          {arrivalFlight && (
            <section className="rounded-2xl p-5" style={{ background: "var(--bg-elevated)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <h2 className="text-lg font-display font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                Arrival · {formatDate(firstDay!.date)}
              </h2>
              <TransportCard segment={arrivalFlight} />
            </section>
          )}

          {/* Daily plan - activities and inter-activity transit only */}
          {itinerary.days.map((day, dayIndex) => {
            const interActivityTransport = day.transport.filter((s) => !isFlight(s));
            return (
            <section key={day.date} className="rounded-2xl p-5" style={{ background: "var(--bg-elevated)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <h2 className="text-lg font-display font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                {formatDate(day.date)}
              </h2>

              {/* Hotel section */}
              {day.hotel && (
                <div className="mb-4 p-3 rounded-xl flex items-center justify-between gap-2" style={{ background: "var(--bg-surface)", borderLeft: "4px solid var(--accent-green-mid)" }}>
                  {day.hotel.image_url && (
                    <div className="w-12 h-12 rounded-lg flex-shrink-0 overflow-hidden bg-gray-200">
                      <img src={day.hotel.image_url} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">Hotel: {day.hotel.name}</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {hotelPriceTier(day.hotel.price_per_night_usd)}
                    </p>
                  </div>
                  {isEditMode && (
                    <button
                      type="button"
                      onClick={() => setChangeHotelOpen(true)}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-sm font-medium hover:bg-black/5"
                      style={{ color: "var(--accent-green)" }}
                    >
                      <Building2 className="w-4 h-4" />
                      Change
                    </button>
                  )}
                </div>
              )}

              {interActivityTransport.length > 0 && (
                <div className="space-y-3 mb-4">
                  <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                    Transit between activities
                    {isEditMode ? " · Click to select" : " · Recommended route"}
                  </p>
                  {interActivityTransport.map((seg) => (
                    <TransportLegOptions
                      key={seg.id}
                      segment={seg}
                      onSelectOption={
                        isEditMode
                          ? (updates) => updateTransportSegment(dayIndex, seg.id, updates)
                          : undefined
                      }
                    />
                  ))}
                </div>
              )}

              {/* Activities section */}
              <div
                className={`space-y-2 min-h-[60px] transition-colors rounded-xl ${isEditMode && dragOverDayIndex === dayIndex ? "ring-2 ring-dashed ring-[var(--accent-green)] bg-[var(--accent-green)]/5 p-2 -m-2" : ""}`}
                onDragOver={isEditMode ? (e) => handleDragOver(e, dayIndex) : undefined}
                onDragLeave={isEditMode ? handleDragLeave : undefined}
                onDrop={isEditMode ? (e) => handleDrop(e, dayIndex, day.activities.length) : undefined}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Activities</p>
                  {isEditMode && (
                    <button
                      type="button"
                      onClick={() => setAddActivityDayIndex(dayIndex)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium hover:bg-black/5"
                      style={{ color: "var(--accent-green)" }}
                    >
                      <Plus className="w-4 h-4" />
                      Add
                    </button>
                  )}
                </div>
                {day.activities.map((act, actIndex) => (
                  <div
                    key={act.id}
                    className={`relative group ${isEditMode ? "cursor-grab active:cursor-grabbing" : ""} ${isEditMode && dragOverActivityKey === `${dayIndex}-${actIndex}` ? "ring-2 ring-dashed ring-[var(--accent-green)] rounded-xl -m-0.5 p-0.5" : ""}`}
                    draggable={isEditMode}
                    onDragStart={isEditMode ? (e) => handleDragStart(e, dayIndex, act.id) : undefined}
                    onDragOver={isEditMode ? (e) => handleActivityDragOver(e, dayIndex, actIndex) : undefined}
                    onDragLeave={isEditMode ? handleDragLeave : undefined}
                    onDrop={isEditMode ? (e) => handleDrop(e, dayIndex, actIndex) : undefined}
                    onDragEnd={isEditMode ? () => { setDragOverDayIndex(null); setDragOverActivityKey(null); } : undefined}
                  >
                    <ActivityCard activity={act} />
                    {isEditMode && (
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        <div
                          className="p-1.5 rounded-lg hover:bg-black/5 cursor-grab active:cursor-grabbing"
                          title="Drag to move between days"
                          aria-label="Drag to move between days"
                        >
                          <GripVertical className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeActivity(dayIndex, act.id);
                          }}
                          className="p-1.5 rounded-lg hover:bg-red-100 transition-colors"
                          title="Remove activity"
                          aria-label="Remove activity"
                        >
                          <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
          })}
        </div>

        <aside className="space-y-6">
          <div className="rounded-2xl p-5 sticky top-24" style={{ background: "var(--bg-elevated)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold" style={{ color: "var(--text-primary)" }}>
                Carbon summary
              </h3>
              {isEditMode && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--accent-green-light)", color: "var(--accent-green)" }}>
                  Live
                </span>
              )}
            </div>
            <div className="w-32 h-32 mx-auto mb-4 relative">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="16" fill="none" stroke="var(--border)" strokeWidth="3" />
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke="var(--accent-green)"
                  strokeWidth="3"
                  strokeDasharray={`${(transportKg / totalKg) * 100} ${100 - (transportKg / totalKg) * 100}`}
                  strokeDashoffset="0"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke="var(--accent-amber)"
                  strokeWidth="3"
                  strokeDasharray={`${(activityKg / totalKg) * 100} ${100 - (activityKg / totalKg) * 100}`}
                  strokeDashoffset={-(transportKg / totalKg) * 100}
                />
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke="var(--accent-red)"
                  strokeWidth="3"
                  strokeDasharray={`${(hotelKg / totalKg) * 100} ${100 - (hotelKg / totalKg) * 100}`}
                  strokeDashoffset={-((transportKg + activityKg) / totalKg) * 100}
                />
              </svg>
            </div>
            <p className="text-center text-2xl font-display font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              {totalKg.toFixed(0)} kg CO₂e
            </p>
            <p className="text-center text-sm mb-4" style={{ color: "var(--text-muted)" }}>
              {itinerary.days.length} days
            </p>
            <div className="flex items-center justify-center gap-1 mb-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={`star-${i}`}
                  className="w-4 h-4"
                  fill={i < stars ? "var(--accent-amber)" : "transparent"}
                  style={{ color: i < stars ? "var(--accent-amber)" : "var(--border)" }}
                />
              ))}
            </div>
            {!isEditMode && (
              <div className="space-y-2">
                {(itinerary as { confirmed?: boolean }).confirmed !== true && (
                  <button
                    type="button"
                    onClick={handleConfirmTrip}
                    className="w-full py-3 rounded-xl font-medium text-white"
                    style={{ background: "#2d6a4f" }}
                  >
                    {session?.user ? "Confirm trip" : "Sign in to confirm trip"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (!originalItinerary) {
                      setOriginalItinerary(JSON.parse(JSON.stringify(itinerary)) as Itinerary);
                    }
                    setRegretOpen(true);
                  }}
                  className="w-full py-3 rounded-xl font-medium border"
                  style={{ borderColor: "var(--accent-green)", color: "var(--accent-green)" }}
                >
                  Find a lower-carbon version
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Add activity modal */}
      {addActivityDayIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setAddActivityDayIndex(null)}>
          <div
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--bg-surface)" }}
          >
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
              <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
                Add activity to {formatDate(itinerary.days[addActivityDayIndex]?.date ?? "")}
              </h3>
              <button type="button" onClick={() => setAddActivityDayIndex(null)} className="p-1 rounded-lg hover:bg-black/5">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <ActivitySelector
                activities={activities}
                selectedIds={selectedActivityIds}
                onToggle={(act) => addActivityToDay(act)}
                loading={activitiesLoading}
              />
            </div>
          </div>
        </div>
      )}

      {/* Change hotel modal */}
      {changeHotelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setChangeHotelOpen(false)}>
          <div
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--bg-surface)" }}
          >
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
              <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
                Change hotel
              </h3>
              <button type="button" onClick={() => setChangeHotelOpen(false)} className="p-1 rounded-lg hover:bg-black/5">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <HotelSelector
                hotels={hotels}
                selectedHotel={itinerary.days[0]?.hotel ?? null}
                onSelect={changeHotel}
                loading={hotelsLoading}
              />
            </div>
          </div>
        </div>
      )}

      {showSaveBanner && (
        <SavePreferencesBanner
          onSave={async () => ({ success: true })}
          onDismiss={() => setShowSaveBanner(false)}
        />
      )}

      {regretOpen && itinerary && originalItinerary && (
        <CarbonCompareModal
          itinerary={itinerary}
          originalItinerary={originalItinerary}
          onClose={() => setRegretOpen(false)}
          onKeepOriginal={() => {
            setItinerary(originalItinerary);
            const raw = window.localStorage.getItem(STORAGE_KEY);
            const list: StoredItinerary[] = raw ? JSON.parse(raw) : [];
            const idx = list.findIndex((i) => i.id === originalItinerary.id);
            if (idx >= 0) {
              list[idx] = {
                ...originalItinerary,
                confirmed: list[idx]!.confirmed,
                originalItinerary,
              };
              window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
            }
            setRegretOpen(false);
          }}
          onSwitch={(alt) => {
            setItinerary(alt);
            const raw = window.localStorage.getItem(STORAGE_KEY);
            const list: StoredItinerary[] = raw ? JSON.parse(raw) : [];
            const idx = list.findIndex((i) => i.id === alt.id);
            const existing = idx >= 0 ? list[idx]! : null;
            const entry: StoredItinerary = {
              ...alt,
              confirmed: existing?.confirmed,
              originalItinerary,
            };
            if (idx >= 0) list[idx] = entry;
            else list.push(entry);
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
            setRegretOpen(false);
          }}
        />
      )}
    </div>
  );
}

