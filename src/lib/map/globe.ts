import type { MapJourneyRoute, MapJourneyStop, MapPoint } from "../../types/domain";

export type GlobeMode = "world" | "china";
type Coordinate = [number, number];
export type NightLightPoint = [longitude: number, latitude: number, brightness: number];

export const GLOBE_CAMERAS = {
  world: { center: [104, 24] as Coordinate, zoom: 1.9 },
  china: { center: [104, 35] as Coordinate, zoom: 3.45 },
} as const;

export const GLOBE_ROTATION = {
  degreesPerSecond: 0.7,
  idleDelay: 1_000,
} as const;

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

export function nightHemisphereGeoJson(date: Date) {
  const [sunLongitude, sunLatitude] = subsolarPoint(date);
  const nightCenter: Coordinate = [normalizeLongitude(sunLongitude + 180), -sunLatitude];
  const centerLongitude = nightCenter[0] * Math.PI / 180;
  const centerLatitude = nightCenter[1] * Math.PI / 180;
  const boundary: Coordinate[] = [];

  for (let degrees = 0; degrees <= 360; degrees += 4) {
    const bearing = degrees * Math.PI / 180;
    const latitude = Math.asin(Math.cos(centerLatitude) * Math.cos(bearing));
    const longitude = centerLongitude + Math.atan2(
      Math.sin(bearing) * Math.cos(centerLatitude),
      -Math.sin(centerLatitude) * Math.sin(latitude),
    );
    let longitudeDegrees = longitude * 180 / Math.PI;
    while (longitudeDegrees - nightCenter[0] > 180) longitudeDegrees -= 360;
    while (longitudeDegrees - nightCenter[0] < -180) longitudeDegrees += 360;
    boundary.push([longitudeDegrees, latitude * 180 / Math.PI]);
  }

  const coordinates = boundary.slice(0, -1).map((point, index) => [[
    nightCenter,
    point,
    boundary[index + 1],
    nightCenter,
  ]]);
  return {
    type: "FeatureCollection" as const,
    features: [{
      type: "Feature" as const,
      properties: { updatedAt: date.toISOString() },
      geometry: { type: "MultiPolygon" as const, coordinates },
    }],
  };
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

export function pointsForMode(points: MapPoint[], mode: GlobeMode): MapPoint[] {
  return mode === "china" ? points.filter((point) => isChinaCountry(point.country)) : points;
}

export function routeAvailableInMode(route: MapJourneyRoute, mode: GlobeMode): boolean {
  return mode === "world" || route.stops.some((stop) => isChinaCountry(stop.country));
}

export function stopsForMode(stops: MapJourneyStop[], mode: GlobeMode): MapJourneyStop[] {
  return mode === "china" ? stops.filter((stop) => isChinaCountry(stop.country)) : stops;
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

export function journeyLineGeoJson(route: MapJourneyRoute | undefined, mode: GlobeMode) {
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

export function journeyStopsGeoJson(route: MapJourneyRoute | undefined, mode: GlobeMode) {
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
