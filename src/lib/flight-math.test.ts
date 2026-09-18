import { describe, expect, it } from "vitest";
import {
  calculateFlightMetrics,
  EARTH_RADIUS_KM,
  estimatedHoursForRouteDistance,
  formatFlightDuration,
  haversineKm,
  routeFactorForDistance,
} from "./flight-math";

const ONE_DEGREE_KM = (EARTH_RADIUS_KM * Math.PI) / 180; // ~111.19 km along the equator
const HALF_CIRCUMFERENCE_KM = EARTH_RADIUS_KM * Math.PI; // ~20015 km

describe("haversineKm", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineKm({ latitude: 31.1443, longitude: 121.8083 }, { latitude: 31.1443, longitude: 121.8083 })).toBe(0);
  });

  it("measures one degree of longitude at the equator", () => {
    expect(
      haversineKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }),
    ).toBeCloseTo(ONE_DEGREE_KM, 3);
  });

  it("measures a known airport pair (Shanghai Pudong to Beijing Capital)", () => {
    // PVG (31.1443, 121.8083) → PEK (40.0799, 116.6031), published ≈ 1099 km.
    const distance = haversineKm(
      { latitude: 31.1443, longitude: 121.8083 },
      { latitude: 40.0799, longitude: 116.6031 },
    );
    expect(distance).toBeGreaterThan(1090);
    expect(distance).toBeLessThan(1110);
  });

  it("crosses the ±179.5° antimeridian along the short 1° arc", () => {
    const distance = haversineKm(
      { latitude: 0, longitude: 179.5 },
      { latitude: 0, longitude: -179.5 },
    );
    expect(distance).toBeCloseTo(ONE_DEGREE_KM, 3);
  });

  it("measures a half circumference for antipodal points", () => {
    expect(
      haversineKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 }),
    ).toBeCloseTo(HALF_CIRCUMFERENCE_KM, 3);
  });

  it("does not go imaginary near antipodal points", () => {
    // A hair off exact antipode must still produce a finite, positive distance
    // at the clamped edge rather than NaN.
    const distance = haversineKm(
      { latitude: 0.0001, longitude: 0 },
      { latitude: -0.0001, longitude: 180 },
    );
    expect(Number.isFinite(distance)).toBe(true);
    expect(distance).toBeGreaterThan(0);
  });
});

describe("routeFactorForDistance", () => {
  it("keys boundaries inclusively on the great-circle distance", () => {
    expect(routeFactorForDistance(0)).toBe(1.12);
    expect(routeFactorForDistance(500)).toBe(1.12);
    expect(routeFactorForDistance(500.0001)).toBe(1.08);
    expect(routeFactorForDistance(1500)).toBe(1.08);
    expect(routeFactorForDistance(1500.0001)).toBe(1.05);
    expect(routeFactorForDistance(5000)).toBe(1.05);
    expect(routeFactorForDistance(5000.0001)).toBe(1.03);
    expect(routeFactorForDistance(20000)).toBe(1.03);
  });
});

describe("estimatedHoursForRouteDistance", () => {
  it("agrees between the short and mid segments at the 500 km seam", () => {
    // Continuity means both piecewise formulas produce the same value at the
    // boundary, so the curve has no jump there.
    const shortSegment = 0.25 + 0.0006 * 500;
    const midSegment = 0.55 + (500 - 500) / 700;
    expect(shortSegment).toBeCloseTo(midSegment, 12);
    expect(estimatedHoursForRouteDistance(500)).toBeCloseTo(0.55, 10);
  });

  it("agrees between the mid and long segments at the 1500 km seam", () => {
    const midSegment = 0.55 + (1500 - 500) / 700;
    const longSegment = 0.55 + 1000 / 700 + (1500 - 1500) / 850;
    expect(midSegment).toBeCloseTo(longSegment, 12);
    expect(estimatedHoursForRouteDistance(1500)).toBeCloseTo(0.55 + 1000 / 700, 10);
  });

  it("grows positively and monotonically", () => {
    const samples = [0, 100, 499, 500, 501, 1200, 1500, 1501, 4000, 6000, 12000];
    for (let index = 1; index < samples.length; index += 1) {
      const previous = estimatedHoursForRouteDistance(samples[index - 1]);
      const current = estimatedHoursForRouteDistance(samples[index]);
      expect(previous).toBeGreaterThan(0);
      expect(current).toBeGreaterThan(previous);
    }
  });
});

describe("calculateFlightMetrics", () => {
  const PVG = { latitude: 31.1443, longitude: 121.8083, countryCode: "CHN" };
  const PEK = { latitude: 40.0799, longitude: 116.6031, countryCode: "CHN" };
  const HKG = { latitude: 22.308, longitude: 113.9185, countryCode: "HKG" };

  it("derives d, k, D and T in the right relationship", () => {
    const metrics = calculateFlightMetrics(PVG, PEK);
    expect(metrics.greatCircleKm).toBeCloseTo(haversineKm(PVG, PEK), 10);
    expect(metrics.routeFactor).toBe(routeFactorForDistance(metrics.greatCircleKm));
    expect(metrics.routeDistanceKm).toBeCloseTo(metrics.greatCircleKm * metrics.routeFactor, 10);
    expect(metrics.estimatedHours).toBeCloseTo(estimatedHoursForRouteDistance(metrics.routeDistanceKm), 10);
    expect(metrics.formulaVersion).toBe(1);
  });

  it("marks mainland↔mainland as domestic", () => {
    expect(calculateFlightMetrics(PVG, PEK).isDomestic).toBe(true);
  });

  it("marks mainland↔Hong Kong as international", () => {
    expect(calculateFlightMetrics(PVG, HKG).isDomestic).toBe(false);
    expect(calculateFlightMetrics(HKG, PEK).isDomestic).toBe(false);
  });

  it("marks foreign↔foreign as international", () => {
    const CDG = { latitude: 49.0097, longitude: 2.5479, countryCode: "FRA" };
    const JFK = { latitude: 40.6413, longitude: -73.7781, countryCode: "USA" };
    expect(calculateFlightMetrics(CDG, JFK).isDomestic).toBe(false);
  });
});

describe("formatFlightDuration", () => {
  it("formats sub-hour durations as bare minutes", () => {
    expect(formatFlightDuration(0.8)).toBe("48m");
  });

  it("zero-pads minutes when an hour component is present", () => {
    expect(formatFlightDuration(137 / 60)).toBe("2h 17m");
    expect(formatFlightDuration(726 / 60)).toBe("12h 06m");
  });

  it("omits minutes on a whole hour", () => {
    expect(formatFlightDuration(1)).toBe("1h");
    expect(formatFlightDuration(3)).toBe("3h");
  });
});
