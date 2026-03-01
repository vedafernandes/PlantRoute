"use client";

import { useState, useEffect } from "react";
import type { TransportSegment } from "@/types";
import { CarbonBadge } from "@/components/UI/CarbonBadge";
import { formatPrice } from "@/lib/utils";
import { getTransportOptions } from "@/lib/transport-options";
import { Footprints, Bus, Car, Check, Loader2 } from "lucide-react";

const modeConfig: Record<
  string,
  { Icon: typeof Footprints; label: string }
> = {
  walk: { Icon: Footprints, label: "Walk" },
  transit: { Icon: Bus, label: "Transit" },
  bus: { Icon: Bus, label: "Transit" },
  drive: { Icon: Car, label: "Drive" },
  car: { Icon: Car, label: "Drive" },
};

/** Maps option mode (transit, drive) to TransportSegment mode (bus, car). */
function optionModeToSegmentMode(mode: string): TransportSegment["mode"] {
  if (mode === "walk") return "walk";
  if (mode === "transit") return "bus";
  if (mode === "drive") return "car";
  return "bus";
}

function segmentModeToOptionMode(mode: TransportSegment["mode"]): string {
  if (mode === "walk") return "walk";
  if (mode === "bus") return "transit";
  if (mode === "car") return "drive";
  return "transit";
}

interface TransportLegOptionsProps {
  segment: TransportSegment;
  /** When provided and multiple options exist, allows user to select. Called with updated segment fields. */
  onSelectOption?: (updates: {
    mode: TransportSegment["mode"];
    duration_minutes: number;
    emission_kg: number;
    price_usd: number;
  }) => void;
}

type OptionForDisplay = {
  mode: string;
  duration_minutes: number;
  emission_kg: number;
  price_usd: number;
  isRecommended: boolean;
  distance_km?: number;
};

