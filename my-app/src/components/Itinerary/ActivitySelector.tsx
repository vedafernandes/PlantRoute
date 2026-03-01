"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import type { Activity } from "@/types";
import { ATTRACTION_TYPES } from "@/types";
import { getNormalizedCategory } from "@/lib/recommendations";
import { activityPriceTier } from "@/lib/utils";
import {
  Landmark,
  UtensilsCrossed,
  Mountain,
  TreePine,
  Moon,
  Heart,
  MapPin,
} from "lucide-react";

/** Icons for profile-style categories (ATTRACTION_TYPES). */
const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  museum: Landmark,
  culture: Landmark,
  food: UtensilsCrossed,
  outdoor: Mountain,
  nature: TreePine,
  nightlife: Moon,
  wellness: Heart,
  beach: Mountain,
  ski: Mountain,
};

interface ActivitySelectorProps {
  activities: (Activity & { fit_score?: number; explanation?: string[] | null })[];
  selectedIds: Set<string>;
  onToggle: (activity: Activity) => void;
  loading?: boolean;
}

export function ActivitySelector({
  activities,
  selectedIds,
  onToggle,
  loading = false,
}: ActivitySelectorProps) {
  const [activeCategory, setActiveCategory] = useState<string>("all");

  /** Tabs match profile: All + ATTRACTION_TYPES (museum, culture, outdoor, ...). */
  const categories = useMemo(() => ["all", ...ATTRACTION_TYPES], []);

  const filteredActivities = useMemo(() => {
    if (activeCategory === "all") return activities;
    return activities.filter(
      (a) => getNormalizedCategory(a.category ?? "") === activeCategory
    );
  }, [activities, activeCategory]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div
          className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin"
          style={{ borderColor: "var(--accent-green)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <p className="text-sm py-8 text-center" style={{ color: "var(--text-muted)" }}>
        No activities found. Try a different city.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Select activities you want to do. We&apos;ll arrange them into a daily plan.
      </p>

      {/* Category tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
        {categories.map((cat) => {
          const label = cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1);
          const isActive = activeCategory === cat;
          const count =
            cat === "all"
              ? activities.length
              : activities.filter(
                  (a) => getNormalizedCategory(a.category ?? "") === cat
                ).length;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className="flex-shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5"
              style={{
                background: isActive ? "var(--accent-green)" : "var(--bg-elevated)",
                color: isActive ? "white" : "var(--text-muted)",
                border: `1px solid ${isActive ? "var(--accent-green)" : "var(--border)"}`,
              }}
            >
              {label}
              <span
                className="opacity-80"
                style={{ fontSize: "0.7rem" }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {filteredActivities.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: "var(--text-muted)" }}>
            No activities in this category.
          </p>
        ) : (
          filteredActivities.map((activity) => {
          const isSelected = selectedIds.has(activity.id);
          const Icon =
            categoryIcons[getNormalizedCategory(activity.category ?? "")] ?? MapPin;
          const fitScore = "fit_score" in activity ? activity.fit_score : undefined;

          return (
            <motion.button
              key={activity.id}
              type="button"
              onClick={() => onToggle(activity)}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="w-full text-left rounded-xl p-4 border-2 transition-colors flex items-start gap-3"
              style={{
                background: isSelected ? "var(--accent-green-light)" : "var(--bg-elevated)",
                borderColor: isSelected ? "var(--accent-green)" : "var(--border)",
              }}
            >
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
                style={{ background: "var(--bg-surface)" }}
              >
                {activity.image_url ? (
                  <img
                    src={activity.image_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span style={{ color: "var(--accent-green)" }}>
                    <Icon className="w-6 h-6" />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {activity.name}
                  </h3>
                  {fitScore != null && (
                    <span
                      className="text-xs font-medium rounded-full px-2 py-0.5"
                      style={{
                        background: "var(--accent-green-light)",
                        color: "var(--accent-green)",
                      }}
                      title="Match to your interests"
                    >
                      {Math.round(fitScore * 100)}% match
                    </span>
                  )}
                </div>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {activity.duration_hours}h · {activity.price_tier ?? activityPriceTier(activity.price_usd ?? 0)}
                </p>
              </div>
              <div
                className="w-5 h-5 rounded-full border-2 flex-shrink-0 mt-1 flex items-center justify-center"
                style={{
                  borderColor: isSelected ? "var(--accent-green)" : "var(--border)",
                  background: isSelected ? "var(--accent-green)" : "transparent",
                }}
              >
                {isSelected && (
                  <span className="text-white text-xs font-bold">✓</span>
                )}
              </div>
            </motion.button>
          );
        })
        )}
      </div>
    </div>
  );
}
