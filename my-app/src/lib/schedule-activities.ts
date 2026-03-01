/**
 * Schedules selected activities into daily plans, optimizing for:
 * - Geographic proximity (cluster nearby activities on the same day)
 * - Lower carbon (prefer walking for short distances, minimize hotel round-trips)
 *
 * Uses k-means clustering to group activities by location, then assigns each
 * cluster to a day so that each day focuses on one area—reducing inter-activity
 * and hotel↔activity travel emissions.
 */
import type { Activity, Hotel, ItineraryDay, TransportSegment } from "@/types";
import { addDays, format, parseISO } from "date-fns";
import { haversine } from "./haversine";
import { EMISSION_FACTORS } from "./carbon";

const WALK_THRESHOLD_KM = 2;
const BUS_FACTOR = EMISSION_FACTORS.bus ?? 0.08;
const WALK_SPEED_KMH = 4;
const BUS_SPEED_KMH = 20;
const BUS_PRICE_PER_KM = 0.15;
const K_MEANS_MAX_ITERS = 30;

function dist(origin: { lat: number; lng: number }, dest: { lat: number; lng: number }): number {
  return haversine(origin.lat, origin.lng, dest.lat, dest.lng);
}

/**
 * Cluster activities by geographic proximity using k-means.
 * Returns clusters of activities that are close together.
 */
