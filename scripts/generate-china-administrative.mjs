#!/usr/bin/env node
/**
 * Converts the authorised county-level source dataset into the three Atlas
 * China administrative files that drive the Footprint fill layers.
 *
 *   node scripts/generate-china-administrative.mjs
 *
 * Shares the source contract with `generate-china-boundary.mjs`; nothing here
 * downloads anything. Re-run by hand only when the source dataset changes.
 *
 * Output:
 *   china-admin0-polygon-v1.json          国家 Fill / World CHN override
 *   china-admin1-v1.json                  省级 Fill
 *   china-admin1-internal-border-v1.json  省界（仅内部，不含国家外轮廓）
 *
 * The internal-border split is deliberate: see §34-§36 of the handoff. Drawing
 * admin1 outlines would double-render Taiwan's and the coastline's outline,
 * which already belong to the China Authority Boundary module.
 *
 * @see src/lib/map/administrative/data/README.md for the provenance record.
 */
import { statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PROVINCES,
  SOURCE_TAG,
  assertCoordinatesInRange,
  countVertices,
  fail,
  geometriesOf,
  provinceCodeOf,
  readSourceFeatures,
  runMapshaper,
  toLineParts,
} from "./lib/china-source.mjs";

const OUTPUT_DIR = resolve(process.cwd(), "src/lib/map/administrative/data");

/**
 * The Admin0 polygon replaces Natural Earth's China feature in the World
 * Footprint layer, so it has to match 110m visual weight or China alone would
 * look sharp next to its neighbours. NE 110m draws China with 240 vertices;
 * 0.5% lands at ~640 including the island specks that keep-shapes preserves.
 */
const ADMIN0_SIMPLIFY = "0.5%";

/**
 * Province fills are only ever seen at China-overview zoom, so 25% is ample for
 * the large provinces — they start with thousands of vertices each.
 *
 * A flat percentage is the wrong tool for the small ones, though: 澳门 has only
 * 13 source vertices, and 20% collapsed it to 5, which moved its northern edge
 * south and left the city itself outside its own polygon. Small provinces are
 * therefore kept at full detail. Only three fall under the threshold and they
 * total 410 vertices, so the cost of protecting them is nil.
 *
 * This matters twice over: the fill has to look like 澳门, and the resolver has
 * to agree with the fill about where 澳门 is (§18).
 */
const ADMIN1_SIMPLIFY = "25%";
const ADMIN1_FULL_DETAIL_BELOW = 400;

/**
 * Coverage assertions. Admin0 is drawn at 110m density, where Hong Kong and
 * Macau are sub-pixel and legitimately absent — so they are only required in
 * the admin1 layer, which is what actually has to colour them.
 */
const ADMIN0_COVERAGE = {
  Taiwan: [119, 21.8, 122.1, 25.4],
  Hainan: [108.5, 18.1, 111.1, 20.2],
};
const ADMIN1_COVERAGE = {
  ...ADMIN0_COVERAGE,
  HongKong: [113.8, 22.1, 114.5, 22.6],
  Macau: [113.5, 22.0, 113.7, 22.3],
};

function geometriesCoverRegion(geometries, [west, south, east, north]) {
  for (const geometry of geometries) {
    let hit = false;
    const walk = (coords) => {
      if (hit) return;
      if (typeof coords[0] === "number") {
        if (coords[0] >= west && coords[0] <= east && coords[1] >= south && coords[1] <= north) {
          hit = true;
        }
      } else {
        coords.forEach(walk);
      }
    };
    walk(geometry.coordinates);
    if (hit) return true;
  }
  return false;
}

function write(fileName, collection) {
  const path = `${OUTPUT_DIR}/${fileName}`;
  writeFileSync(path, `${JSON.stringify(collection)}\n`);
  const kb = statSync(path).size / 1024;
  const vertices = collection.features.reduce(
    (total, entry) => total + countVertices(entry.geometry),
    0,
  );
  console.log(`✓ ${fileName}  ${collection.features.length} feature(s), ${vertices} vertices, ${kb.toFixed(1)} KB`);
  return kb;
}

