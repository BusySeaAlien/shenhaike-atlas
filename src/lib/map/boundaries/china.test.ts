import { describe, expect, it } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  CHINA_BOUNDARY_LAYER_IDS,
  CHINA_BOUNDARY_SOURCE_IDS,
  ensureChinaBoundaryLoaded,
  hideChinaBoundary,
  loadChinaBoundaryData,
  showChinaBoundary,
  withholdPlaceholderGeometry,
  type ChinaBoundaryCollection,
} from "./china";
import {
  CHINA_BOUNDARY_COLOR,
  CHINA_ISLANDS_WIDTH,
  CHINA_MARITIME_WIDTH,
  CHINA_NATIONAL_BORDER_WIDTH,
} from "./style";

const LAYER_IDS = Object.values(CHINA_BOUNDARY_LAYER_IDS);
const SOURCE_IDS = Object.values(CHINA_BOUNDARY_SOURCE_IDS);

/** Records source and layer calls without a WebGL context. */
function createMapStub() {
  const sources = new Map<string, unknown>();
  const added: Array<{ layer: Record<string, unknown> & { id: string }; before?: string }> = [];
  const visibility = new Map<string, string>();
  const present = new Set(["journey-route"]);

  const stub = {
    getSource: (id: string) => sources.get(id),
    getLayer: (id: string) => (present.has(id) ? {} : undefined),
    addSource: (id: string, specification: unknown) => {
      sources.set(id, specification);
    },
    addLayer: (layer: Record<string, unknown> & { id: string }, before?: string) => {
      added.push({ layer, before });
      present.add(layer.id);
    },
    setLayoutProperty: (id: string, _property: string, value: string) => {
      visibility.set(id, value);
    },
  };

  return { map: stub as unknown as MapLibreMap, sources, added, visibility };
}

const VISUAL_KEYS = ["color", "width", "opacity", "lineColor", "lineWidth", "stroke", "fill"];

describe("China boundary data", () => {
  it("declares CHN sovereignty for every feature and never TWN", async () => {
    const data = await loadChinaBoundaryData();
    for (const collection of [data.national, data.islands, data.maritime]) {
      expect(collection.features.length).toBeGreaterThan(0);
      for (const feature of collection.features) {
        expect(feature.properties.countryCode).toBe("CHN");
        expect(feature.properties.sovereignty).toBe("CHN");
        expect(JSON.stringify(feature.properties)).not.toContain("TWN");
      }
    }
  });

  it("tags each file with its own boundary type", async () => {
    const data = await loadChinaBoundaryData();
    expect(data.national.features.every(({ properties }) => properties.boundaryType === "national")).toBe(true);
    expect(data.islands.features.every(({ properties }) => properties.boundaryType === "island")).toBe(true);
    expect(data.maritime.features.every(({ properties }) => properties.boundaryType === "maritime")).toBe(true);
  });

  it("stores the maritime boundary as real multi-segment geometry", async () => {
    const data = await loadChinaBoundaryData();
    const segments = data.maritime.features.flatMap(({ geometry }) =>
      geometry.type === "MultiLineString" ? geometry.coordinates : []);
    expect(data.maritime.features.every(({ geometry }) => geometry.type === "MultiLineString")).toBe(true);
    expect(segments.length).toBeGreaterThan(1);
  });

  it("keeps visual properties out of the geometry files", async () => {
    const data = await loadChinaBoundaryData();
    for (const collection of [data.national, data.islands, data.maritime]) {
      for (const feature of collection.features) {
        const keys = Object.keys(feature.properties).map((key) => key.toLowerCase());
        expect(keys.filter((key) => VISUAL_KEYS.includes(key))).toEqual([]);
      }
    }
  });
});

/** Flattens any geometry nesting into a flat vertex list. */
function vertices(collection: ChinaBoundaryCollection): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const walk = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number") {
      out.push([coords[0], coords[1] as number]);
      return;
    }
    coords.forEach(walk);
  };
  collection.features.forEach(({ geometry }) => walk((geometry as { coordinates: unknown }).coordinates));
  return out;
}

function covers(points: Array<[number, number]>, box: [number, number, number, number]): boolean {
  const [west, south, east, north] = box;
  return points.some(([lon, lat]) => lon >= west && lon <= east && lat >= south && lat <= north);
}

