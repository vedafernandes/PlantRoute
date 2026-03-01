"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { GeoPoint } from "@/types";
import type { Activity } from "@/types";
import type { NormalizedPlace } from "@/types";
import { normalizedPlaceToActivity } from "@/lib/places-utils";
import { LoadingRoute } from "@/components/UI/LoadingRoute";
import { activityPriceTier, formatPrice } from "@/lib/utils";
import {
  UtensilsCrossed,
  MapPin,
  TreePine,
  Moon,
  Heart,
  Mountain,
  Landmark,
  X,
} from "lucide-react";

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  museum: Landmark,
  restaurant: UtensilsCrossed,
  outdoor: Mountain,
  nature: TreePine,
  nightlife: Moon,
  wellness: Heart,
  default: MapPin,
};

interface CityModalProps {
  city: GeoPoint;
  onClose: () => void;
  onBuildItinerary: () => void;
}

export function CityModal({ city, onClose, onBuildItinerary }: CityModalProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [noPlacesMessage, setNoPlacesMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNoPlacesMessage(null);
    const cityName = city.name.split(",")[0]?.trim() ?? city.name;
    fetch(
      `/api/amadeus/activities?city=${encodeURIComponent(cityName)}&limit=5`,
      { signal: AbortSignal.timeout(10000) }
    )
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const raw = data.activities ?? [];
        if (data.message === "No real places found" || raw.length === 0) {
          setActivities([]);
          setNoPlacesMessage(data.message ?? "No real places found");
          return;
        }
        const asActivities = raw.map((a: NormalizedPlace | Activity) =>
          "type" in a && a.type === "attraction"
            ? normalizedPlaceToActivity(a as NormalizedPlace, cityName)
            : (a as Activity)
        );
        setActivities(asActivities);
      })
      .catch(() => {
        if (!cancelled) setActivities([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [city.name]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white/25 backdrop-blur-2xl border border-white/30 border-b-0 shadow-[0_-4px_40px_rgba(0,0,0,0.08)] flex flex-col"
        style={{ maxHeight: "42vh" }}
      >
        <div className="p-3 flex items-center justify-between border-b border-white/20 flex-shrink-0">
          <h2 className="text-lg font-display font-semibold" style={{ color: "var(--text-primary)" }}>
            {city.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:opacity-80"
            aria-label="Close"
          >
            <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        <div className="p-3 overflow-y-auto overflow-x-hidden flex-1 min-h-0" style={{ maxHeight: "calc(42vh - 110px)" }}>
          <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
            Top activities
          </p>
          {loading ? (
            <LoadingRoute />
          ) : (
            <div className="flex flex-wrap gap-3">
              {activities.map((act) => {
                const Icon = categoryIcons[act.category?.toLowerCase() ?? ""] ?? categoryIcons.default;
                return (
                  <div
                    key={act.id}
                    className="w-[150px] flex-shrink-0 rounded-xl overflow-hidden bg-white/25 backdrop-blur-xl border border-white/30"
                  >
                    <div className="w-full aspect-square bg-gray-200">
                      {act.image_url ? (
                        <img
                          src={act.image_url}
                          alt={act.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center"
                          style={{ color: "var(--accent-green)" }}
                        >
                          <Icon className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="font-medium text-sm truncate leading-tight" style={{ color: "var(--text-primary)" }}>
                        {act.name}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {act.price_tier ?? activityPriceTier(act.price_usd ?? 0)} · {act.duration_hours}h
                      </p>
                    </div>
                  </div>
                );
              })}
              {activities.length === 0 && !loading && (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {noPlacesMessage ?? "No activities found. You can still build an itinerary."}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-white/20 flex-shrink-0">
          <button
            type="button"
            onClick={onBuildItinerary}
            className="w-full py-2.5 px-4 rounded-xl text-sm font-medium text-white transition opacity-90 hover:opacity-100"
            style={{ background: "#2d6a4f" }}
          >
            Build Itinerary
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
