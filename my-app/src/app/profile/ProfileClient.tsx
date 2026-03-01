"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { TreePine, Trash2, Pencil, LogOut } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { TravelPreferencesForm } from "@/components/Profile/TravelPreferencesForm";
import { ATTRACTION_TYPES, DEFAULT_TRAVEL_PREFERENCES, type UserPreferences } from "@/types";
import { KG_PER_TREE, BASELINE_PER_TRIP_KG } from "@/lib/carbon";

const STORAGE_KEY = "plantroute_itineraries";

type TabId = "overview" | "preferences";
type TripsView = "past" | "saved";

interface TripItem {
  id: string;
  city: string;
  date: string;
  kg: number;
}

interface ProfileClientProps {
  user?: { name: string | null; image: string | null } | null;
}

export default function ProfileClient({ user: userProp }: ProfileClientProps) {
  const { data: session } = useSession();
  const user = userProp ?? (session?.user ? { name: session.user.name ?? null, image: session.user.image ?? null } : null);

  const { profile, loading, load, savePreferences } = useProfile();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [tripsView, setTripsView] = useState<TripsView>("saved");
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [hasEditedPreferences, setHasEditedPreferences] = useState(false);
  const [allTrips, setAllTrips] = useState<TripItem[]>([]);
  const [saved, setSaved] = useState(false);

  const loadTrips = useCallback(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    setAllTrips(
      list
        .filter((it: { confirmed?: boolean }) => it.confirmed !== false)
        .map((it: { id: string; city: string; start_date: string; total_emission_kg: number }) => ({
          id: it.id,
          city: it.city,
          date: it.start_date,
          kg: it.total_emission_kg ?? 0,
        }))
    );
  }, []);

  useEffect(() => {
    loadTrips();
  }, [activeTab, loadTrips]);

  const handleDeleteTrip = useCallback((tripId: string) => {
    if (typeof window === "undefined") return;
    if (!confirm("Delete this trip? This cannot be undone.")) return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list: { id: string; confirmed?: boolean }[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((it) => it.id !== tripId);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    loadTrips();
  }, [loadTrips]);

  const today = new Date().toISOString().slice(0, 10);
  const pastTrips = allTrips.filter((t) => t.date < today);
  const savedItineraries = allTrips.filter((t) => t.date >= today);
  const displayedTrips =
    tripsView === "past" ? pastTrips : [...savedItineraries].reverse();

  useEffect(() => {
    load();
  }, [load]);

  const effectivePreferences: UserPreferences | null =
    !hasEditedPreferences && profile
      ? {
          ...profile.preferences,
          travel: profile.preferences.travel
            ? { ...DEFAULT_TRAVEL_PREFERENCES, ...profile.preferences.travel }
            : DEFAULT_TRAVEL_PREFERENCES,
        }
      : preferences;

  const handleSave = async () => {
    if (!effectivePreferences) return;
    const result = await savePreferences(effectivePreferences);
    if (result.success) setSaved(true);
  };

  const totalActualKg = allTrips.reduce((sum, t) => sum + t.kg, 0);
  const baselineKg = BASELINE_PER_TRIP_KG * allTrips.length;
  const savedKg = Math.max(0, baselineKg - totalActualKg);
  const treesSaved = Math.floor(savedKg / KG_PER_TREE);

  if (loading && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-primary)" }}>
        <p style={{ color: "var(--text-muted)" }}>Loading profile…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto" style={{ background: "var(--bg-primary)" }}>
      <Link href="/" className="text-sm font-medium mb-6 inline-block" style={{ color: "var(--accent-green)" }}>
        ← Back to map
      </Link>

      <header className="flex flex-col items-center mb-8">
        <div
          className="w-20 h-20 rounded-full border-2 overflow-hidden mb-3 flex-shrink-0"
          style={{ borderColor: "var(--border)" }}
        >
          {user?.image ? (
            <img src={user.image} alt={user.name || "Profile"} className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full rounded-full"
              style={{ background: "var(--bg-elevated)" }}
            />
          )}
        </div>
        <h1 className="text-2xl font-display font-semibold text-center" style={{ color: "var(--text-primary)" }}>
          {user?.name ?? "Profile"}
        </h1>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors hover:bg-red-50"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          <LogOut className="w-4 h-4" />
          Log out
        </button>
      </header>

      <div
        className="flex gap-1 p-1 rounded-xl mb-6"
        style={{ background: "var(--bg-elevated)" }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: activeTab === "overview" ? "var(--accent-green)" : "transparent",
            color: activeTab === "overview" ? "white" : "var(--text-muted)",
          }}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("preferences")}
          className="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: activeTab === "preferences" ? "var(--accent-green)" : "transparent",
            color: activeTab === "preferences" ? "white" : "var(--text-muted)",
          }}
        >
          Preferences
        </button>
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          <section
            className="rounded-2xl p-5 border"
            style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-3 mb-2">
              <TreePine className="w-8 h-8" style={{ color: "var(--accent-green)" }} />
              <h2 className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
                Trees saved
              </h2>
            </div>
            <p className="text-3xl font-display font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              {treesSaved}
            </p>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              You&apos;ve saved the equivalent of <strong>{treesSaved} tree{treesSaved !== 1 ? "s" : ""}</strong> by
              choosing lower-carbon travel.
            </p>
          </section>

          <section
            className="rounded-2xl p-5 border"
            style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
                Trips
              </h2>
              <div
                className="flex gap-1 p-1 rounded-lg"
                style={{ background: "var(--bg-primary)" }}
              >
                <button
                  type="button"
                  onClick={() => setTripsView("saved")}
                  className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                  style={{
                    background: tripsView === "saved" ? "var(--accent-green)" : "transparent",
                    color: tripsView === "saved" ? "white" : "var(--text-muted)",
                  }}
                >
                  Saved itineraries
                </button>
                <button
                  type="button"
                  onClick={() => setTripsView("past")}
                  className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                  style={{
                    background: tripsView === "past" ? "var(--accent-green)" : "transparent",
                    color: tripsView === "past" ? "white" : "var(--text-muted)",
                  }}
                >
                  Past trips
                </button>
              </div>
            </div>
            <ul className="space-y-2">
              {displayedTrips.map((trip) => (
                <li
                  key={trip.id}
                  className="group flex items-center gap-2 rounded-xl p-4 border hover:bg-black/5 transition-colors"
                  style={{ borderColor: "var(--border)" }}
                >
                  <Link href={`/itinerary/${trip.id}`} className="flex-1 min-w-0">
                    <span className="font-medium">{trip.city}</span>
                    <span className="text-sm ml-2" style={{ color: "var(--text-muted)" }}>
                      {trip.date} · {trip.kg.toFixed(0)} kg CO₂e
                    </span>
                  </Link>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link
                      href={`/itinerary/${trip.id}?edit=1`}
                      className="p-2 rounded-lg hover:bg-black/10 transition-colors"
                      title="Edit trip"
                      style={{ color: "var(--text-muted)" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Pencil className="w-4 h-4" />
                    </Link>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        handleDeleteTrip(trip.id);
                      }}
                      className="p-2 rounded-lg hover:bg-red-100 transition-colors"
                      title="Delete trip"
                      style={{ color: "var(--text-muted)" }}
                      aria-label="Delete trip"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
              {displayedTrips.length === 0 && (
                <p className="text-sm py-4" style={{ color: "var(--text-muted)" }}>
                  {tripsView === "past"
                    ? "No past trips yet. Trips with start dates before today will appear here."
                    : "No saved itineraries. Build an itinerary from the map to save it for later."}
                </p>
              )}
            </ul>
          </section>
        </div>
      )}

      {activeTab === "preferences" && (
        <div className="space-y-8">
          <section>
            <h2 className="text-lg font-medium mb-3" style={{ color: "var(--text-primary)" }}>
              Travel Preferences
            </h2>
            <TravelPreferencesForm
              value={effectivePreferences?.travel ?? DEFAULT_TRAVEL_PREFERENCES}
              onChange={(travel) => {
                setHasEditedPreferences(true);
                setPreferences((prev) =>
                  prev
                    ? { ...prev, travel }
                    : {
                        ...(profile?.preferences ?? {
                          interests: [],
                          budget_level: "mid",
                          carbon_sensitivity: "medium",
                          avoid_flying: false,
                          party_size: 1,
                        }),
                        travel,
                      }
                );
              }}
              showTitle={false}
            />
          </section>

          <section>
            <h2 className="text-lg font-medium mb-3" style={{ color: "var(--text-primary)" }}>
              Attraction types you like
            </h2>
            <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
              Select the kinds of attractions you enjoy (we&apos;ll use this to recommend activities).
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              {ATTRACTION_TYPES.map((type) => {
                const selected = effectivePreferences?.interests?.includes(type) ?? false;
                return (
                  <button
                    key={type}
                    type="button"
                    className="rounded-full px-3 py-1.5 text-sm border transition-colors capitalize"
                    style={{
                      borderColor: selected ? "var(--accent-green)" : "var(--border)",
                      background: selected ? "var(--accent-green-light)" : "transparent",
                      color: selected ? "var(--accent-green)" : "var(--text-primary)",
                    }}
                    onClick={() => {
                      setHasEditedPreferences(true);
                      const current = effectivePreferences?.interests ?? [];
                      const next = selected
                        ? current.filter((i) => i !== type)
                        : [...current, type];
                      setPreferences((prev) =>
                        prev
                          ? { ...prev, interests: next }
                          : {
                              ...(profile?.preferences ?? {
                                interests: [],
                                budget_level: "mid",
                                carbon_sensitivity: "medium",
                                avoid_flying: false,
                                party_size: 1,
                              }),
                              interests: next,
                            }
                      );
                    }}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={handleSave}
              className="py-2 px-4 rounded-xl font-medium text-white"
              style={{ background: "#2d6a4f" }}
            >
              {saved ? "Saved" : "Save changes"}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
