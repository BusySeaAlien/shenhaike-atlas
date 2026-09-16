import { describe, expect, it } from "vitest";
import { CLUSTER_RADIUS_EXPRESSION, PLACE_CLUSTER_OPTIONS } from "./config";

describe("map clustering configuration", () => {
  it("uses MapLibre native clustering with a bounded screen-space radius", () => {
    expect(PLACE_CLUSTER_OPTIONS).toEqual({
      cluster: true,
      clusterRadius: 52,
      clusterMaxZoom: 13,
    });
  });

  it("sizes clusters from the square root of point_count and caps growth", () => {
    expect(CLUSTER_RADIUS_EXPRESSION).toEqual([
      "interpolate",
      ["linear"],
      ["min", 10, ["sqrt", ["get", "point_count"]]],
      1,
      15,
      2,
      18,
      3.2,
      22,
      5,
      27,
      10,
      32,
    ]);
  });
});
