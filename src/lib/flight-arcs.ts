import type { FlightArchiveAirport, FlightArchiveRoute } from "../types/domain";

/**
 * Geometry for the flight globe arcs: lane assignment for flights sharing the
 * same unordered airport pair, laterally offset great-circle polylines, and
 * arrow anchor points. Everything here is pure math with no deck.gl or map
 * dependency so it can be unit-tested in isolation.
 *
 * Offset trick: a great circle lies in the plane through the sphere centre
 * with unit normal N = normalize(A × B). At any point P on the arc, the
 * surface direction perpendicular to the path is (N × P) × P = N, so the
 * lateral offset direction is constant along the whole arc. Each vertex is
 * displaced by N scaled with a sin(π·s) envelope: zero at both airports,
 * maximum at the midpoint.
 */

export const ARC_SEGMENTS = 100;
export const ARROW_FRACTION = 0.7;
export const ARROW_MIN_KM = 100;
export const LANE_BASE_SPACING_DEG = 0.7;
export const LANE_MAX_SPAN_DEG = 7;

export type LngLat = [longitude: number, latitude: number];

export interface FlightArcArrow {
  /** Position at ARROW_FRACTION along the offset path. */
  position: LngLat;
  /** A point slightly further along the same path, for tangent estimation. */
  ahead: LngLat;
}

export interface FlightArcDatum extends FlightArchiveRoute {
  /** Unordered airport-pair key: `${minId}-${maxId}`. */
  pairKey: string;
  /** Index of this flight within its pair group (0-based). */
  lane: number;
  /** Number of flights sharing this pair. */
  laneCount: number;
  /** Signed lateral displacement at the arc midpoint, in degrees. */
  offsetDegrees: number;
  /** Laterally offset polyline as [lng, lat] pairs, endpoints at the airports. */
  path: LngLat[];
  /** Arrow anchor along the path, or null when the arc is too short. */
  arrow: FlightArcArrow | null;
}

function toUnitVector([lng, lat]: LngLat): [number, number, number] {
  const lngRad = (lng * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const cosLat = Math.cos(latRad);
  return [cosLat * Math.cos(lngRad), cosLat * Math.sin(lngRad), Math.sin(latRad)];
}

function toLngLat([x, y, z]: [number, number, number]): LngLat {
  const norm = Math.hypot(x, y, z);
  const x0 = x / norm;
  const y0 = y / norm;
  const z0 = z / norm;
  return [
    (Math.atan2(y0, x0) * 180) / Math.PI,
    (Math.asin(Math.min(1, Math.max(-1, z0))) * 180) / Math.PI,
  ];
}

function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(v: [number, number, number]): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length > 1e-12 ? [v[0] / length, v[1] / length, v[2] / length] : [0, 0, 0];
}

/**
 * Plane normal of the great circle through a and b. Degenerate (zero-length
 * or antipodal) pairs get an arbitrary perpendicular so downstream math
 * stays finite.
 */
function planeNormal(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  const normal = normalize(cross(a, b));
  const length = Math.hypot(normal[0], normal[1], normal[2]);
  if (length > 1e-9) return normal;
  const axis: [number, number, number] = Math.abs(a[2]) < 0.999 ? [0, 0, 1] : [1, 0, 0];
  return normalize(cross(a, axis));
}

/** Point at fraction s (0..1) along the great circle from a to b. */
function greatCirclePoint(
  a: [number, number, number],
  b: [number, number, number],
  s: number,
): [number, number, number] {
  const angle = Math.acos(Math.min(1, Math.max(-1, dot(a, b))));
  if (angle < 1e-9) return a;
  const sinAngle = Math.sin(angle);
  const wa = Math.sin((1 - s) * angle) / sinAngle;
  const wb = Math.sin(s * angle) / sinAngle;
  return normalize([wa * a[0] + wb * b[0], wa * a[1] + wb * b[1], wa * a[2] + wb * b[2]]);
}

/**
 * Laterally offset great-circle polyline from departure to arrival.
 * `offsetDegrees` is the signed midpoint displacement in degrees; the
 * sin(π·s) envelope keeps both endpoints exactly at the airports.
 */
