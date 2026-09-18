import type { MapJourneyRoute, MapJourneyStop, WishlistPoint } from "../../types/domain";
import type { ScopeMode } from "./globe-state";

// The scope axis lives in globe-state.ts with the rest of the Scope x View
// state; re-exported here so the globe helpers keep one import site.
export type { ScopeMode };

type Coordinate = [number, number];
export type NightLightPoint = [longitude: number, latitude: number, brightness: number];
export type JourneyCameraTarget =
  | { kind: "center"; center: Coordinate }
  | { kind: "bounds"; bounds: [Coordinate, Coordinate] };

export const WORLD_CAMERA = { center: [104, 24] as Coordinate, zoom: 1.9 } as const;

/**
 * China mode must hold the mainland and the South China Sea at once, so it
 * frames a bounds box rather than a fixed centre and zoom — a fixed camera
 * cannot keep 曾母暗沙 on screen across window aspect ratios.
 *
 * Tuning against the real page is Phase 3 work.
 *
 * @see Atlas 中国国境线数据落地与实施文档.md §21-§23
 */
export const CHINA_OVERVIEW_BOUNDS: [[number, number], [number, number]] = [
  [73, 3],
  [135, 54],
];

/** Right padding clears the orbit label that overlays the canvas. */
export const CHINA_OVERVIEW_PADDING = { top: 20, right: 56, bottom: 20, left: 20 } as const;

export const GLOBE_ROTATION = {
  degreesPerSecond: 0.7,
  idleDelay: 1_000,
  maxZoom: 4.5,
} as const;

export function rotationAllowedAtZoom(zoom: number): boolean {
  return zoom <= GLOBE_ROTATION.maxZoom;
}

function normalizeLongitude(longitude: number): number {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

export function subsolarPoint(date: Date): Coordinate {
  const julianDate = date.getTime() / 86_400_000 + 2_440_587.5;
  const daysSinceJ2000 = julianDate - 2_451_545;
  const meanLongitude = (280.46 + 0.9856474 * daysSinceJ2000) * Math.PI / 180;
  const meanAnomaly = (357.528 + 0.9856003 * daysSinceJ2000) * Math.PI / 180;
  const eclipticLongitude = meanLongitude
    + 1.915 * Math.PI / 180 * Math.sin(meanAnomaly)
    + 0.02 * Math.PI / 180 * Math.sin(2 * meanAnomaly);
  const obliquity = (23.439 - 0.0000004 * daysSinceJ2000) * Math.PI / 180;
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude),
  );
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
  const siderealDegrees = 280.46061837 + 360.98564736629 * daysSinceJ2000;
  return [
    normalizeLongitude(rightAscension * 180 / Math.PI - siderealDegrees),
    declination * 180 / Math.PI,
  ];
}

function smoothstep(value: number): number {
  const bounded = Math.max(0, Math.min(1, value));
  return bounded * bounded * (3 - 2 * bounded);
}

export function nightLightsGeoJson(points: NightLightPoint[], date: Date) {
  const [sunLongitude, sunLatitude] = subsolarPoint(date);
  const sunLongitudeRadians = sunLongitude * Math.PI / 180;
  const sunLatitudeRadians = sunLatitude * Math.PI / 180;
  const features = [];

  for (let index = 0; index < points.length; index += 1) {
    const [longitude, latitude, brightness] = points[index];
    const longitudeRadians = longitude * Math.PI / 180;
    const latitudeRadians = latitude * Math.PI / 180;
    const solarAltitude = Math.asin(
      Math.sin(latitudeRadians) * Math.sin(sunLatitudeRadians)
      + Math.cos(latitudeRadians) * Math.cos(sunLatitudeRadians)
      * Math.cos(longitudeRadians - sunLongitudeRadians),
    ) * 180 / Math.PI;
    const darkness = smoothstep((-2 - solarAltitude) / 7);
    if (darkness <= 0.01) continue;
    features.push({
      type: "Feature" as const,
      id: index,
      properties: { intensity: Number((brightness * darkness).toFixed(3)) },
      geometry: { type: "Point" as const, coordinates: [longitude, latitude] as Coordinate },
    });
  }

  return { type: "FeatureCollection" as const, features };
}

const CHINA_COUNTRY_NAMES = new Set([
  "china",
  "cn",
  "chn",
  "中国",
  "中华人民共和国",
  "people's republic of china",
  "people’s republic of china",
]);

export function isChinaCountry(country: string): boolean {
  return CHINA_COUNTRY_NAMES.has(country.trim().toLocaleLowerCase("en"));
}

export function pointsForMode<T extends { country: string }>(points: T[], mode: ScopeMode): T[] {
  return mode === "china" ? points.filter((point) => isChinaCountry(point.country)) : points;
}

