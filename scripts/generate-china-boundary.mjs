#!/usr/bin/env node
/**
 * Converts the authorised county-level source dataset into the three Atlas
 * China boundary files.
 *
 * This script never downloads anything (Atlas 中国国境线数据落地与实施文档 §20).
 * The source file must already exist under data-source/. Re-run it by hand only
 * when the source dataset changes, then commit the generated JSON.
 *
 *   node scripts/generate-china-boundary.mjs
 *
 * Geometry work is delegated to mapshaper; this script only classifies
 * features, records Atlas metadata and validates the result.
 *
 * The three administrative companions (`china-admin0-polygon`,
 * `china-admin1`, `china-admin1-internal-border`) come from
 * `generate-china-administrative.mjs`, which shares this source.
 *
 * @see data-source/ is git-ignored. See src/lib/map/boundaries/data/README.md
 *      for the source provenance record.
 */
import { statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SOURCE_TAG,
  assertCoordinatesInRange,
  extent,
  fail,
  geometriesOf,
  readSourceFeatures,
  runMapshaper,
  toLineParts,
} from "./lib/china-source.mjs";

const OUTPUT_DIR = resolve(process.cwd(), "src/lib/map/boundaries/data");

/**
 * The source is already a generalised dataset, so simplification only removes
 * detail that exists. The mainland keeps 70% (~1.8 km per vertex, ample for the
 * overview zooms). Islands and the maritime line are never simplified: Taiwan,
 * Diaoyu and the South China Sea line are the regions the task singles out for
 * the lowest tolerance, and an 8% pass was enough to erase Penghu entirely.
 */
const MAINLAND_SIMPLIFY = "70%";

/** 台湾省 and 三沙市 cover every island the Atlas layer has to draw. */
const ISLAND_GB_PREFIXES = ["15671", "1564603"];

/** The South China Sea discontinuous line is the only line reaching this far south. */
const SOUTH_CHINA_SEA_MAX_LATITUDE = 5;

function lineFeature(geometries, properties) {
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "MultiLineString",
      coordinates: geometries.flatMap((geometry) => toLineParts(geometry)),
    },
  };
}

function validate(collection, fileName) {
  if (collection.type !== "FeatureCollection" || collection.features.length === 0) {
    fail(`${fileName}: not a non-empty FeatureCollection`);
  }
  let vertices = 0;
  for (const entry of collection.features) {
    const parts = entry.geometry?.coordinates ?? [];
    if (parts.length === 0) fail(`${fileName}: empty geometry`);
    for (const part of parts) {
      if (part.length < 2) fail(`${fileName}: a line has fewer than two points`);
      assertCoordinatesInRange(fileName, part);
      vertices += part.length;
    }
    if (entry.properties.countryCode !== "CHN") fail(`${fileName}: countryCode is not CHN`);
    if (entry.properties.sovereignty !== "CHN") fail(`${fileName}: sovereignty is not CHN`);
  }
  return vertices;
}

function write(fileName, collection) {
  const vertices = validate(collection, fileName);
  const path = `${OUTPUT_DIR}/${fileName}`;
  writeFileSync(path, `${JSON.stringify(collection)}\n`);
  const kb = statSync(path).size / 1024;
  console.log(`✓ ${fileName}  ${collection.features.length} feature(s), ${vertices} vertices, ${kb.toFixed(1)} KB`);
  return kb;
}

const features = readSourceFeatures();
const admin = features.filter((entry) => entry.geometry.type !== "MultiLineString");
const lines = features.filter((entry) => entry.geometry.type === "MultiLineString");
console.log(`administrative polygons: ${admin.length}, boundary lines: ${lines.length}`);

const isIsland = (entry) => ISLAND_GB_PREFIXES.some((prefix) => String(entry.properties.gb).startsWith(prefix));
const islandFeatures = admin.filter(isIsland);
const mainlandFeatures = admin.filter((entry) => !isIsland(entry));
console.log(`mainland features: ${mainlandFeatures.length}, island features: ${islandFeatures.length}`);

const southChinaSeaLine = lines.find(
  (entry) => extent([entry])[1] < SOUTH_CHINA_SEA_MAX_LATITUDE,
);
if (!southChinaSeaLine) {
  fail("no South China Sea discontinuous line found — maritime layer stays placeholder (§13/§40)");
}
console.log(`South China Sea line: ${southChinaSeaLine.geometry.coordinates.length} segments`);

const mainlandGeometry = geometriesOf(await runMapshaper(
  { type: "FeatureCollection", features: mainlandFeatures },
  ["-dissolve2", `-simplify ${MAINLAND_SIMPLIFY} keep-shapes`, "-lines"],
));
const islandGeometry = geometriesOf(await runMapshaper(
  { type: "FeatureCollection", features: islandFeatures },
  ["-dissolve2", "-lines"],
));

let total = 0;
total += write("china-national-border-v1.json", {
  type: "FeatureCollection",
  features: [lineFeature(mainlandGeometry, {
    countryCode: "CHN",
    boundaryType: "national",
    sovereignty: "CHN",
    renderClass: "china-national",
    source: SOURCE_TAG,
  })],
});

total += write("china-islands-v1.json", {
  type: "FeatureCollection",
  features: [lineFeature(islandGeometry, {
    countryCode: "CHN",
    boundaryType: "island",
    sovereignty: "CHN",
    renderClass: "china-islands",
    source: SOURCE_TAG,
  })],
});

const maritimeFeatures = southChinaSeaLine.geometry.coordinates
  .filter((part) => part.length >= 2)
  .map((part) => ({
    type: "Feature",
    properties: {
      countryCode: "CHN",
      boundaryType: "maritime",
      sovereignty: "CHN",
      renderClass: "china-maritime",
      source: SOURCE_TAG,
    },
    geometry: { type: "MultiLineString", coordinates: [part] },
  }));
total += write("china-maritime-boundary-v1.json", {
  type: "FeatureCollection",
  features: maritimeFeatures,
});

console.log(`\ntotal ${total.toFixed(1)} KB (target: under 500 KB)`);
if (total > 1024) fail("boundary data exceeds 1 MB — tighten the simplification before shipping");
