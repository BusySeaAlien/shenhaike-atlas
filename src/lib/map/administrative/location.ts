import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
// The explicit type attribute keeps this file loadable by plain Node (used by
// scripts/backfill-administrative-codes.ts) as well as by Vite.
import chinaAdmin1 from "./data/china-admin1-v1.json" with { type: "json" };
import worldAdmin0 from "./data/world-admin0-v2.json" with { type: "json" };

/**
 * Resolves a WGS84 coordinate to Atlas' standard administrative codes.
 *
 * Runs on the server (handoff §53.1): place creation and coordinate edits call
 * this before writing to D1, so `sovereign_country_code` and `admin1_code` are
 * derived from the same polygons the map draws rather than being typed by hand
 * or trusted from the client.
 *
 * The world and China layers are chosen so that both this resolver and the
 * Footprint fill agree on where a place is (handoff §18).
 *
 * @see docs/Atlas-PreHome-Footprint-Mode-Handoff.md §14-§18, §53-§59
 */

export interface AdministrativeLocation {
  sovereignCountryCode: string | null;
  admin1Code: string | null;
}

type Bounds = [west: number, south: number, east: number, north: number];

interface AdministrativeUnit {
  code: string;
  bounds: Bounds;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

interface AdministrativeCollection {
  type: "FeatureCollection";
  features: Array<{
    id: string;
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  }>;
}

/** Atlas' own China polygon replaces Natural Earth's, so this code is special. */
const CHINA = "CHN";

function boundsOfGeometry(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): Bounds {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const walk = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number") {
      const [longitude, latitude] = coords as [number, number];
      if (longitude < west) west = longitude;
      if (longitude > east) east = longitude;
      if (latitude < south) south = latitude;
      if (latitude > north) north = latitude;
      return;
    }
    coords.forEach(walk);
  };
  walk(geometry.coordinates);
  return [west, south, east, north];
}

/** Bounding-box area. Only ever used to rank specificity, never as a real area. */
function boxArea([west, south, east, north]: Bounds): number {
  return (east - west) * (north - south);
}

/**
 * Bounds are computed once per process. Without them every lookup would run a
 * ray cast against all 235 countries.
 *
 * Units are ranked smallest bounding box first, so the most specific polygon
 * wins. A coarse polygon over-covers the small states beside it: Natural Earth
 * 110m omits Singapore entirely, and Malaysia's outline still spans it. Those
 * states now arrive from the 50m supplement, so first-match order would keep
 * handing Singapore's coordinates to Malaysia.
 */
function index(collection: unknown): AdministrativeUnit[] {
  const parsed = collection as AdministrativeCollection;
  return parsed.features
    .map((feature) => ({
      code: String(feature.id),
      bounds: boundsOfGeometry(feature.geometry),
      geometry: feature.geometry,
    }))
    .sort((left, right) => boxArea(left.bounds) - boxArea(right.bounds));
}

let worldUnits: AdministrativeUnit[] | null = null;
let chinaUnits: AdministrativeUnit[] | null = null;

/**
 * Most specific unit whose bounding box contains the point and whose ring
 * encloses it — `index()` ranks units so the smallest box is tested first.
 */
function match(units: AdministrativeUnit[], longitude: number, latitude: number): string | null {
  const point: [number, number] = [longitude, latitude];
  for (const unit of units) {
    const [west, south, east, north] = unit.bounds;
    if (longitude < west || longitude > east || latitude < south || latitude > north) continue;
    if (booleanPointInPolygon(point, unit.geometry)) return unit.code;
  }
  return null;
}

/**
 * Returns both codes for a coordinate.
 *
 * **China is tested before the world layer, not after.** The world Admin0
 * polygon is simplified to 110m visual weight, which erases Macau entirely and
 * leaves Hong Kong marginal — testing the world layer first made a place in
 * Macau resolve to nothing at all. The China admin1 layer is drawn at the same
 * scale as the China Footprint fill, so matching it first both fixes those
 * territories and guarantees the resolver and the map agree on China.
 *
 * A point that falls outside every land polygon — at sea, or on a coastline
 * simplified away at this scale — resolves to `null` rather than a guess
 * (handoff §56). Callers should surface that for a human to fix.
 */
export function resolveAdministrativeLocation(
  longitude: number,
  latitude: number,
): AdministrativeLocation {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return { sovereignCountryCode: null, admin1Code: null };
  }

  chinaUnits ??= index(chinaAdmin1);
  const admin1Code = match(chinaUnits, longitude, latitude);
  if (admin1Code) {
    return { sovereignCountryCode: CHINA, admin1Code };
  }

  worldUnits ??= index(worldAdmin0);
  return {
    sovereignCountryCode: match(worldUnits, longitude, latitude),
    admin1Code: null,
  };
}
