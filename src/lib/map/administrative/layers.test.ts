import { describe, expect, it } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { ensureChinaAdministrativeLoaded, applyChinaVisitedState, bindChinaHover, hideChinaAdministrative } from "./china";
import { ensureWorldAdministrativeLoaded, applyWorldVisitedState, bindWorldHover, hideWorldAdministrative } from "./world";
import { ADMIN_INSERT_BEFORE_LAYER } from "./layers";
import worldAdmin0 from "./data/world-admin0-v2.json";

/**
 * Derived, not hardcoded: the world layer gains small states whenever Natural
 * Earth's supplement grows, and a count assertion should not be what notices.
 */
const WORLD_COUNTRY_COUNT = worldAdmin0.features.length;

/**
 * Phase 6/8 gates: the Footprint must highlight exactly the right regions, and
 * must not be able to reintroduce the China double-line or a second China
 * sovereign feature.
 */

interface MapStub {
  map: MapLibreMap;
  sources: Map<string, unknown>;
  layers: Array<{ id: string; before: string | undefined; spec: Record<string, unknown> }>;
  states: Array<{ source: string; id: string; visited: unknown }>;
  visible: Map<string, string>;
  /** Fire a bound layer handler, as MapLibre would. */
  emit: (layerId: string, eventName: string, event: unknown) => void;
}

function createMapStub(): MapStub {
  const sources = new Map<string, unknown>();
  const layers: Array<{ id: string; before: string | undefined; spec: Record<string, unknown> }> = [];
  const states: Array<{ source: string; id: string; visited: unknown }> = [];
  const visible = new Map<string, string>();
  const present = new Set([ADMIN_INSERT_BEFORE_LAYER]);
  const handlers = new Map<string, (event: unknown) => void>();

  const stub = {
    getSource: (id: string) => sources.get(id),
    getLayer: (id: string) => (present.has(id) ? {} : undefined),
    addSource: (id: string, spec: unknown) => { sources.set(id, spec); },
    addLayer: (spec: { id: string }, before?: string) => {
      layers.push({ id: spec.id, before, spec: spec as unknown as Record<string, unknown> });
      present.add(spec.id);
    },
    setLayoutProperty: (id: string, _property: string, value: string) => { visible.set(id, value); },
    setFeatureState: (target: { source: string; id: string | number }, state: { visited?: unknown }) => {
      states.push({ source: target.source, id: String(target.id), visited: state.visited });
    },
    // MapLibre's signature is on(eventName, layerId, handler) — event first.
    on: (eventName: string, layerId: string, handler: (event: unknown) => void) => {
      handlers.set(`${layerId}:${eventName}`, handler);
    },
  };

  return {
    map: stub as unknown as MapLibreMap,
    sources,
    layers,
    states,
    visible,
    emit: (layerId, eventName, event) => handlers.get(`${layerId}:${eventName}`)?.(event),
  };
}

describe("World Footprint layer", () => {
  it("registers one source and the fill + border layers below the night shading", async () => {
    const { map, sources, layers } = createMapStub();
    await ensureWorldAdministrativeLoaded(map);

    expect([...sources.keys()]).toEqual(["world-admin-source"]);
    expect(layers.map(({ id }) => id)).toEqual(["world-admin-fill", "world-admin-border"]);
    expect(layers.every(({ before }) => before === ADMIN_INSERT_BEFORE_LAYER)).toBe(true);
  });

  it("creates the layers hidden so World + Journey is untouched", async () => {
    const { map, layers } = createMapStub();
    await ensureWorldAdministrativeLoaded(map);
    for (const { spec } of layers) {
      expect((spec.layout as { visibility?: string }).visibility).toBe("none");
    }
  });

  it("highlights only the visited countries (§97, gate 2)", async () => {
    const { map, states } = createMapStub();
    await ensureWorldAdministrativeLoaded(map);
    applyWorldVisitedState(map, new Set(["CHN", "FRA"]));

    const visited = states.filter(({ visited }) => visited === true).map(({ id }) => id).sort();
    expect(visited).toEqual(["CHN", "FRA"]);
    // Full sync, not just the additions (§79).
    expect(states).toHaveLength(WORLD_COUNTRY_COUNT);
    expect(states.filter(({ visited }) => visited === false)).toHaveLength(WORLD_COUNTRY_COUNT - 2);
  });

  it("writes false when a country is no longer visited (§79)", async () => {
    const { map, states } = createMapStub();
    await ensureWorldAdministrativeLoaded(map);
    applyWorldVisitedState(map, new Set(["CHN"]));
    states.length = 0;
    applyWorldVisitedState(map, new Set());

    expect(states.find(({ id }) => id === "CHN")?.visited).toBe(false);
  });

  it("carries China as one sovereign, with Taiwan inside it (gate 2)", async () => {
    const { map, sources } = createMapStub();
    await ensureWorldAdministrativeLoaded(map);
    const source = sources.get("world-admin-source") as { promoteId: string };
    expect(source.promoteId).toBe("countryCode");

    const codes = worldAdmin0.features.map(({ id }) => id);
    expect(codes).toContain("CHN");
    expect(codes).not.toContain("TWN");
    expect(new Set(codes).size).toBe(codes.length);
    // A count derived from the file cannot notice the file shrinking, so pin a
    // floor: 110m's 176 plus the 50m supplement's 59.
    expect(WORLD_COUNTRY_COUNT).toBeGreaterThanOrEqual(235);
  });

  it("toggles visibility without rebuilding the source (§67)", async () => {
    const { map, sources, visible } = createMapStub();
    await ensureWorldAdministrativeLoaded(map);
    hideWorldAdministrative(map);
    expect(sources.size).toBe(1);
    expect(visible.get("world-admin-fill")).toBe("none");
  });
});

