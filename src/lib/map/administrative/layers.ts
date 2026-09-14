import type { GeoJSONSourceSpecification, LayerSpecification, Map as MapLibreMap } from "maplibre-gl";

/**
 * Small shared helpers for the two administrative layer groups.
 *
 * Load, visibility and feature-state handling are structurally identical for
 * World and China, so they live here rather than being written twice and
 * drifting apart. Anything that differs between the two stays in their own
 * modules.
 */

/**
 * Administrative fill is a thematic overlay on the surface, so it sits *under*
 * the night hemisphere and dims with the earth (§47/§48). The China Authority
 * Boundary stays above the night instead, because it is cartographic
 * information whose legibility wins (§49).
 */
export const ADMIN_INSERT_BEFORE_LAYER = "night-hemisphere";

export function addAdministrativeLayer(map: MapLibreMap, layer: LayerSpecification): void {
  const before = map.getLayer(ADMIN_INSERT_BEFORE_LAYER) ? ADMIN_INSERT_BEFORE_LAYER : undefined;
  map.addLayer(layer, before);
}

export function setLayersVisible(
  map: MapLibreMap,
  layerIds: readonly string[],
  visible: boolean,
): void {
  for (const id of layerIds) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
}

/**
 * Full sync of visited state (§79).
 *
 * Both `true` and `false` are written every time. Only ever setting `true`
 * would leave a place that was removed from the archive still highlighted, with
 * no way to clear it short of a reload.
 */
export function syncVisitedState(
  map: MapLibreMap,
  sourceId: string,
  ids: readonly string[],
  visited: ReadonlySet<string>,
): void {
  for (const id of ids) {
    map.setFeatureState({ source: sourceId, id }, { visited: visited.has(id) });
  }
}

/**
 * Feature ids come from the source's own code property via `promoteId`, so a
 * forgotten GeoJSON `id` cannot silently break `feature-state` (§44/§45).
 */
export function sourceSpec(collection: unknown, idProperty: string): GeoJSONSourceSpecification {
  return {
    type: "geojson",
    data: collection as GeoJSONSourceSpecification["data"],
    promoteId: idProperty,
  };
}

/** Guards the shape of a generated data file before it reaches MapLibre. */
export function administrativeFeatures(value: unknown, fileName: string): Array<Record<string, unknown>> {
  const candidate = value as { type?: unknown; features?: unknown } | null;
  if (!candidate || candidate.type !== "FeatureCollection" || !Array.isArray(candidate.features)) {
    throw new Error(`${fileName} is not a GeoJSON FeatureCollection`);
  }
  return candidate.features as Array<Record<string, unknown>>;
}

/** Every feature id in a collection, for the visited-state sync. */
export function featureIds(features: Array<Record<string, unknown>>, idProperty: string): string[] {
  return features.map((feature) => String((feature.properties as Record<string, unknown>)[idProperty]));
}

/** What hover reports back: the region under the cursor, and where it is. */
export interface FootprintHover {
  /** Country code or province code, matching the feature-state key. */
  code: string;
  /** Display name from the data file (`France`, `四川省`). */
  name: string;
  /** Cursor position in canvas pixels. */
  x: number;
  y: number;
}

/**
 * Reports the region under the cursor, or `null` when it leaves.
 *
 * The caller owns the tooltip element; the layer id stays private to the
 * module so PreHomeGlobe never has to know layer names (§52).
 */
export function bindAdministrativeHover(
  map: MapLibreMap,
  fillLayerId: string,
  onHover: (hover: FootprintHover | null) => void,
): void {
  map.on("mousemove", fillLayerId, (event) => {
    const feature = event.features?.[0];
    if (!feature) {
      onHover(null);
      return;
    }
    const properties = (feature.properties ?? {}) as Record<string, unknown>;
    onHover({
      code: String(feature.id ?? ""),
      name: String(properties.name ?? ""),
      x: event.point.x,
      y: event.point.y,
    });
  });
  map.on("mouseleave", fillLayerId, () => onHover(null));
}