/** Every administrative Feature carries a unique id — §44 relies on it. */
function assertUniqueIds(fileName, features) {
  const ids = features.map((entry) => entry.id);
  if (ids.some((id) => id === undefined || id === null || id === "")) {
    fail(`${fileName}: a feature is missing Feature.id`);
  }
  if (new Set(ids).size !== ids.length) {
    fail(`${fileName}: duplicate Feature.id — this breaks MapLibre feature-state`);
  }
}

function assertCoverage(fileName, geometries, required) {
  for (const [region, box] of Object.entries(required)) {
    if (!geometriesCoverRegion(geometries, box)) {
      fail(`${fileName}: coverage check failed for ${region}`);
    }
  }
}

const features = readSourceFeatures();
const admin = features.filter((entry) => entry.geometry.type !== "MultiLineString");
console.log(`administrative polygons: ${admin.length}`);

// ---------------------------------------------------------------- Admin0 fill

const admin0Geometries = geometriesOf(await runMapshaper(
  { type: "FeatureCollection", features: admin },
  ["-dissolve2", `-simplify ${ADMIN0_SIMPLIFY} keep-shapes`],
));

const admin0Feature = {
  type: "Feature",
  id: "CHN",
  properties: { countryCode: "CHN", name: "China", nameZh: "中国", source: SOURCE_TAG },
  geometry: { type: "MultiPolygon", coordinates: admin0Geometries.flatMap((geometry) => (
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates
  )) },
};

// ---------------------------------------------------------------- Admin1 fills

const withProvinceCode = admin
  .map((entry) => ({ entry, code: provinceCodeOf(entry) }))
  .filter(({ code }) => code !== null)
  .map(({ entry, code }) => ({
    ...entry,
    properties: { ...entry.properties, provinceCode: code },
  }));
console.log(`province-tagged counties: ${withProvinceCode.length}`);

// Dissolve first, then simplify the large provinces only. Running `-simplify`
// over the whole layer would apply its threshold to 澳门's 13 vertices too.
const dissolvedProvinces = (await runMapshaper(
  { type: "FeatureCollection", features: withProvinceCode },
  ["-dissolve2 field=provinceCode"],
)).features ?? [];

const largeProvinces = dissolvedProvinces.filter(
  (feature) => countVertices(feature.geometry) >= ADMIN1_FULL_DETAIL_BELOW,
);
const smallProvinces = dissolvedProvinces.filter(
  (feature) => countVertices(feature.geometry) < ADMIN1_FULL_DETAIL_BELOW,
);
console.log(
  `provinces: ${largeProvinces.length} simplified at ${ADMIN1_SIMPLIFY}, `
  + `${smallProvinces.length} kept at full detail (`
  + `${smallProvinces.map((f) => PROVINCES[String(f.properties.provinceCode)][1]).join(", ")})`,
);

const simplifiedLarge = largeProvinces.length
  ? (await runMapshaper(
    { type: "FeatureCollection", features: largeProvinces },
    [`-simplify ${ADMIN1_SIMPLIFY} keep-shapes`],
  )).features ?? []
  : [];
const dissolvedProvincesFinal = [...simplifiedLarge, ...smallProvinces];

const admin1Features = dissolvedProvincesFinal.map((dissolved) => {
  const code = String(dissolved.properties.provinceCode);
  const names = PROVINCES[code];
  if (!names) fail(`dissolved province ${code} is not in the PROVINCES table`);
  return {
    type: "Feature",
    id: code,
    properties: {
      countryCode: "CHN",
      admin1Code: code,
      name: names[0],
      nameEn: names[1],
      source: SOURCE_TAG,
    },
    geometry: {
      type: "MultiPolygon",
      coordinates: dissolved.geometry.type === "Polygon"
        ? [dissolved.geometry.coordinates]
        : dissolved.geometry.coordinates,
    },
  };
});

const expectedCodes = Object.keys(PROVINCES).sort();
const actualCodes = admin1Features.map((entry) => entry.id).sort();
if (expectedCodes.join() !== actualCodes.join()) {
  fail(`province set mismatch — expected ${expectedCodes.length}, produced ${actualCodes.length}`);
}

// ----------------------------------------------------------- Internal borders

