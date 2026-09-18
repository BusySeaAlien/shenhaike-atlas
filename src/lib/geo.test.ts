import { describe, expect, it } from "vitest";
import type { TransportMode } from "../types/domain";
import { haversineKm, journeyMileage } from "./geo";

/**
 * Gate for the mileage feature (Wishlist & mileage handoff §5/§11.1): the
 * haversine must be wrap-safe across the antimeridian, and journeyMileage must
 * ignore the first stop's mode and keep the null-mode bucket last.
 */

describe("haversineKm", () => {
  it("measures known city pairs within tolerance", () => {
    expect(haversineKm({ latitude: 39.9042, longitude: 116.4074 }, { latitude: 31.2304, longitude: 121.4737 })).toBeCloseTo(1067, -1);
    expect(haversineKm({ latitude: 31.2304, longitude: 121.4737 }, { latitude: 48.8566, longitude: 2.3522 })).toBeCloseTo(9263, -1);
    expect(haversineKm({ latitude: 51.5074, longitude: -0.1278 }, { latitude: 40.7128, longitude: -74.006 })).toBeCloseTo(5570, -1);
  });

  it("wraps across the antimeridian on the short side", () => {
    // One degree of longitude at the equator, but 359° apart as raw coordinates.
    const km = haversineKm({ latitude: 0, longitude: 179.5 }, { latitude: 0, longitude: -179.5 });
    expect(km).toBeCloseTo(111.2, 0);
  });

  it("stays finite for antipodal pairs where rounding pushes the haversine above 1", () => {
    // (2.5, 0) → (−2.5, 180) computes h = 1.0000000000000002 without clamping;
    // the true distance is half the Earth's circumference.
    const km = haversineKm({ latitude: 2.5, longitude: 0 }, { latitude: -2.5, longitude: 180 });
    expect(Number.isFinite(km)).toBe(true);
    expect(km).toBeCloseTo(20015, 0);
  });

  it("is zero for a repeated coordinate", () => {
    expect(haversineKm({ latitude: 31, longitude: 121 }, { latitude: 31, longitude: 121 })).toBe(0);
  });
});

function stop(longitude: number, transportMode: TransportMode | null) {
  return { latitude: 0, longitude, transportMode };
}

describe("journeyMileage", () => {
  it("returns null for fewer than two stops", () => {
    expect(journeyMileage([])).toBeNull();
    expect(journeyMileage([stop(0, "plane")])).toBeNull();
  });

  it("sums consecutive legs and ignores the first stop's mode", () => {
    // Equator points one and three degrees apart; the first stop's "plane"
    // labels an arriving leg that does not exist and must not appear.
    const mileage = journeyMileage([stop(0, "plane"), stop(1, "walk"), stop(3, "car")])!;
    expect(mileage.totalKm).toBeCloseTo(333.6, 0);
    expect(mileage.legs.map((leg) => leg.mode)).toEqual(["walk", "car"]);
    expect(mileage.legs[0].km).toBeCloseTo(111.2, 0);
    expect(mileage.legs[1].km).toBeCloseTo(222.4, 0);
  });

  it("buckets by mode with the null bucket sorted last", () => {
    const mileage = journeyMileage([
      stop(0, null),
      stop(1, "car"),
      stop(2, null),
      stop(3, "plane"),
      stop(4, "plane"),
    ])!;
    const modes = mileage.byMode.map((entry) => entry.mode);
    expect(modes.at(-1)).toBeNull();
    expect(modes).toEqual(["plane", "car", null]);
    // plane covers the last two one-degree legs, so it outranks car.
    expect(mileage.byMode[0].km).toBeCloseTo(222.4, 0);
  });
});
