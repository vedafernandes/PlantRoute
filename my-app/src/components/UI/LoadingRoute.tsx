"use client";

import { motion } from "framer-motion";

export function LoadingRoute() {
  return (
    <div className="space-y-3 rounded-xl p-4" style={{ background: "var(--bg-elevated)" }}>
      {[1, 2, 3].map((i) => (
        <motion.div
          key={`loading-skeleton-${i}`}
          className="h-10 rounded-lg"
          style={{ background: "var(--border)" }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}