function clusterActivitiesByLocation(
  activities: Activity[],
  k: number,
  hotelLocation: { lat: number; lng: number }
): Activity[][] {
  if (activities.length === 0) return [];
  if (k <= 1) return [activities];
  if (activities.length <= k) return activities.map((a) => [a]);

  // K-means++ initialization: spread centroids to avoid empty clusters
  const centroids: { lat: number; lng: number }[] = [];
  const firstIdx = activities.reduce(
    (best, a, i) =>
      dist(a.location, hotelLocation) < dist(activities[best].location, hotelLocation) ? i : best,
    0
  );
  centroids.push({
    lat: activities[firstIdx].location.lat,
    lng: activities[firstIdx].location.lng,
  });

  for (let c = 1; c < k; c++) {
    let bestIdx = -1;
    let bestDist = -1;
    for (let i = 0; i < activities.length; i++) {
      const minDistToCentroid = Math.min(
        ...centroids.map((ct) => dist(activities[i].location, ct))
      );
      if (minDistToCentroid > bestDist) {
        bestDist = minDistToCentroid;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      centroids.push({
        lat: activities[bestIdx].location.lat,
        lng: activities[bestIdx].location.lng,
      });
    }
  }

  const assignments = new Array(activities.length).fill(0);

  for (let iter = 0; iter < K_MEANS_MAX_ITERS; iter++) {
    for (let i = 0; i < activities.length; i++) {
      let best = 0;
      let bestD = dist(activities[i].location, centroids[0]);
      for (let c = 1; c < centroids.length; c++) {
        const d = dist(activities[i].location, centroids[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assignments[i] = best;
    }

    const newCentroids: { lat: number; lng: number }[] = [];
    for (let c = 0; c < centroids.length; c++) {
      const pts = activities.filter((_, i) => assignments[i] === c);
      if (pts.length === 0) {
        newCentroids.push(centroids[c]);
        continue;
      }
      newCentroids.push({
        lat: pts.reduce((s, p) => s + p.location.lat, 0) / pts.length,
        lng: pts.reduce((s, p) => s + p.location.lng, 0) / pts.length,
      });
    }
    let converged = true;
    for (let c = 0; c < centroids.length; c++) {
      if (dist(centroids[c], newCentroids[c]) > 0.001) converged = false;
    }
    for (let c = 0; c < centroids.length; c++) centroids[c] = newCentroids[c];
    if (converged) break;
  }

  const clusters: Activity[][] = Array.from({ length: centroids.length }, () => []);
  for (let i = 0; i < activities.length; i++) {
    clusters[assignments[i]].push(activities[i]);
  }
  return clusters.filter((c) => c.length > 0);
}

/**
 * Assign clusters to days. One cluster per day when possible. Order by centroid
 * distance from hotel (closer areas first) to reduce carbon from first-day travel.
 * Merge closest clusters if we have more clusters than days.
 */
function assignClustersToDays(
  clusters: Activity[][],
  dayCount: number,
  hotelLocation: { lat: number; lng: number }
): Activity[][] {
  if (clusters.length === 0) return [];

  let working = clusters.map((c) => ({
    activities: c,
    centroid: {
      lat: c.reduce((s, a) => s + a.location.lat, 0) / c.length,
      lng: c.reduce((s, a) => s + a.location.lng, 0) / c.length,
    },
  }));

  while (working.length > dayCount) {
    let mergeA = 0;
    let mergeB = 1;
    let bestDist = dist(working[0].centroid, working[1].centroid);
    for (let i = 0; i < working.length; i++) {
      for (let j = i + 1; j < working.length; j++) {
        const d = dist(working[i].centroid, working[j].centroid);
        if (d < bestDist) {
          bestDist = d;
          mergeA = i;
          mergeB = j;
        }
      }
    }
    const merged = [
      ...working[mergeA].activities,
      ...working[mergeB].activities,
    ];
    const newCentroid = {
      lat: merged.reduce((s, a) => s + a.location.lat, 0) / merged.length,
      lng: merged.reduce((s, a) => s + a.location.lng, 0) / merged.length,
    };
    working = working.filter((_, i) => i !== mergeA && i !== mergeB);
    working.push({ activities: merged, centroid: newCentroid });
  }

  working.sort(
    (a, b) => dist(a.centroid, hotelLocation) - dist(b.centroid, hotelLocation)
  );

  const result: Activity[][] = Array.from({ length: dayCount }, () => []);
  working.forEach(({ activities }, i) => {
    result[i] = activities;
  });
  return result;
}

/** Nearest-neighbor ordering from hotel, minimizing total travel. */
function orderActivitiesByProximity(
  activities: Activity[],
  hotelLocation: { lat: number; lng: number }
): Activity[] {
  if (activities.length <= 1) return [...activities];
  const ordered: Activity[] = [];
  let remaining = [...activities];
  let current = hotelLocation;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = dist(current, remaining[0].location);
    for (let i = 1; i < remaining.length; i++) {
      const d = dist(current, remaining[i].location);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = remaining[bestIdx];
    ordered.push(next);
    current = next.location;
    remaining.splice(bestIdx, 1);
  }
  return ordered;
}

function createTransportSegment(
  origin: { lat: number; lng: number; name: string },
  dest: { lat: number; lng: number; name: string },
  id: string
): TransportSegment {
  const distance_km = dist(origin, dest);
  const isWalk = distance_km <= WALK_THRESHOLD_KM;
  const mode = isWalk ? "walk" : "bus";
  const emission_kg = isWalk ? 0 : Math.round(distance_km * BUS_FACTOR * 1000) / 1000;
  const duration_minutes = isWalk
    ? Math.ceil((distance_km / WALK_SPEED_KMH) * 60)
    : Math.ceil((distance_km / BUS_SPEED_KMH) * 60);
  const price_usd = isWalk ? 0 : Math.round(distance_km * BUS_PRICE_PER_KM * 100) / 100;

  return {
    id,
    mode,
    origin: { ...origin, lat: origin.lat, lng: origin.lng },
    destination: { ...dest, lat: dest.lat, lng: dest.lng },
    distance_km: Math.round(distance_km * 100) / 100,
    emission_kg,
    price_usd,
    duration_minutes: Math.max(5, duration_minutes),
  };
}

export function scheduleSelectedActivities(
  activities: Activity[],
  startDate: string,
  endDate: string,
  hotel: Hotel
): ItineraryDay[] {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const dayCount = Math.min(
    14,
    Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)))
  );

  const hotelLoc = hotel.location;
  const days: ItineraryDay[] = [];

  const k = Math.min(dayCount, Math.max(1, activities.length));
  const clusters = clusterActivitiesByLocation(activities, k, hotelLoc);
  const dayActivityLists = assignClustersToDays(clusters, dayCount, hotelLoc);

  for (let d = 0; d < dayCount; d++) {
    const date = format(addDays(start, d), "yyyy-MM-dd");
    const dayActivities = dayActivityLists[d] ?? [];

    const ordered = orderActivitiesByProximity(dayActivities, hotelLoc);
    const transport: TransportSegment[] = [];

    let prevLoc = hotelLoc;
    let prevName = hotel.name;
    for (let i = 0; i < ordered.length; i++) {
      const act = ordered[i];
      transport.push(
        createTransportSegment(
          { ...prevLoc, lat: prevLoc.lat, lng: prevLoc.lng, name: prevName },
          { ...act.location, lat: act.location.lat, lng: act.location.lng, name: act.name },
          `seg-${date}-${i}-to-${act.id}`
        )
      );
      prevLoc = act.location;
      prevName = act.name;
    }
    if (ordered.length > 0) {
      transport.push(
        createTransportSegment(
          { ...prevLoc, lat: prevLoc.lat, lng: prevLoc.lng, name: prevName },
          { ...hotelLoc, lat: hotelLoc.lat, lng: hotelLoc.lng, name: hotel.name },
          `seg-${date}-return-hotel`
        )
      );
    }

    days.push({
      date,
      activities: ordered,
      transport,
      hotel,
    });
  }

  return days;
}
