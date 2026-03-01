"use client";

import { motion } from "framer-motion";
import type { Hotel } from "@/types";
import { CarbonBadge } from "@/components/UI/CarbonBadge";
import { formatPrice } from "@/lib/utils";
import { Star, Leaf } from "lucide-react";

interface HotelSelectorProps {
  hotels: Hotel[];
  selectedHotel: Hotel | null;
  onSelect: (hotel: Hotel) => void;
  loading?: boolean;
  emptyMessage?: string | null;
  /** When set, display total trip CO₂ (stay + transport to attractions) so it varies by distance. */
  numNights?: number;
}

export function HotelSelector({
  hotels,
  selectedHotel,
  onSelect,
  loading = false,
  emptyMessage = null,
  numNights,
}: HotelSelectorProps) {
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

  if (hotels.length === 0) {
    return (
      <p className="text-sm py-8 text-center" style={{ color: "var(--text-muted)" }}>
        {emptyMessage ?? "No hotels found. Try a different city or dates."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Choose your hotel. Lower-carbon options are shown first.
      </p>
      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {hotels.map((hotel, index) => {
          const isSelected = selectedHotel?.id === hotel.id;
          const stayPerNight = hotel.emission_kg_per_night ?? 15;
          const nights = numNights ?? 1;
          const transportKg = hotel.estimated_transport_kg ?? 0;
          const emission = stayPerNight * nights + transportKg;
          const isLowCarbon = index < 2 || (transportKg === 0 && stayPerNight <= 11);

          return (
            <motion.button
              key={hotel.id}
              type="button"
              onClick={() => onSelect(hotel)}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="w-full text-left rounded-xl p-4 border-2 transition-colors flex items-start gap-3"
              style={{
                background: isSelected ? "var(--accent-green-light)" : "var(--bg-elevated)",
                borderColor: isSelected ? "var(--accent-green)" : "var(--border)",
                boxShadow: isSelected ? "0 2px 12px rgba(45,106,79,0.15)" : "0 2px 8px rgba(0,0,0,0.04)",
              }}
            >
              {hotel.image_url && (
                <div className="w-16 h-16 rounded-lg flex-shrink-0 overflow-hidden bg-gray-200">
                  <img src={hotel.image_url} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex items-start justify-between gap-3 min-w-0 flex-1">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium" style={{ color: "var(--text-primary)" }}>
                      {hotel.name}
                    </h3>
                    {isLowCarbon && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{ background: "var(--accent-green)", color: "white" }}
                      >
                        <Leaf className="w-3 h-3" />
                        Lower carbon
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className="w-4 h-4"
                          fill={i < hotel.stars ? "var(--accent-amber)" : "transparent"}
                          style={{
                            color: i < hotel.stars ? "var(--accent-amber)" : "var(--border)",
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {formatPrice(hotel.price_per_night_usd)}/night
                    </span>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <CarbonBadge kg={emission} />
                  {transportKg > 0 && (
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      incl. transport to activities
                    </p>
                  )}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