describe("China boundary area coverage", () => {
  it("keeps every named priority area on the map", async () => {
    const data = await loadChinaBoundaryData();
    const islandPoints = vertices(data.islands);
    const nationalPoints = vertices(data.national);
    // Taiwan, Penghu and Diaoyu sit in the island layer; Xinjiang and Tibet in the national layer.
    expect(covers(islandPoints, [120, 21.9, 122.1, 25.4])).toBe(true);
    expect(covers(islandPoints, [119.2, 23.1, 119.9, 23.9])).toBe(true);
    expect(covers(islandPoints, [122.5, 25.3, 124.7, 26.1])).toBe(true);
    expect(covers(nationalPoints, [73.4, 39, 75.5, 40])).toBe(true);
    expect(covers(nationalPoints, [85, 27, 90, 29])).toBe(true);
  });

  it("carries the South China Sea line down to its southern end", async () => {
    const data = await loadChinaBoundaryData();
    const latitudes = vertices(data.maritime).map(([, lat]) => lat);
    expect(Math.min(...latitudes)).toBeLessThan(5);
    expect(latitudes.filter((lat) => lat > 20).length).toBeGreaterThan(0);
  });
});

describe("China boundary placeholder gating", () => {
  const placeholder: ChinaBoundaryCollection = {
    type: "FeatureCollection",
    tempPlaceholder: "TEMP DATA — NOT FOR PRODUCTION",
    features: [{
      type: "Feature",
      properties: { countryCode: "CHN" },
      geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
    }],
  };

  it("withholds flagged geometry from a production build", () => {
    expect(withholdPlaceholderGeometry(placeholder, "china-x.json", false).features).toEqual([]);
    expect(withholdPlaceholderGeometry(placeholder, "china-x.json", false).type).toBe("FeatureCollection");
  });

  it("keeps flagged geometry while developing", () => {
    expect(withholdPlaceholderGeometry(placeholder, "china-x.json", true).features).toHaveLength(1);
  });

  it("never withholds geometry that is not flagged", () => {
    const verified: ChinaBoundaryCollection = { type: "FeatureCollection", features: placeholder.features };
    expect(withholdPlaceholderGeometry(verified, "china-x.json", false).features).toHaveLength(1);
  });
});

describe("China boundary registration", () => {
  it("registers three sources and three layers below routes", async () => {
    const { map, sources, added } = createMapStub();
    await ensureChinaBoundaryLoaded(map);
    expect([...sources.keys()]).toEqual(SOURCE_IDS);
    expect(sources.size).toBe(3);
    expect(added.map(({ layer }) => layer.id)).toEqual(LAYER_IDS);
    expect(added.every(({ before }) => before === "journey-route")).toBe(true);
  });

  it("creates every boundary layer hidden so World mode is unchanged", async () => {
    const { map, added } = createMapStub();
    await ensureChinaBoundaryLoaded(map);
    for (const { layer } of added) {
      expect(layer.type).toBe("line");
      expect((layer.layout as { visibility?: string }).visibility).toBe("none");
    }
  });

  it("loads the data only once across repeated mode switches", async () => {
    const { map, added } = createMapStub();
    await ensureChinaBoundaryLoaded(map);
    await ensureChinaBoundaryLoaded(map);
    await ensureChinaBoundaryLoaded(map);
    expect(added).toHaveLength(3);
  });

  it("still registers when the route layer is absent", async () => {
    const { map, added } = createMapStub();
    (map as unknown as { getLayer: (id: string) => unknown }).getLayer = () => undefined;
    await ensureChinaBoundaryLoaded(map);
    expect(added.every(({ before }) => before === undefined)).toBe(true);
  });
});

describe("China boundary visibility", () => {
  it("toggles visibility instead of rebuilding sources", async () => {
    const { map, added, visibility } = createMapStub();
    await ensureChinaBoundaryLoaded(map);

    showChinaBoundary(map);
    expect(LAYER_IDS.map((id) => visibility.get(id))).toEqual(["visible", "visible", "visible"]);

    hideChinaBoundary(map);
    expect(LAYER_IDS.map((id) => visibility.get(id))).toEqual(["none", "none", "none"]);
    expect(added).toHaveLength(3);
  });

  it("is safe before the data has loaded", () => {
    const { map, visibility, added } = createMapStub();
    expect(() => hideChinaBoundary(map)).not.toThrow();
    expect(() => showChinaBoundary(map)).not.toThrow();
    expect(added).toHaveLength(0);
    expect([...visibility.keys()]).toEqual([]);
  });
});

describe("China boundary style", () => {
  it("stays in the existing globe line language", () => {
    expect(CHINA_BOUNDARY_COLOR).toBe("#d5ddd8");
  });

  it("weights the national border above islands and maritime at every stop", () => {
    expect(CHINA_NATIONAL_BORDER_WIDTH).toEqual([
      "interpolate", ["linear"], ["zoom"], 1, 0.9, 3.5, 1.1, 5, 1.3,
    ]);
    expect(CHINA_ISLANDS_WIDTH).toEqual([
      "interpolate", ["linear"], ["zoom"], 1, 0.7, 3.5, 0.85, 5, 1,
    ]);
    expect(CHINA_MARITIME_WIDTH).toEqual([
      "interpolate", ["linear"], ["zoom"], 1, 0.8, 3.5, 1, 5, 1.2,
    ]);
  });
});
