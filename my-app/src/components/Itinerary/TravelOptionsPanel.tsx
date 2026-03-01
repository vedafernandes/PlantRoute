"use client";

import { motion } from "framer-motion";
import type { TransportSegment } from "@/types";
import { CarbonBadge } from "@/components/UI/CarbonBadge";
import { formatPrice } from "@/lib/utils";
import { TransportCard } from "./TransportCard";

interface TravelOptionsPanelProps {
  arrivalOptions: TransportSegment[];
  departureOptions: TransportSegment[];
  selectedArrival: TransportSegment | null;
  selectedDeparture: TransportSegment | null;
  onSelectArrival: (seg: TransportSegment) => void;
  onSelectDeparture: (seg: TransportSegment) => void;
  interActivitySegments?: TransportSegment[];
  loading?: boolean;
}

export function TravelOptionsPanel({
  arrivalOptions,
  departureOptions,
  selectedArrival,
  selectedDeparture,
  onSelectArrival,
  onSelectDeparture,
  interActivitySegments = [],
  loading = false,
}: TravelOptionsPanelProps) {
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

  const interActivityTotal = interActivitySegments.reduce(
    (s, t) => s + (t.emission_kg ?? 0),
    0
  );
  const interActivityPrice = interActivitySegments.reduce(
    (s, t) => s + t.price_usd,
    0
  );
  const interActivityDist = interActivitySegments.reduce(
    (s, t) => s + (t.distance_km ?? 0),
    0
  );

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
          Travel to destination
        </h3>
        <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
          Flights plus lower-carbon alternatives (train, bus, drive). Sorted by carbon impact.
        </p>
        <div className="space-y-2">
          {arrivalOptions.length === 0 ? (
            <p className="text-sm py-4" style={{ color: "var(--text-muted)" }}>
              No options found. Check origin/destination codes.
            </p>
          ) : (
            arrivalOptions.map((seg) => {
              const isSelected = selectedArrival?.id === seg.id;
              return (
                <motion.button
                  key={seg.id}
                  type="button"
                  onClick={() => onSelectArrival(seg)}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className="w-full text-left"
                  style={{
                    opacity: isSelected ? 1 : 0.85,
                    border: isSelected ? "2px solid var(--accent-green)" : "2px solid transparent",
                    borderRadius: "0.75rem",
                  }}
                >
                  <TransportCard segment={seg} />
                </motion.button>
              );
            })
          )}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
          Travel back home
        </h3>
        <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
          Flights plus train, bus, or drive options.
        </p>
        <div className="space-y-2">
          {departureOptions.length === 0 ? (
            <p className="text-sm py-4" style={{ color: "var(--text-muted)" }}>
              No options found.
            </p>
          ) : (
            departureOptions.map((seg) => {
              const isSelected = selectedDeparture?.id === seg.id;
              return (
                <motion.button
                  key={seg.id}
                  type="button"
                  onClick={() => onSelectDeparture(seg)}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className="w-full text-left"
                  style={{
                    opacity: isSelected ? 1 : 0.85,
                    border: isSelected ? "2px solid var(--accent-green)" : "2px solid transparent",
                    borderRadius: "0.75rem",
                  }}
                >
                  <TransportCard segment={seg} />
                </motion.button>
              );
            })
          )}
        </div>
      </section>

      {interActivitySegments.length > 0 && (
        <section>
          <h3 className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
            Between activities (daily itinerary)
          </h3>
          <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
            Walking and transit between your chosen activities. Optimized for lower carbon.
          </p>
          <div
            className="rounded-xl p-4"
            style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
          >
            <div className="flex flex-wrap gap-4">
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                {interActivityDist.toFixed(1)} km total
              </span>
              <CarbonBadge kg={interActivityTotal} />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {formatPrice(interActivityPrice)}
              </span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
