"use client";

import { motion } from "framer-motion";
import type { Activity } from "@/types";
import { formatPrice } from "@/lib/utils";
import { Landmark, UtensilsCrossed, Mountain, TreePine, Moon, Heart } from "lucide-react";

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  museum: Landmark,
  restaurant: UtensilsCrossed,
  outdoor: Mountain,
  nature: TreePine,
  nightlife: Moon,
  wellness: Heart,
};

interface ActivityCardProps {
  activity: Activity;
}

export function ActivityCard({ activity }: ActivityCardProps) {
  const Icon = categoryIcons[activity.category?.toLowerCase() ?? ""] ?? Landmark;

  return (
    <motion.div
      whileHover={{ scale: 1.02, boxShadow: "0 8px 24px rgba(0,0,0,0.1)" }}
      className="rounded-xl p-4 border-t-4"
      style={{
        background: "var(--bg-elevated)",
        borderTopColor: "var(--accent-green-mid)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-14 h-14 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden bg-gray-200"
        >
          {activity.image_url ? (
            <img src={activity.image_url} alt={activity.name} className="w-full h-full object-cover" />
          ) : (
            <span style={{ color: "var(--accent-green)" }}>
              <Icon className="w-6 h-6" />
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium" style={{ color: "var(--text-primary)" }}>
            {activity.name}
          </h3>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            {activity.duration_hours}h · {activity.price_tier ?? formatPrice(activity.price_usd)}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
