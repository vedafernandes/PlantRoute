"use client";

import { motion } from "framer-motion";
import type { Itinerary } from "@/types";
import { CarbonBadge } from "@/components/UI/CarbonBadge";
import { Star } from "lucide-react";

interface ItineraryCardProps {
  itinerary: Itinerary;
  variant: "best_match" | "low_carbon" | "premium";
  onSelect: () => void;
  onLowerCarbon: () => void;
}

const labels = {
  best_match: "Best match",
  low_carbon: "Low carbon",
  premium: "Premium",
};

export function ItineraryCard({
  itinerary,
  variant,
  onSelect,
  onLowerCarbon,
}: ItineraryCardProps) {
  const stars = Math.min(5, Math.max(1, Math.round(itinerary.interest_match_score * 5)));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-5 border flex flex-col"
      style={{
        background: "var(--bg-elevated)",
        borderColor: "var(--border)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-sm font-medium px-2 py-1 rounded"
          style={{ background: "var(--accent-green-light)", color: "var(--accent-green)" }}
        >
          {labels[variant]}
        </span>
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={`star-${i}`}
              className="w-4 h-4"
              fill={i < stars ? "var(--accent-amber)" : "transparent"}
              style={{ color: i < stars ? "var(--accent-amber)" : "var(--border)" }}
            />
          ))}
        </div>
      </div>
      <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
        {itinerary.days.length} days
      </p>
      <div className="mb-4">
        <CarbonBadge kg={itinerary.total_emission_kg} />
      </div>
      <div className="mt-auto space-y-2">
        <button
          type="button"
          onClick={onLowerCarbon}
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
          onClick={onSelect}
          className="w-full py-3 px-4 rounded-xl font-medium text-white"
          style={{ background: "#2d6a4f" }}
        >
          Select this
        </button>
      </div>
    </motion.div>
  );
}
