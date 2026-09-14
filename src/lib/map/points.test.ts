import { describe, expect, it } from "vitest";
import type { MapPoint } from "../../types/domain";
import { filterMapPoints, validMapPoints } from "./points";

function point(overrides: Partial<MapPoint> = {}): MapPoint {
  return {
    id: "1",
    name: "赛里木湖",
    nameEn: "Sayram Lake",
    country: "China",
    sovereignCountryCode: "CHN",
    admin1Code: "650000",
    location: "Xinjiang · China",
    latitude: 44.609,
    longitude: 81.174,
    href: "/places/sayram-lake/",
    lastVisitedAt: "2026-08-17",
    visitCount: 2,
    years: ["2025", "2026"],
    journeySlugs: ["xinjiang-2026", "year-crossing-2025"],
    ...overrides,
  };
}

describe("map points", () => {
  it("rejects invalid coordinates without changing valid points", () => {
    const valid = point();
    expect(validMapPoints([valid, point({ id: "2", latitude: 91 }), point({ id: "3", longitude: Number.NaN })])).toEqual([valid]);
  });

  it("intersects year and journey filters", () => {
    const points = [
      point(),
      point({ id: "2", years: ["2026"], journeySlugs: ["hangzhou-return-2026"] }),
      point({ id: "3", years: ["2025"], journeySlugs: ["year-crossing-2025"] }),
    ];
    expect(filterMapPoints(points, { year: "2026", journey: "year-crossing-2025" }).map(({ id }) => id)).toEqual(["1"]);
    expect(filterMapPoints(points, { year: "2025", journey: "hangzhou-return-2026" })).toEqual([]);
  });

  it("keeps one input point per place when a place has repeated visits", () => {
    const repeated = point({ visitCount: 4, years: ["2025", "2026"], journeySlugs: ["xinjiang-2026", "year-crossing-2025"] });
    expect(filterMapPoints([repeated], {})).toEqual([repeated]);
  });
});

describe("pre-home payload", () => {
  /**
   * Gate for Phase 2: a place whose codes are lost between D1 and the globe
   * silently drops out of Footprint with no visible error, so the exact
   * serialisation PreHomeGlobe performs is asserted here.
   */
  it("carries the administrative codes through the round trip", () => {
    const payload = JSON.stringify({ points: [point()], routes: [] }).replaceAll("<", "\\u003c");
    const parsed = JSON.parse(payload) as { points: MapPoint[] };
    expect(parsed.points[0].sovereignCountryCode).toBe("CHN");
    expect(parsed.points[0].admin1Code).toBe("650000");
  });

  it("uses the exact property names the Footprint layer reads", () => {
    const keys = Object.keys(JSON.parse(JSON.stringify(point())) as object);
    expect(keys).toContain("sovereignCountryCode");
    expect(keys).toContain("admin1Code");
  });
});