export function TransportLegOptions({ segment, onSelectOption }: TransportLegOptionsProps) {
  const distance_km = segment.distance_km ?? 0;
  const [options, setOptions] = useState<OptionForDisplay[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromGoogle, setFromGoogle] = useState(false);

  const origin = segment.origin as { lat?: number; lng?: number };
  const dest = segment.destination as { lat?: number; lng?: number };
  const hasCoords =
    typeof origin?.lat === "number" &&
    typeof origin?.lng === "number" &&
    typeof dest?.lat === "number" &&
    typeof dest?.lng === "number";

  useEffect(() => {
    if (!hasCoords || distance_km <= 0) {
      const staticOpts = getTransportOptions(distance_km || 1).map((o) => ({
        mode: o.mode,
        duration_minutes: o.duration_minutes,
        emission_kg: o.emission_kg,
        price_usd: o.price_usd,
        isRecommended: o.isRecommended,
      }));
      setOptions(staticOpts);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch("/api/directions/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: dest.lat, lng: dest.lng },
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.options?.length > 0 && !data.fallback) {
          setOptions(data.options);
          setFromGoogle(true);
        } else {
          const staticOpts = getTransportOptions(distance_km).map((o) => ({
            mode: o.mode,
            duration_minutes: o.duration_minutes,
            emission_kg: o.emission_kg,
            price_usd: o.price_usd,
            isRecommended: o.isRecommended,
          }));
          setOptions(staticOpts);
        }
      })
      .catch(() => {
        if (cancelled) return;
        const staticOpts = getTransportOptions(distance_km).map((o) => ({
          mode: o.mode,
          duration_minutes: o.duration_minutes,
          emission_kg: o.emission_kg,
          price_usd: o.price_usd,
          isRecommended: o.isRecommended,
        }));
        setOptions(staticOpts);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasCoords, origin?.lat, origin?.lng, dest?.lat, dest?.lng, distance_km]);

  const displayOptions = options ?? getTransportOptions(distance_km || 1).map((o) => ({
    mode: o.mode,
    duration_minutes: o.duration_minutes,
    emission_kg: o.emission_kg,
    price_usd: o.price_usd,
    isRecommended: o.isRecommended,
  }));

  const selectedOptionMode = segmentModeToOptionMode(segment.mode);
  const canSelect = onSelectOption != null && displayOptions.length > 1;

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}
    >
      <p className="font-medium text-sm mb-3" style={{ color: "var(--text-primary)" }}>
        {segment.origin.name} → {segment.destination.name}
        {(distance_km > 0 || (displayOptions[0] as { distance_km?: number })?.distance_km) && (
          <span className="font-normal ml-1" style={{ color: "var(--text-muted)" }}>
            · {((distance_km || (displayOptions[0] as { distance_km?: number })?.distance_km) ?? 0).toFixed(1)} km
          </span>
        )}
      </p>
      <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
        {fromGoogle ? "Transit options · Google Maps" : "Transit options"}
        {canSelect && " · Click to select"}
      </p>
      {loading ? (
        <div className="flex items-center gap-2 py-4" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading route options…</span>
        </div>
      ) : (
      <div className="flex flex-wrap gap-2">
        {displayOptions.map((opt) => {
          const { Icon, label } = modeConfig[opt.mode] ?? modeConfig.car;
          const isSelected = selectedOptionMode === opt.mode;
          const isRecommended = opt.isRecommended;
          // Selected takes precedence; recommended gets its own highlight when not selected
          const highlightType = isSelected ? "selected" : isRecommended ? "recommended" : "none";
          const handleClick = () => {
            if (canSelect) {
              onSelectOption?.({
                mode: optionModeToSegmentMode(opt.mode),
                duration_minutes: opt.duration_minutes,
                emission_kg: opt.emission_kg,
                price_usd: opt.price_usd,
              });
            }
          };
          const borderColor =
            highlightType === "selected"
              ? "var(--accent-green)"
              : highlightType === "recommended"
                ? "var(--accent-amber)"
                : "var(--border)";
          const bgColor =
            highlightType === "selected"
              ? "rgba(45, 106, 79, 0.12)"
              : highlightType === "recommended"
                ? "rgba(212, 124, 15, 0.12)"
                : "var(--bg-surface)";
          const iconColor =
            highlightType === "selected"
              ? "var(--accent-green)"
              : highlightType === "recommended"
                ? "var(--accent-amber)"
                : "var(--text-muted)";
          return (
            <button
              key={opt.mode}
              type="button"
              onClick={canSelect ? handleClick : undefined}
              disabled={!canSelect}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
                canSelect ? "cursor-pointer hover:opacity-90" : "cursor-default"
              }`}
              style={{ borderColor, background: bgColor }}
            >
              <Icon className="w-4 h-4 flex-shrink-0" style={{ color: iconColor }} />
              <div className="flex flex-col">
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {label}
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {Math.floor(opt.duration_minutes / 60)}h {opt.duration_minutes % 60}m
                  {opt.price_usd > 0 && ` · ${formatPrice(opt.price_usd)}`}
                </span>
              </div>
              <CarbonBadge kg={opt.emission_kg} />
              {isSelected && canSelect && (
                <span
                  className="flex items-center gap-1 text-xs font-medium"
                  style={{ color: "var(--accent-green)" }}
                >
                  <Check className="w-3.5 h-3.5" />
                  Selected
                </span>
              )}
              {isRecommended && !isSelected && canSelect && (
                <span
                  className="flex items-center gap-1 text-xs font-medium"
                  style={{ color: "var(--accent-amber)" }}
                >
                  Recommended
                </span>
              )}
              {isRecommended && !canSelect && (
                <span
                  className="flex items-center gap-1 text-xs font-medium"
                  style={{ color: "var(--accent-green)" }}
                >
                  <Check className="w-3.5 h-3.5" />
                  Recommended
                </span>
              )}
            </button>
          );
        })}
      </div>
      )}
    </div>
  );
}
