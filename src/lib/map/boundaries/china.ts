import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl";
import {
  CHINA_BOUNDARY_COLOR,
  CHINA_BOUNDARY_OPACITY,
  CHINA_ISLANDS_WIDTH,
  CHINA_MARITIME_WIDTH,
  CHINA_NATIONAL_BORDER_WIDTH,
} from "./style";

/**
 * China Authority Layer for the pre-home globe.
 *
 * World mode shows no political boundary at all. China mode lazily loads the
 * committed boundary data exactly once and afterwards only toggles visibility,
 * so repeated mode switches never re-request or rebuild the sources.
 *
 * The geometry in `./data` is currently a placeholder — see
 * `./data/README.md` before treating any of it as authoritative.
 *
 * @see Atlas 中国国境线数据落地与实施文档.md §10-§20
 */

export const CHINA_BOUNDARY_SOURCE_IDS = {
  national: "china-boundary-source",
  islands: "china-islands-source",
  maritime: "china-maritime-source",
} as const;

export const CHINA_BOUNDARY_LAYER_IDS = {
  national: "china-national-border",
  islands: "china-islands",
  maritime: "china-maritime-boundary",
} as const;

/** Routes, clusters and POI always render above the boundary (§18). */
const BOUNDARY_INSERT_BEFORE_LAYER = "journey-route";

type BoundaryGeometry = GeoJSON.LineString | GeoJSON.MultiLineString | GeoJSON.Polygon | GeoJSON.MultiPolygon;

export interface ChinaBoundaryCollection {
  type: "FeatureCollection";
  /**
   * Carried only by placeholder files. Production withholds any collection
   * that still has it, so fake geometry can never reach a public build.
   */
  tempPlaceholder?: string;
  features: Array<{
    type: "Feature";
    properties: Record<string, unknown>;
    geometry: BoundaryGeometry;
  }>;
}

export interface ChinaBoundaryData {
  national: ChinaBoundaryCollection;
  islands: ChinaBoundaryCollection;
  maritime: ChinaBoundaryCollection;
}

let pendingLoad: Promise<void> | null = null;

/**
 * Reads the three committed boundary files. Dynamic imports keep them in
 * separate hashed chunks, so World mode downloads none of this.
 */
export async function loadChinaBoundaryData(): Promise<ChinaBoundaryData> {
  const [national, islands, maritime] = await Promise.all([
    import("./data/china-national-border-v1.json"),
    import("./data/china-islands-v1.json"),
    import("./data/china-maritime-boundary-v1.json"),
  ]);
  const allowPlaceholder = import.meta.env.DEV;
  return {
    national: readBoundaryFile(national.default, "china-national-border-v1.json", allowPlaceholder),
    islands: readBoundaryFile(islands.default, "china-islands-v1.json", allowPlaceholder),
    maritime: readBoundaryFile(maritime.default, "china-maritime-boundary-v1.json", allowPlaceholder),
  };
}

function readBoundaryFile(
  value: unknown,
  fileName: string,
  allowPlaceholder: boolean,
): ChinaBoundaryCollection {
  return withholdPlaceholderGeometry(asBoundaryCollection(value, fileName), fileName, allowPlaceholder);
}

/**
 * Keeps placeholder geometry out of a public build (§42-§43).
 *
 * Withholding is per file, so a verified national border still ships while a
 * maritime layer that is still pending simply draws nothing. A collection
 * without the marker is always passed through untouched.
 */
export function withholdPlaceholderGeometry(
  collection: ChinaBoundaryCollection,
  fileName: string,
  allowPlaceholder: boolean,
): ChinaBoundaryCollection {
  if (allowPlaceholder || !collection.tempPlaceholder) return collection;
  console.warn(`Atlas withholds placeholder China boundary data: ${fileName}`);
  return { ...collection, features: [] };
}

function asBoundaryCollection(value: unknown, fileName: string): ChinaBoundaryCollection {
  const candidate = value as { type?: unknown; features?: unknown } | null;
  if (!candidate || candidate.type !== "FeatureCollection" || !Array.isArray(candidate.features)) {
    throw new Error(`${fileName} is not a GeoJSON FeatureCollection`);
  }
  return value as ChinaBoundaryCollection;
}

export function ensureChinaBoundaryLoaded(map: MapLibreMap): Promise<void> {
  if (isChinaBoundaryRegistered(map)) return Promise.resolve();
  pendingLoad ??= loadChinaBoundaryData()
    .then((data) => registerChinaBoundary(map, data))
    .finally(() => {
      pendingLoad = null;
    });
  return pendingLoad;
}

export function showChinaBoundary(map: MapLibreMap): void {
  setChinaBoundaryVisibility(map, "visible");
}

/** Sources stay registered; only the layout property changes (§19). */
export function hideChinaBoundary(map: MapLibreMap): void {
  setChinaBoundaryVisibility(map, "none");
}

function isChinaBoundaryRegistered(map: MapLibreMap): boolean {
  return Object.values(CHINA_BOUNDARY_SOURCE_IDS).every((id) => Boolean(map.getSource(id)));
}

function registerChinaBoundary(map: MapLibreMap, data: ChinaBoundaryData): void {
  map.addSource(CHINA_BOUNDARY_SOURCE_IDS.national, { type: "geojson", data: data.national });
  map.addSource(CHINA_BOUNDARY_SOURCE_IDS.islands, { type: "geojson", data: data.islands });
  map.addSource(CHINA_BOUNDARY_SOURCE_IDS.maritime, { type: "geojson", data: data.maritime });

  addBoundaryLayer(map, CHINA_BOUNDARY_LAYER_IDS.national, CHINA_BOUNDARY_SOURCE_IDS.national, CHINA_NATIONAL_BORDER_WIDTH);
  addBoundaryLayer(map, CHINA_BOUNDARY_LAYER_IDS.islands, CHINA_BOUNDARY_SOURCE_IDS.islands, CHINA_ISLANDS_WIDTH);
  addBoundaryLayer(map, CHINA_BOUNDARY_LAYER_IDS.maritime, CHINA_BOUNDARY_SOURCE_IDS.maritime, CHINA_MARITIME_WIDTH);
}

function addBoundaryLayer(
  map: MapLibreMap,
  id: string,
  source: string,
  width: ExpressionSpecification,
): void {
  const before = map.getLayer(BOUNDARY_INSERT_BEFORE_LAYER) ? BOUNDARY_INSERT_BEFORE_LAYER : undefined;
  map.addLayer(
    {
      id,
      type: "line",
      source,
      layout: {
        visibility: "none",
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": CHINA_BOUNDARY_COLOR,
        "line-opacity": CHINA_BOUNDARY_OPACITY,
        "line-width": width,
      },
    },
    before,
  );
}

function setChinaBoundaryVisibility(map: MapLibreMap, visibility: "visible" | "none"): void {
  for (const layerId of Object.values(CHINA_BOUNDARY_LAYER_IDS)) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visibility);
  }
}