// Shared edges must be taken from the FULL-detail dissolve, not the mixed one.
// `-innerlines` only emits an edge when both neighbours still have it: pairing
// a full-detail 香港 with a simplified 广东 silently dropped the
// 香港–广东 and 澳门–广东 borders entirely. Simplifying the resulting line layer
// on its own keeps every border while staying within the review zoom budget —
// the residual offset against the fills is well under a pixel.
const internalParsed = await runMapshaper(
  { type: "FeatureCollection", features: dissolvedProvinces },
  ["-innerlines", `-simplify ${ADMIN1_SIMPLIFY} keep-shapes`],
);
// One feature holding every shared edge. Emitting a feature per segment would
// repeat the property block thousands of times for no benefit — these borders
// carry no feature-state.
const internalParts = geometriesOf(internalParsed)
  .flatMap((geometry) => toLineParts(geometry))
  .filter((part) => part.length >= 2);
if (internalParts.length === 0) {
  fail("no internal borders produced — provinces would lose their shared edges");
}
console.log(`internal border segments: ${internalParts.length}`);

// Topology guard. `-innerlines` silently omits an edge when its two neighbours
// no longer share one, so assert the borders that must exist really do — and
// that Taiwan, an island, still has none (§34-§36, §102).
const BORDER_PRESENT = {
  "香港–广东": [113.8, 22.1, 114.5, 22.6],
  "澳门–广东": [113.5, 22.0, 113.7, 22.3],
  "上海–江苏/浙江": [120.8, 30.6, 122.2, 31.9],
};
const BORDER_ABSENT = {
  "台湾": [119, 21.8, 122.1, 25.4],
};

function segmentsTouching(box) {
  const [west, south, east, north] = box;
  return internalParts.filter((part) => part.some(([lon, lat]) => (
    lon >= west && lon <= east && lat >= south && lat <= north
  ))).length;
}

for (const [label, box] of Object.entries(BORDER_PRESENT)) {
  const count = segmentsTouching(box);
  if (count === 0) fail(`internal borders are missing ${label} — topology was broken`);
  console.log(`  ✓ ${label}: ${count} segments`);
}
for (const [label, box] of Object.entries(BORDER_ABSENT)) {
  const count = segmentsTouching(box);
  if (count !== 0) {
    fail(`${label} must contribute no internal borders, found ${count} — its outline belongs to the Authority Boundary (§36)`);
  }
  console.log(`  ✓ ${label}: 0 segments (island — outline stays with Authority Boundary)`);
}

const internalFeatures = [{
  type: "Feature",
  properties: {
    countryCode: "CHN",
    renderClass: "china-admin1-internal",
    source: SOURCE_TAG,
  },
  geometry: { type: "MultiLineString", coordinates: internalParts },
}];

// ------------------------------------------------------------------ Validation

for (const [fileName, collection] of [
  ["china-admin0-polygon-v1.json", { features: [admin0Feature] }],
  ["china-admin1-v1.json", { features: admin1Features }],
  ["china-admin1-internal-border-v1.json", { features: internalFeatures }],
]) {
  if (collection.features.length === 0) fail(`${fileName}: no features`);
  for (const entry of collection.features) {
    assertCoordinatesInRange(fileName, entry.geometry.coordinates);
    if (entry.properties.countryCode !== "CHN") fail(`${fileName}: countryCode is not CHN`);
  }
}

assertUniqueIds("china-admin1-v1.json", admin1Features);
assertCoverage("china-admin0-polygon-v1.json", [admin0Feature.geometry], ADMIN0_COVERAGE);

// Taiwan must survive as its own province, not fold into the mainland fill.
if (!admin1Features.some((entry) => entry.id === "710000")) {
  fail("china-admin1-v1.json: Taiwan (710000) is missing");
}
assertCoverage("china-admin1-v1.json", admin1Features.map((entry) => entry.geometry), ADMIN1_COVERAGE);

let total = 0;
total += write("china-admin0-polygon-v1.json", { type: "FeatureCollection", features: [admin0Feature] });
total += write("china-admin1-v1.json", { type: "FeatureCollection", features: admin1Features });
total += write("china-admin1-internal-border-v1.json", { type: "FeatureCollection", features: internalFeatures });

console.log(`\ntotal ${total.toFixed(1)} KB across 3 administrative files`);
if (total > 1024) fail("administrative data exceeds 1 MB — tighten the simplification before shipping");
