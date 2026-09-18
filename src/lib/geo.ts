import type { JourneyMileage, TransportMode } from "../types/domain";

interface Coordinate {
  latitude: number;
  longitude: number;
}

/** Mean Earth radius (km). */
const EARTH_RADIUS_KM = 6371.0088;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance in kilometres (haversine). The `atan2` central-angle
 * formulation is wrap-safe across the antimeridian, so no longitude splitting
 * is needed — unlike the rendered journey line, which splits only to keep the
 * drawn segment short (Wishlist & mileage handoff §5.1).
 */
export function haversineKm(a: Coordinate, b: Coordinate): number {
  const phi1 = toRadians(a.latitude);
  const phi2 = toRadians(b.latitude);
  const deltaPhi = toRadians(b.latitude - a.latitude);
  const deltaLambda = toRadians(b.longitude - a.longitude);
  const sinPhi = Math.sin(deltaPhi / 2);
  const sinLambda = Math.sin(deltaLambda / 2);
  const haversine = sinPhi * sinPhi + Math.cos(phi1) * Math.cos(phi2) * sinLambda * sinLambda;
  // Floating-point rounding can push h a hair above 1 for near-antipodal pairs,
  // and sqrt(1 - h) would then be NaN. Clamp to the valid [0, 1] range.
  const clamped = Math.min(1, Math.max(0, haversine));
  const centralAngle = 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
  return EARTH_RADIUS_KM * centralAngle;
}

interface MileageStop {
  latitude: number;
  longitude: number;
  transportMode: TransportMode | null;
}

/**
 * Assembles per-leg, per-mode and total great-circle distance for a journey's
 * ordered stops. `null` when there are fewer than two stops. The first stop's
 * transport mode is ignored — it has no arriving leg (handoff §2.2).
 */
export function journeyMileage(stops: MileageStop[]): JourneyMileage | null {
  if (stops.length < 2) return null;
  const legs: JourneyMileage["legs"] = [];
  const byModeMap = new Map<TransportMode | null, number>();
  let totalKm = 0;
  for (let index = 1; index < stops.length; index += 1) {
    const start = stops[index - 1];
    const end = stops[index];
    const km = haversineKm(start, end);
    const mode = end.transportMode;
    legs.push({ mode, km });
    byModeMap.set(mode, (byModeMap.get(mode) ?? 0) + km);
    totalKm += km;
  }
  const byMode = [...byModeMap.entries()]
    .map(([mode, km]) => ({ mode, km }))
    .sort((a, b) => {
      if (a.mode === null) return 1;
      if (b.mode === null) return -1;
      return b.km - a.km;
    });
  return { totalKm, byMode, legs };
}
