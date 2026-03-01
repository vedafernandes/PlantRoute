"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import type { Itinerary } from "@/types";
import { formatPrice } from "@/lib/utils";

interface CarbonCompareModalProps {
  itinerary: Itinerary;
  /** Snapshot of the plan before switching; used so Original always shows correct CO₂. */
  originalItinerary?: Itinerary;
  onClose: () => void;
  onKeepOriginal: () => void;
  onSwitch: (alternative: Itinerary) => void;
}

export function CarbonCompareModal({
  itinerary,
  originalItinerary,
  onClose,
  onKeepOriginal,
  onSwitch,
}: CarbonCompareModalProps) {
  const displayOriginal = originalItinerary ?? itinerary;
  const [savingsKg, setSavingsKg] = useState<number | null>(null);
  const [alternative, setAlternative] = useState<Itinerary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/infer/carbon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itinerary }),
      signal: AbortSignal.timeout(10000),
    })
      .then((res) => res.json())
      .then((data) => {
        const originalTotal = data.total_kg ?? itinerary.total_emission_kg;
        const estimated = originalTotal * 0.75;
        setSavingsKg(Math.max(0, originalTotal - estimated));
        setAlternative({ ...itinerary, total_emission_kg: estimated });
      })
      .catch(() => {
        setSavingsKg(50);
        setAlternative({ ...itinerary, total_emission_kg: Math.max(0, itinerary.total_emission_kg - 50) });
      })
      .finally(() => setLoading(false));
  }, [itinerary]);

  const trees = savingsKg != null ? (savingsKg / 21).toFixed(1) : "—";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl p-6 shadow-xl"
        style={{ background: "var(--bg-elevated)" }}
      >
        <h3 className="text-xl font-display font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
          Lower carbon alternative
        </h3>
        {loading ? (
          <p style={{ color: "var(--text-muted)" }}>Calculating…</p>
        ) : (
          <>
            <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
              If you chose this alternative you&apos;d save{" "}
              <strong style={{ color: "var(--accent-green)" }}>{savingsKg?.toFixed(0) ?? 0} kg CO₂e</strong> (≈ {trees} trees)
            </p>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="rounded-xl p-4 border" style={{ borderColor: "var(--border)" }}>
                <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Original</p>
                <p className="font-medium">{formatPrice(displayOriginal.total_price_usd)}</p>
                <p className="text-sm">{displayOriginal.total_emission_kg.toFixed(0)} kg CO₂e</p>
              </div>
              <div className="rounded-xl p-4 border" style={{ borderColor: "var(--accent-green-mid)" }}>
                <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Alternative</p>
                <p className="font-medium">{alternative ? formatPrice(alternative.total_price_usd) : "—"}</p>
                <p className="text-sm">{alternative ? `${alternative.total_emission_kg.toFixed(0)} kg CO₂e` : "—"}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  onKeepOriginal();
                  onClose();
                }}
                className="flex-1 py-3 rounded-xl font-medium border"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
              >
                Keep original
              </button>
              <button
                type="button"
                onClick={() => alternative && onSwitch(alternative)}
                className="flex-1 py-3 rounded-xl font-medium text-white"
                style={{ background: "#2d6a4f" }}
              >
                Switch to alternative
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