describe("Footprint hover (§58/§59)", () => {
  it("reports the province code and its display name", async () => {
    const { map, emit } = createMapStub();
    await ensureChinaAdministrativeLoaded(map);
    const seen: Array<{ code: string; name: string; x: number; y: number } | null> = [];
    bindChinaHover(map, (hover) => seen.push(hover));

    emit("china-admin-fill", "mousemove", {
      features: [{ id: "650000", properties: { name: "新疆维吾尔自治区" } }],
      point: { x: 120, y: 64 },
    });

    expect(seen).toEqual([{ code: "650000", name: "新疆维吾尔自治区", x: 120, y: 64 }]);
  });

  it("clears the readout when the cursor leaves the layer", async () => {
    const { map, emit } = createMapStub();
    await ensureChinaAdministrativeLoaded(map);
    const seen: unknown[] = [];
    bindChinaHover(map, (hover) => seen.push(hover));

    emit("china-admin-fill", "mouseleave", {});
    expect(seen).toEqual([null]);
  });

  it("reports the country name in World Footprint", async () => {
    const { map, emit } = createMapStub();
    await ensureWorldAdministrativeLoaded(map);
    const seen: Array<{ code: string; name: string } | null> = [];
    bindWorldHover(map, (hover) => seen.push(hover));

    emit("world-admin-fill", "mousemove", {
      features: [{ id: "FRA", properties: { name: "France" } }],
      point: { x: 10, y: 10 },
    });

    expect(seen[0]).toMatchObject({ code: "FRA", name: "France" });
  });
});

describe("China Footprint layer", () => {
  it("registers province fill plus internal borders only (gate 3)", async () => {
    const { map, layers } = createMapStub();
    await ensureChinaAdministrativeLoaded(map);

    expect(layers.map(({ id }) => id)).toEqual(["china-admin-fill", "china-admin-border"]);
    // No national-outline layer: that belongs to the Authority Boundary, and
    // drawing one here is what produces the double line (§36).
    expect(layers.some(({ id }) => id.includes("national") || id.includes("island"))).toBe(false);
  });

  it("highlights Shanghai, Xinjiang and Zhejiang (§98, gate 1)", async () => {
    const { map, states } = createMapStub();
    await ensureChinaAdministrativeLoaded(map);
    applyChinaVisitedState(map, new Set(["310000", "650000", "330000"]));

    const visited = states.filter(({ visited }) => visited === true).map(({ id }) => id).sort();
    expect(visited).toEqual(["310000", "330000", "650000"]);
    expect(states).toHaveLength(34);
  });

  it("treats Hong Kong, Macau and Taiwan as ordinary provinces (§28)", async () => {
    const { map, states } = createMapStub();
    await ensureChinaAdministrativeLoaded(map);
    applyChinaVisitedState(map, new Set(["810000", "820000", "710000"]));

    const visited = states.filter(({ visited }) => visited === true).map(({ id }) => id).sort();
    expect(visited).toEqual(["710000", "810000", "820000"]);
  });

  it("keeps the internal-border layer free of Taiwan's outline (gate 3)", async () => {
    const { default: borders } = await import("./data/china-admin1-internal-border-v1.json");
    const parts = (borders as { features: Array<{ geometry: { coordinates: number[][][] } }> })
      .features[0].geometry.coordinates;
    const inTaiwan = parts.filter((part) => part.some(([lon, lat]) => (
      lon >= 119 && lon <= 122.1 && lat >= 21.8 && lat <= 25.4
    )));
    expect(inTaiwan).toHaveLength(0);
  });

  it("promotes admin1Code to the feature id", async () => {
    const { map, sources } = createMapStub();
    await ensureChinaAdministrativeLoaded(map);
    expect((sources.get("china-admin-source") as { promoteId: string }).promoteId).toBe("admin1Code");
  });

  it("toggles both layers without rebuilding sources (§67)", async () => {
    const { map, sources, visible } = createMapStub();
    await ensureChinaAdministrativeLoaded(map);
    hideChinaAdministrative(map);
    expect(sources.size).toBe(2);
    expect(visible.get("china-admin-fill")).toBe("none");
    expect(visible.get("china-admin-border")).toBe("none");
  });
});
