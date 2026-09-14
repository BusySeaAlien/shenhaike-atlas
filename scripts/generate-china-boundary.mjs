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
 * @see data-source/ is git-ignored. See src/lib/map/boundaries/data/README.md
 *      for the source provenance record.
 */
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import mapshaper from "mapshaper";

const SOURCE_PATH = resolve(process.cwd(), "data-source/中国_县.geojson");
const OUTPUT_DIR = resolve(process.cwd(), "src/lib/map/boundaries/data");

/** Declared by the source file; verified below before any conversion. */
const EXPECTED_SOURCE_CRS = "urn:ogc:def:crs:EPSG::4490"; // CGCS2000
const SOURCE_TAG = "cn-authorised-county-2026-09-14";

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

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function readSource() {
  let raw;
  try {
    raw = readFileSync(SOURCE_PATH, "utf8");
  } catch {
    fail(`source dataset not found at ${SOURCE_PATH}`);
  }
  const data = JSON.parse(raw);
  if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    fail("source dataset is not a GeoJSON FeatureCollection");
  }
  const declaredCrs = data.crs?.properties?.name;
  if (declaredCrs !== EXPECTED_SOURCE_CRS) {
    fail(`source CRS is ${declaredCrs ?? "undeclared"}, expected ${EXPECTED_SOURCE_CRS}`);
  }
  console.log(`source: ${data.features.length} features, CRS ${declaredCrs}`);
  return data.features;
}

/** @returns {[number, number, number, number]} [west, south, east, north] */
function extent(features) {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (coords) => {
    if (typeof coords[0] === "number") {
      w = Math.min(w, coords[0]);
      s = Math.min(s, coords[1]);
      e = Math.max(e, coords[0]);
      n = Math.max(n, coords[1]);
    } else {
      coords.forEach(walk);
    }
  };
  features.forEach((feature) => walk(feature.geometry.coordinates));
  return [w, s, e, n];
}

/**
 * Dissolves a feature group into a single geometry with mapshaper.
 * mapshaper returns a bare GeometryCollection once attributes are dropped,
 * so the result is wrapped into an Atlas Feature here.
 */
async function dissolve(collection, { simplify }) {
  const commands = ["-i in.json", "-dissolve2"];
  if (simplify) commands.push(`-simplify ${MAINLAND_SIMPLIFY} keep-shapes`);
  commands.push("-lines", "-o out.json format=geojson precision=0.00001");

  const output = await mapshaper.applyCommands(
    commands.join(" "),
    { "in.json": JSON.stringify(collection) },
  );
  const parsed = JSON.parse(output["out.json"]);
  const geometries = parsed.type === "GeometryCollection"
    ? parsed.geometries
    : (parsed.features ?? []).map((feature) => feature.geometry);
  if (geometries.length === 0) fail("dissolve produced no geometry");
  return geometries.length === 1 ? geometries[0] : { type: "GeometryCollection", geometries };
}

/** Flattens an Atlas geometry into the LineString parts a border layer draws. */
function toLineStrings(geometry) {
  if (geometry.type === "LineString") return geometry.coordinates;
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.flatMap(toLineStrings);
  }
  fail(`unexpected geometry type ${geometry.type}`);
}

function feature(geometries, properties) {
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "MultiLineString",
      coordinates: geometries.flatMap((g) => toLineStrings(g)),
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
      for (const [longitude, latitude] of part) {
        if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
          fail(`${fileName}: non-numeric coordinate`);
        }
        if (longitude < -180 || longitude > 180) fail(`${fileName}: longitude out of range`);
        if (latitude < -90 || latitude > 90) fail(`${fileName}: latitude out of range`);
        vertices += 1;
      }
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

const features = readSource();
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

const mainlandGeometry = await dissolve(
  { type: "FeatureCollection", features: mainlandFeatures },
  { simplify: true },
);
const islandGeometry = await dissolve(
  { type: "FeatureCollection", features: islandFeatures },
  { simplify: false },
);

let total = 0;
total += write("china-national-border-v1.json", {
  type: "FeatureCollection",
  features: [feature([mainlandGeometry], {
    countryCode: "CHN",
    boundaryType: "national",
    sovereignty: "CHN",
    renderClass: "china-national",
    source: SOURCE_TAG,
  })],
});

total += write("china-islands-v1.json", {
  type: "FeatureCollection",
  features: [feature([islandGeometry], {
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
