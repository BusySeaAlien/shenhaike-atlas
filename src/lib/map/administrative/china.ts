import type { Map as MapLibreMap } from "maplibre-gl";
import {
  addAdministrativeLayer,
  administrativeFeatures,
  bindAdministrativeHover,
  featureIds,
  setLayersVisible,
  sourceSpec,
  syncVisitedState,
  type FootprintHover,
} from "./layers";
import { CHINA_INTERNAL_BORDER_WIDTH, footprintFillLayer, footprintLineLayer } from "./style";

/**
 * China Footprint layer.
 *
 * Province fill plus **internal** borders only. The national outline, Taiwan's
 * outline and the maritime line stay with the China Authority Boundary module:
 * drawing an outline around every province polygon would double-render them and
 * produce a brighter seam (§34-§36, §42).
 *
 * `china-admin0-polygon-v1.json` is deliberately not loaded here. Its job is
 * the World Footprint CHN override, where it already sits inside
 * `world-admin0-v2.json` (§77).
 *
 * Loaded lazily: only requested the first time the user opens China Footprint
 * (§66).
 */

export const CHINA_ADMIN_SOURCE = "china-admin-source";
export const CHINA_ADMIN_BORDER_SOURCE = "china-admin-internal-source";
export const CHINA_ADMIN_FILL_LAYER = "china-admin-fill";
export const CHINA_ADMIN_BORDER_LAYER = "china-admin-border";

const CHINA_ADMIN_LAYER_IDS = [CHINA_ADMIN_FILL_LAYER, CHINA_ADMIN_BORDER_LAYER] as const;

/** All 34 province codes, captured at load so the sync can clear old ones (§79). */
let provinceCodes: string[] = [];
let pending: Promise<void> | null = null;

export function ensureChinaAdministrativeLoaded(map: MapLibreMap): Promise<void> {
  if (map.getSource(CHINA_ADMIN_SOURCE)) return Promise.resolve();
  pending ??= loadChinaAdministrative(map).finally(() => {
    pending = null;
  });
  return pending;
}

async function loadChinaAdministrative(map: MapLibreMap): Promise<void> {
  const [provinces, borders] = await Promise.all([
    import("./data/china-admin1-v1.json"),
    import("./data/china-admin1-internal-border-v1.json"),
  ]);

  provinceCodes = featureIds(
    administrativeFeatures(provinces.default, "china-admin1-v1.json"),
    "admin1Code",
  );

  map.addSource(CHINA_ADMIN_SOURCE, sourceSpec(provinces.default, "admin1Code"));
  addAdministrativeLayer(map, footprintFillLayer(CHINA_ADMIN_FILL_LAYER, CHINA_ADMIN_SOURCE));

  map.addSource(CHINA_ADMIN_BORDER_SOURCE, {
    type: "geojson",
    data: borders.default as never,
  });
  addAdministrativeLayer(map, footprintLineLayer(
    CHINA_ADMIN_BORDER_LAYER,
    CHINA_ADMIN_BORDER_SOURCE,
    CHINA_INTERNAL_BORDER_WIDTH,
  ));
}

export function showChinaAdministrative(map: MapLibreMap): void {
  setLayersVisible(map, CHINA_ADMIN_LAYER_IDS, true);
}

export function hideChinaAdministrative(map: MapLibreMap): void {
  setLayersVisible(map, CHINA_ADMIN_LAYER_IDS, false);
}

/**
 * Province codes only. Hong Kong, Macau and Taiwan are ordinary `admin1Code`
 * values here, so they colour like any other province while remaining a single
 * `CHN` at the world level (§28).
 */
export function applyChinaVisitedState(map: MapLibreMap, visited: ReadonlySet<string>): void {
  syncVisitedState(map, CHINA_ADMIN_SOURCE, provinceCodes, visited);
}

/** Hover readout: province name plus how many places it holds (§58/§59). */
export function bindChinaHover(
  map: MapLibreMap,
  onHover: (hover: FootprintHover | null) => void,
): void {
  bindAdministrativeHover(map, CHINA_ADMIN_FILL_LAYER, onHover);
}
