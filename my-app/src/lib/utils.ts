import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatPrice(usd: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(usd);
}

/** Relative price tier for hotels: $ to $$$$ from approximate per-night USD. */
export function hotelPriceTier(pricePerNightUsd: number): string {
  if (pricePerNightUsd <= 0) return "—";
  if (pricePerNightUsd < 100) return "$";
  if (pricePerNightUsd < 200) return "$$";
  if (pricePerNightUsd < 350) return "$$$";
  return "$$$$";
}

/** Relative price tier for attractions/activities: $ to $$$$ from approximate USD. */
export function activityPriceTier(priceUsd: number): string {
  if (priceUsd < 15) return "$";
  if (priceUsd < 40) return "$$";
  if (priceUsd < 80) return "$$$";
  return "$$$$";
}

export function formatCarbon(kg: number): string {
  return `${kg.toFixed(1)} kg CO₂e`;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}