export function routeAvailableInMode(route: MapJourneyRoute, mode: ScopeMode): boolean {
  return mode === "world" || route.stops.some((stop) => isChinaCountry(stop.country));
}

export function stopsForMode(stops: MapJourneyStop[], mode: ScopeMode): MapJourneyStop[] {
  return mode === "china" ? stops.filter((stop) => isChinaCountry(stop.country)) : stops;
}

/**
 * Frames the visible stops of a journey using the shortest longitude span.
 * The latter matters for journeys crossing the date line: ordinary min/max
 * bounds would turn a short hop from 170 E to 170 W into a near-global view.
 */
export function journeyCameraTarget(route: MapJourneyRoute | undefined, mode: ScopeMode): JourneyCameraTarget | null {
  const stops = route ? stopsForMode(route.stops, mode) : [];
  if (!stops.length) return null;

  const latitudes = stops.map((stop) => stop.latitude);
  const longitudes = stops
    .map((stop) => ((stop.longitude % 360) + 360) % 360)
    .sort((a, b) => a - b);

  let largestGapIndex = longitudes.length - 1;
  let largestGap = longitudes[0] + 360 - longitudes.at(-1)!;
  for (let index = 0; index < longitudes.length - 1; index += 1) {
    const gap = longitudes[index + 1] - longitudes[index];
    if (gap > largestGap) {
      largestGap = gap;
      largestGapIndex = index;
    }
  }

  let west = longitudes[(largestGapIndex + 1) % longitudes.length];
  let east = longitudes[largestGapIndex];
  if (east < west) east += 360;
  if (west > 180) {
    west -= 360;
    east -= 360;
  }

  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  if (west === east && south === north) {
    return { kind: "center", center: [west, south] };
  }
  return { kind: "bounds", bounds: [[west, south], [east, north]] };
}

function sameCoordinate(a: Coordinate, b: Coordinate): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function splitAntimeridian(start: Coordinate, end: Coordinate): Coordinate[][] {
  if (sameCoordinate(start, end)) return [];
  const delta = end[0] - start[0];
  if (Math.abs(delta) <= 180) return [[start, end]];

  const adjustedEndLongitude = delta > 180 ? end[0] - 360 : end[0] + 360;
  const boundary = adjustedEndLongitude > 180 ? 180 : -180;
  const ratio = (boundary - start[0]) / (adjustedEndLongitude - start[0]);
  const latitude = start[1] + (end[1] - start[1]) * ratio;
  const oppositeBoundary = boundary === 180 ? -180 : 180;
  return [
    [start, [boundary, latitude]],
    [[oppositeBoundary, latitude], end],
  ];
}

export function journeyLineGeoJson(route: MapJourneyRoute | undefined, mode: ScopeMode) {
  const features: Array<{
    type: "Feature";
    properties: { journey: string };
    geometry: { type: "LineString"; coordinates: Coordinate[] };
  }> = [];
  if (!route) return { type: "FeatureCollection" as const, features };

  for (let index = 1; index < route.stops.length; index += 1) {
    const start = route.stops[index - 1];
    const end = route.stops[index];
    if (mode === "china" && (!isChinaCountry(start.country) || !isChinaCountry(end.country))) continue;
    const segments = splitAntimeridian(
      [start.longitude, start.latitude],
      [end.longitude, end.latitude],
    );
    for (const coordinates of segments) {
      features.push({
        type: "Feature",
        properties: { journey: route.slug },
        geometry: { type: "LineString", coordinates },
      });
    }
  }
  return { type: "FeatureCollection" as const, features };
}

export function journeyStopsGeoJson(route: MapJourneyRoute | undefined, mode: ScopeMode) {
  return {
    type: "FeatureCollection" as const,
    features: route ? stopsForMode(route.stops, mode).map((stop, index) => ({
      type: "Feature" as const,
      id: `${stop.placeId}-${stop.sequence}-${index}`,
      properties: { placeId: stop.placeId, order: index + 1 },
      geometry: {
        type: "Point" as const,
        coordinates: [stop.longitude, stop.latitude] as Coordinate,
      },
    })) : [],
  };
}

/**
 * Wishlist markers ride their own source, so they follow the same China
 * filtering as visited points but never mix into `globe-places` (Wishlist
 * handoff §7.4/§7.5). No clustering in v1.
 */
export function wishlistPointsGeoJson(items: WishlistPoint[], mode: ScopeMode) {
  return {
    type: "FeatureCollection" as const,
    features: pointsForMode(items, mode).map((item) => ({
      type: "Feature" as const,
      id: item.id,
      properties: {
        id: item.id,
        name: item.name,
        nameZh: item.nameZh,
        country: item.country,
        location: item.location,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [item.longitude, item.latitude] as Coordinate,
      },
    })),
  };
}
