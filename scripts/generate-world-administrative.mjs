#!/usr/bin/env node
/**
 * Normalises Natural Earth Admin 0 Countries (110m) into the Atlas World
 * Footprint layer.
 *
 *   node scripts/generate-world-administrative.mjs
 *
 * Reads both inputs from disk and never downloads anything, so `pnpm build`
 * stays offline. Re-run by hand only when an input changes.
 *
 * Inputs:
 *   data-source/ne_110m_admin_0_countries.geojson   (git-ignored)
 *   src/lib/map/administrative/data/china-admin0-polygon-v1.json
 *
 * Output:
 *   src/lib/map/administrative/data/world-admin0-v1.json
 *
 * @see src/lib/map/administrative/data/README.md for the provenance record.
 */
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PROVINCES, SOURCE_TAG, assertCoordinatesInRange, countVertices, fail } from "./lib/china-source.mjs";

const SOURCE_PATH = resolve(process.cwd(), "data-source/ne_110m_admin_0_countries.geojson");
const CHINA_OVERRIDE_PATH = resolve(
  process.cwd(),
  "src/lib/map/administrative/data/china-admin0-polygon-v1.json",
);
const OUTPUT_DIR = resolve(process.cwd(), "src/lib/map/administrative/data");

/**
 * Natural Earth's `ADM0_A3`, not `ISO_A3` (§41.1/§44).
 *
 * `ISO_A3` is `"-99"` for Norway, France, N. Cyprus, Somaliland and Kosovo, so
 * five features would share one Feature.id and MapLibre feature-state would
 * highlight them as a group. `ADM0_A3` is unique across all 177 features.
 *
 * It matches ISO 3166-1 alpha-3 for most countries but not all — Kosovo (KOS),
 * N. Cyprus (CYN) and Somaliland (SOL) have no ISO code at all. Stability is
 * what feature-state needs, so ADM0_A3 is the right key regardless.
 */
const ID_FIELD = "ADM0_A3";

const NAME_FIELD = "NAME";
const REQUIRED_FIELDS = [ID_FIELD, NAME_FIELD, "SOVEREIGNT", "ADMIN"];

/**
 * Features the Atlas China admin0 polygon replaces. `SOV_A3` groups China as
 * CH1, and Natural Earth lists Taiwan as its own sovereign (TWN); both edges
 * have to go so CHN stays the only China-related footprint in the world layer.
 */
const REPLACED_BY_CHINA_OVERRIDE = new Set(["CHN", "TWN"]);

function readJson(path, label) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    fail(`${label} not found at ${path}`);
  }
  return JSON.parse(raw);
}

const source = readJson(SOURCE_PATH, "Natural Earth source");
if (source.type !== "FeatureCollection" || !Array.isArray(source.features)) {
  fail("Natural Earth source is not a GeoJSON FeatureCollection");
}
console.log(`source: ${source.features.length} Natural Earth features`);

// §41: never hard-code field names without checking the actual data.
const sample = source.features[0]?.properties ?? {};
for (const field of REQUIRED_FIELDS) {
  if (!(field in sample)) fail(`Natural Earth is missing the expected field "${field}"`);
}
console.log(`fields confirmed: ${REQUIRED_FIELDS.join(", ")}`);

const chinaOverride = readJson(CHINA_OVERRIDE_PATH, "China admin0 polygon");
const chinaFeature = chinaOverride.features.find((entry) => entry.id === "CHN");
if (!chinaFeature) fail("china-admin0-polygon-v1.json has no CHN feature");

const idOf = (feature) => String(feature.properties[ID_FIELD]);

// Confirm the replacement actually removes something, so a Silent North Earth
// schema change cannot quietly leave two competing China polygons in the layer.
for (const replaced of REPLACED_BY_CHINA_OVERRIDE) {
  if (!source.features.some((feature) => idOf(feature) === replaced)) {
    fail(`expected Natural Earth to contain ${replaced}, but it does not — re-check §43`);
  }
}

const kept = source.features.filter((feature) => !REPLACED_BY_CHINA_OVERRIDE.has(idOf(feature)));
console.log(`replaced by the China override: ${source.features.length - kept.length} feature(s)`);

const features = [
  ...kept.map((feature) => ({
    type: "Feature",
    id: idOf(feature),
    properties: {
      countryCode: idOf(feature),
      name: String(feature.properties[NAME_FIELD]),
      // Natural Earth carries 168 properties per feature; only these survive.
    },
    geometry: feature.geometry,
  })),
  {
    type: "Feature",
    id: "CHN",
    properties: {
      countryCode: "CHN",
      name: chinaFeature.properties.name ?? "China",
      nameZh: "中国",
      source: SOURCE_TAG,
    },
    geometry: chinaFeature.geometry,
  },
];

// --- Validation ------------------------------------------------------------

const ids = features.map((feature) => feature.id);
if (ids.some((id) => !id || id === "-99")) fail("a feature has an empty or sentinel id");
if (new Set(ids).size !== ids.length) {
  fail(`duplicate Feature.id (${ids.length - new Set(ids).size} collision(s)) — feature-state would break`);
}

for (const feature of features) {
  assertCoordinatesInRange("world-admin0-v1.json", feature.geometry.coordinates);
  if (feature.properties.countryCode !== feature.id) {
    fail(`${feature.id}: countryCode does not match Feature.id`);
  }
}

// The China override must have carried Taiwan in; otherwise the world layer
// would lose the island the moment Natural Earth's TWN feature was removed.
const CHINA_BOUNDS = [73, 3, 136, 54];
const chinaPointsInside = [];
const walkChina = (coords) => {
  if (typeof coords[0] === "number") chinaPointsInside.push(coords);
  else coords.forEach(walkChina);
};
walkChina(features.find((feature) => feature.id === "CHN").geometry.coordinates);
const inChinaBox = chinaPointsInside.filter(([lon, lat]) => (
  lon >= CHINA_BOUNDS[0] && lon <= CHINA_BOUNDS[2] && lat >= CHINA_BOUNDS[1] && lat <= CHINA_BOUNDS[3]
));
if (inChinaBox.length === 0) fail("the CHN override has no geometry inside China's bounds");
console.log(`CHN override: ${inChinaBox.length} vertices, includes Taiwan admin1 (710000 ${PROVINCES["710000"][0]})`);

const collection = { type: "FeatureCollection", features };
const outputPath = `${OUTPUT_DIR}/world-admin0-v1.json`;
writeFileSync(outputPath, `${JSON.stringify(collection)}\n`);

const kb = statSync(outputPath).size / 1024;
const vertices = features.reduce((total, feature) => total + countVertices(feature.geometry), 0);
console.log(`✓ world-admin0-v1.json  ${features.length} countries, ${vertices} vertices, ${kb.toFixed(1)} KB`);
if (kb > 1024) fail("world-admin0 exceeds 1 MB — simplify before shipping");
