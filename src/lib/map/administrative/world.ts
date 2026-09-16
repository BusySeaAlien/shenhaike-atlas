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
import { WORLD_BORDER_WIDTH, footprintFillLayer, footprintLineLayer } from "./style";

/**
 * World Footprint layer.
 *
 * One Natural Earth Admin0 fill in which China — including Taiwan, Hong Kong
 * and Macau — is a single `CHN` feature, because the generator replaced
 * Natural Earth's `CHN` and `TWN` with Atlas' own China polygon (§42/§43).
 * Nothing here has to know about that.
 *
 * Loaded lazily: the file is only requested the first time the user opens
 * World Footprint (§65).
 */

export const WORLD_ADMIN_SOURCE = "world-admin-source";
export const WORLD_ADMIN_FILL_LAYER = "world-admin-fill";
export const WORLD_ADMIN_BORDER_LAYER = "world-admin-border";

const WORLD_ADMIN_LAYER_IDS = [WORLD_ADMIN_FILL_LAYER, WORLD_ADMIN_BORDER_LAYER] as const;

/**
 * Every country code in the layer, captured at load.
 *
 * The visited sync needs the full list, not just the visited subset: clearing a
 * country that is no longer visited requires writing `false` to it (§79).
 */
let countryCodes: string[] = [];
let pending: Promise<void> | null = null;

export function ensureWorldAdministrativeLoaded(map: MapLibreMap): Promise<void> {
  if (map.getSource(WORLD_ADMIN_SOURCE)) return Promise.resolve();
  pending ??= loadWorldAdministrative(map).finally(() => {
    pending = null;
  });
  return pending;
}

async function loadWorldAdministrative(map: MapLibreMap): Promise<void> {
  const module = await import("./data/world-admin0-v2.json");
  const features = administrativeFeatures(module.default, "world-admin0-v2.json");
  countryCodes = featureIds(features, "countryCode");

  map.addSource(WORLD_ADMIN_SOURCE, sourceSpec(module.default, "countryCode"));
  addAdministrativeLayer(map, footprintFillLayer(WORLD_ADMIN_FILL_LAYER, WORLD_ADMIN_SOURCE));
  addAdministrativeLayer(map, footprintLineLayer(
    WORLD_ADMIN_BORDER_LAYER,
    WORLD_ADMIN_SOURCE,
    WORLD_BORDER_WIDTH,
  ));
}

export function showWorldAdministrative(map: MapLibreMap): void {
  setLayersVisible(map, WORLD_ADMIN_LAYER_IDS, true);
}

export function hideWorldAdministrative(map: MapLibreMap): void {
  setLayersVisible(map, WORLD_ADMIN_LAYER_IDS, false);
}

/** Country outlines stay visible so a 4%-opacity fill still reads as a map. */
export function applyWorldVisitedState(map: MapLibreMap, visited: ReadonlySet<string>): void {
  syncVisitedState(map, WORLD_ADMIN_SOURCE, countryCodes, visited);
}

/** Hover readout: country name plus how many places it holds (§58/§59). */
export function bindWorldHover(
  map: MapLibreMap,
  onHover: (hover: FootprintHover | null) => void,
): void {
  bindAdministrativeHover(map, WORLD_ADMIN_FILL_LAYER, onHover);
}
