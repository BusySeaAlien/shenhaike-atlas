import { describe, expect, it } from "vitest";
import type { MapJourneyRoute, MapPoint } from "../../types/domain";
import {
  CHINA_OVERVIEW_BOUNDS,
  WORLD_CAMERA,
  GLOBE_ROTATION,
  isChinaCountry,
  nightHemisphereGeoJson,
  nightLightsGeoJson,
  journeyLineGeoJson,
  pointsForMode,
  routeAvailableInMode,
  splitAntimeridian,
  subsolarPoint,
} from "./globe";

const route: MapJourneyRoute = {
  slug: "eastbound",
  name: "Eastbound",
  nameZh: null,
  startDate: "2026-01-01",
  endDate: "2026-01-04",
  stops: [
    { placeId: "1", name: "上海", nameEn: "Shanghai", country: "China", latitude: 31, longitude: 121, href: "/places/shanghai/", visitedAt: "2026-01-01", sequence: 1 },
    { placeId: "2", name: "东京", nameEn: "Tokyo", country: "Japan", latitude: 35, longitude: 139, href: "/places/tokyo/", visitedAt: "2026-01-02", sequence: 2 },
    { placeId: "3", name: "北京", nameEn: "Beijing", country: "CN", latitude: 40, longitude: 116, href: "/places/beijing/", visitedAt: "2026-01-04", sequence: 3 },
  ],
};

describe("globe data helpers", () => {
  it("normalizes common China country names", () => {
    expect(["China", "CN", "CHN", "中国", "中华人民共和国"].every(isChinaCountry)).toBe(true);
    expect(isChinaCountry("Japan")).toBe(false);
  });

  it("starts with China facing the viewer and rotates eastward to move the surface west", () => {
    expect(WORLD_CAMERA.center).toEqual([104, 24]);
    expect(WORLD_CAMERA.zoom).toBeGreaterThan(1);
    expect(GLOBE_ROTATION.degreesPerSecond).toBeGreaterThan(0);
    expect(GLOBE_ROTATION.idleDelay).toBe(1_000);
  });

  it("frames the mainland and the South China Sea together in China mode", () => {
    const [[west, south], [east, north]] = CHINA_OVERVIEW_BOUNDS;
    expect(west).toBeLessThanOrEqual(74);
    expect(east).toBeGreaterThanOrEqual(135);
    expect(north).toBeGreaterThanOrEqual(53);
    expect(south).toBeLessThanOrEqual(4);
  });

  it("builds a current night hemisphere around the solar antipode", () => {
    const equinoxNoon = new Date("2024-03-20T12:00:00.000Z");
    const [longitude, latitude] = subsolarPoint(equinoxNoon);
    expect(Math.abs(longitude)).toBeLessThan(5);
    expect(Math.abs(latitude)).toBeLessThan(1);
    const night = nightHemisphereGeoJson(equinoxNoon);
    expect(night.features[0].geometry.type).toBe("MultiPolygon");
    expect(night.features[0].geometry.coordinates).toHaveLength(90);
  });

  it("shows lights only after local twilight and fades the boundary", () => {
    const equinoxNoon = new Date("2024-03-20T12:00:00.000Z");
    const lights = nightLightsGeoJson([
      [0, 0, 1],
      [180, 0, 1],
      [98, 0, 1],
    ], equinoxNoon);
    expect(lights.features.map(({ geometry }) => geometry.coordinates[0])).toEqual([180, 98]);
    expect(lights.features[0].properties.intensity).toBe(1);
    expect(lights.features[1].properties.intensity).toBeGreaterThan(0);
    expect(lights.features[1].properties.intensity).toBeLessThan(1);
  });

  it("filters points and journey availability for China mode", () => {
    const points = [
      { id: "1", country: "China" },
      { id: "2", country: "Japan" },
    ] as MapPoint[];
    expect(pointsForMode(points, "china").map(({ id }) => id)).toEqual(["1"]);
    expect(routeAvailableInMode(route, "china")).toBe(true);
  });

  it("does not connect Chinese stops across an omitted foreign visit", () => {
    expect(journeyLineGeoJson(route, "china").features).toEqual([]);
    expect(journeyLineGeoJson(route, "world").features).toHaveLength(2);
  });

  it("omits repeated points and splits a date-line crossing", () => {
    expect(splitAntimeridian([10, 20], [10, 20])).toEqual([]);
    const segments = splitAntimeridian([170, 10], [-170, 20]);
    expect(segments).toHaveLength(2);
    expect(segments[0][1][0]).toBe(180);
    expect(segments[1][0][0]).toBe(-180);
    expect(segments[0][1][1]).toBeCloseTo(15);
  });
});
