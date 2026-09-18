/**
 * Pure distance/time math for the Flight archive (handoff §4).
 *
 * Every derived value a Flight stores — great-circle distance `d`, route factor
 * `k`, route distance `D`, estimated duration `T` and the domestic/international
 * flag — comes from these functions, computed on the server at write time. The
 * browser never supplies any of them (handoff §4.5).
 */

/** Mean Earth radius in kilometres, IUGG value (handoff §4.1). */
export const EARTH_RADIUS_KM = 6371.0088;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * A coordinate pair the server needs to derive Flight metrics: the two airports
 * as stored, with their ISO 3166-1 alpha-3 country codes for the domestic rule
 * (handoff §4.5).
 */
export interface FlightEndpoint extends Coordinates {
  countryCode: string;
}

export interface FlightMetrics {
  greatCircleKm: number;
  routeFactor: number;
  routeDistanceKm: number;
  estimatedHours: number;
  formulaVersion: 1;
  isDomestic: boolean;
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance between two WGS84 points (handoff §4.1).
 *
 * Standard Haversine. The `sin²` of the longitude half-delta is periodic, so a
 * hop across the ±180° antimeridian — e.g. 179.5° to −179.5° — measures the
 * short 1° arc rather than the long 359° one. The `a` term is clamped to
 * `[0, 1]` because near-antipodal inputs can round `a` a hair above 1 and push
 * `sqrt(1 - a)` imaginary.
 */
export function haversineKm(departure: Coordinates, arrival: Coordinates): number {
  const latitude1 = toRadians(departure.latitude);
  const latitude2 = toRadians(arrival.latitude);
  const deltaLatitude = latitude2 - latitude1;
  const deltaLongitude = toRadians(arrival.longitude - departure.longitude);

  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  const clamped = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
  return EARTH_RADIUS_KM * c;
}

/**
 * Route factor `k` keyed on the great-circle distance `d`, never on `D`
 * (handoff §4.2). Boundaries are inclusive of the listed distance.
 */
export function routeFactorForDistance(d: number): number {
  if (d <= 500) return 1.12;
  if (d <= 1500) return 1.08;
  if (d <= 5000) return 1.05;
  return 1.03;
}

/**
 * Estimated flight time `T` in hours, from the route distance `D` (handoff
 * §4.4). This is the continuous version: the short-range segment was rewritten
 * to meet the mid-range segment at exactly 500 km.
 *
 *   T(500)  = 0.55 h
 *   T(1500) = 0.55 + 1000/700 = 1.9785714286 h
 */
export function estimatedHoursForRouteDistance(D: number): number {
  if (D <= 500) {
    return 0.25 + 0.0006 * D;
  }

  if (D <= 1500) {
    return 0.55 + (D - 500) / 700;
  }

  const at1500 = 0.55 + 1000 / 700;
  return at1500 + (D - 1500) / 850;
}

/**
 * The single server-side snapshot used on every Flight create and update
 * (handoff §4.5). The domestic rule is the mainland-China one: a flight is
 * domestic only when both airports are ISO3 `CHN`; every other combination —
 * mainland↔HK/MO/TW, HK↔MO, any foreign leg — is international (handoff §2.3).
 */
export function calculateFlightMetrics(
  departure: FlightEndpoint,
  arrival: FlightEndpoint,
): FlightMetrics {
  const greatCircleKm = haversineKm(departure, arrival);
  const routeFactor = routeFactorForDistance(greatCircleKm);
  const routeDistanceKm = greatCircleKm * routeFactor;
  const estimatedHours = estimatedHoursForRouteDistance(routeDistanceKm);
  return {
    greatCircleKm,
    routeFactor,
    routeDistanceKm,
    estimatedHours,
    formulaVersion: 1,
    isDomestic: departure.countryCode === "CHN" && arrival.countryCode === "CHN",
  };
}

/**
 * Formats an estimated duration for display (handoff §4.4). Minutes are
 * zero-padded to two digits when an hour component is present.
 *
 *   48     → "48m"
 *   137    → "2h 17m"
 *   726    → "12h 06m"
 */
export function formatFlightDuration(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${wholeHours}h` : `${wholeHours}h ${String(minutes).padStart(2, "0")}m`;
}
