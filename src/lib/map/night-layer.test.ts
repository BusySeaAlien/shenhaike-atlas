import { describe, expect, it } from "vitest";
import { nightSphereMesh, sunDirection } from "./night-layer";

describe("night hemisphere shader geometry", () => {
  it("builds one indexed sphere without overlapping pole vertices", () => {
    const { positions, indices } = nightSphereMesh();
    expect(positions.length % 3).toBe(0);
    expect(indices.length % 3).toBe(0);
    const vertices = Array.from({ length: positions.length / 3 }, (_, index) => (
      [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]]
    ));
    expect(vertices.filter(([, y]) => y === -1)).toHaveLength(1);
    expect(vertices.filter(([, y]) => y === 1)).toHaveLength(1);
    expect(Math.max(...indices)).toBeLessThan(vertices.length);
    for (const vertex of vertices) {
      expect(Math.hypot(...vertex)).toBeCloseTo(1, 5);
    }
  });

  it.each([
    "2024-03-20T03:06:00.000Z",
    "2024-06-20T20:51:00.000Z",
    "2024-09-22T12:44:00.000Z",
    "2024-12-21T09:20:00.000Z",
  ])("produces a finite unit sun direction at %s", (isoDate) => {
    const direction = sunDirection(new Date(isoDate));
    expect(direction.every(Number.isFinite)).toBe(true);
    expect(Math.hypot(...direction)).toBeCloseTo(1, 10);
  });
});
