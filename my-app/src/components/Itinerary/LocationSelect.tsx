"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { GeoPoint } from "@/types";

const DEBOUNCE_MS = 280;

const DEFAULT_ORIGIN: GeoPoint = {
  lat: 41.8781,
  lng: -87.6298,
  name: "Chicago",
};

interface LocationSelectProps {
  value: GeoPoint | null;
  onChange: (city: GeoPoint) => void;
  placeholder?: string;
  label?: string;
}

export function LocationSelect({
  value,
  onChange,
  placeholder = "Search city...",
  label = "Start location",
}: LocationSelectProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GeoPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    const tid = setTimeout(() => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setLoading(true);
      fetch(`/api/geocode/autocomplete?q=${encodeURIComponent(q)}`, {
        signal: abortRef.current.signal,
      })
        .then((r) => r.json())
        .then((data: GeoPoint[]) => setSuggestions(Array.isArray(data) ? data : []))
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(tid);
      abortRef.current?.abort();
    };
  }, [query]);

  useEffect(() => {
    setDropdownOpen(query.trim().length >= 2 && (suggestions.length > 0 || loading));
  }, [query, suggestions.length, loading]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  const handleSelect = useCallback(
    (city: GeoPoint) => {
      setQuery("");
      setDropdownOpen(false);
      setEditing(false);
      onChange(city);
    },
    [onChange]
  );

  const displayValue = value?.name ?? "";
  const showInput = editing || !value || query.length > 0;

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block">
        <span className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <div className="flex gap-2">
          {value && !showInput ? (
            <div
              className="flex-1 rounded-lg border px-3 py-2 flex items-center justify-between"
              style={{
                borderColor: "var(--border)",
                background: "var(--bg-elevated)",
              }}
            >
              <span style={{ color: "var(--text-primary)" }}>{displayValue}</span>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs font-medium hover:underline"
                style={{ color: "var(--accent-green)" }}
              >
                Change
              </button>
            </div>
          ) : (
            <input
              type="text"
              value={showInput ? query : displayValue}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => value && setQuery("")}
              placeholder={placeholder}
              className="flex-1 rounded-lg border px-3 py-2"
              style={{ borderColor: "var(--border)" }}
            />
          )}
        </div>
      </label>
      {dropdownOpen && (
        <ul
          className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border shadow-lg z-20 py-1"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border)",
          }}
        >
          {loading ? (
            <li className="px-3 py-2 text-sm" style={{ color: "var(--text-muted)" }}>
              Searching...
            </li>
          ) : (
            suggestions.map((city) => (
              <li key={`${city.lat}-${city.lng}-${city.name}`}>
                <button
                  type="button"
                  onClick={() => handleSelect(city)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-black/5"
                  style={{ color: "var(--text-primary)" }}
                >
                  {city.name}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export { DEFAULT_ORIGIN };