function offsetArcPositions(departure: FlightArchiveAirport, arrival: FlightArchiveAirport, offsetDegrees: number): LngLat[] {
  const a = toUnitVector([departure.longitude, departure.latitude]);
  const b = toUnitVector([arrival.longitude, arrival.latitude]);
  const offsetRad = (offsetDegrees * Math.PI) / 180;
  const normal = offsetRad !== 0 ? planeNormal(a, b) : [0, 0, 0];
  const points: LngLat[] = [];
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    if (i === 0) {
      points.push([departure.longitude, departure.latitude]);
      continue;
    }
    if (i === ARC_SEGMENTS) {
      points.push([arrival.longitude, arrival.latitude]);
      continue;
    }
    const s = i / ARC_SEGMENTS;
    const p = greatCirclePoint(a, b, s);
    if (offsetRad !== 0) {
      const displacement = offsetRad * Math.sin(Math.PI * s);
      const displaced = normalize([p[0] + normal[0] * displacement, p[1] + normal[1] * displacement, p[2] + normal[2] * displacement]);
      points.push(toLngLat(displaced));
    } else {
      points.push(toLngLat(p));
    }
  }
  return points;
}

function arrowAnchor(path: LngLat[]): FlightArcArrow | null {
  const index = Math.round(ARROW_FRACTION * (path.length - 1));
  const position = path[index];
  const ahead = path[Math.min(path.length - 1, index + 2)];
  if (!position || !ahead || position[0] === ahead[0] && position[1] === ahead[1]) return null;
  return { position, ahead };
}

/**
 * Lane spacing for a group: a fixed base spacing up to a few parallel arcs,
 * then compressed so large groups stay within a bounded total span.
 */
function spacingDegreesFor(laneCount: number): number {
  if (laneCount <= 1) return 0;
  return Math.min(LANE_BASE_SPACING_DEG, LANE_MAX_SPAN_DEG / (laneCount - 1));
}

/**
 * Assign lateral lanes to flights that share the same unordered airport pair,
 * and precompute each flight's offset polyline and arrow anchor. Lanes are
 * computed on the full dataset once so they stay stable under filtering;
 * flights are ordered by date desc, id desc to match the page list. Pairs
 * whose endpoints differ are never offset relative to each other.
 */
export function prepareFlightArcs(flights: FlightArchiveRoute[]): FlightArcDatum[] {
  const byPair = new Map<string, FlightArchiveRoute[]>();
  for (const flight of flights) {
    const a = Number(flight.departure.id);
    const b = Number(flight.arrival.id);
    const pairKey = `${Math.min(a, b)}-${Math.max(a, b)}`;
    const group = byPair.get(pairKey);
    if (group) group.push(flight);
    else byPair.set(pairKey, [flight]);
  }

  // Lane per flight id, computed once per pair.
  const lanes = new Map<string, { lane: number; laneCount: number; offsetDegrees: number }>();
  for (const [pairKey, group] of byPair) {
    const ordered = [...group].sort((x, y) =>
      y.flightDate.localeCompare(x.flightDate) || Number(y.id) - Number(x.id),
    );
    const spacing = spacingDegreesFor(ordered.length);
    ordered.forEach((flight, lane) => {
      lanes.set(pairKey + ":" + flight.id, {
        lane,
        laneCount: ordered.length,
        offsetDegrees: (lane - (ordered.length - 1) / 2) * spacing,
      });
    });
  }

  return flights.map((flight) => {
    const a = Number(flight.departure.id);
    const b = Number(flight.arrival.id);
    const pairKey = `${Math.min(a, b)}-${Math.max(a, b)}`;
    const laneInfo = lanes.get(pairKey + ":" + flight.id) ?? {
      lane: 0,
      laneCount: 1,
      offsetDegrees: 0,
    };
    const path = offsetArcPositions(flight.departure, flight.arrival, laneInfo.offsetDegrees);
    return {
      ...flight,
      pairKey,
      lane: laneInfo.lane,
      laneCount: laneInfo.laneCount,
      offsetDegrees: laneInfo.offsetDegrees,
      path,
      arrow: flight.greatCircleKm >= ARROW_MIN_KM ? arrowAnchor(path) : null,
    };
  });
}
