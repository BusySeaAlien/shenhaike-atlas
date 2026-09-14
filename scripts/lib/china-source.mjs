/**
 * Shared handling of the authorised China source dataset.
 *
 * Both `generate-china-boundary.mjs` and `generate-china-administrative.mjs`
 * read the same county-level file and validate it the same way, so the source
 * contract lives here rather than being duplicated.
 *
 * Nothing in here downloads anything.
 *
 * @see src/lib/map/boundaries/data/README.md and
 *      src/lib/map/administrative/data/README.md for provenance records.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import mapshaper from "mapshaper";

export const SOURCE_PATH = resolve(process.cwd(), "data-source/中国_县.geojson");

/** Declared by the source file; verified before any conversion. */
export const EXPECTED_SOURCE_CRS = "urn:ogc:def:crs:EPSG::4490"; // CGCS2000
export const SOURCE_TAG = "cn-authorised-county-2026-09-14";

/** Output coordinates are metres-accurate, far beyond what these zooms need. */
const COORDINATE_PRECISION = 0.00001;

/** The 34 province-level divisions, keyed by the six-digit GB/T 2260 code. */
export const PROVINCES = {
  110000: ["北京市", "Beijing"],
  120000: ["天津市", "Tianjin"],
  130000: ["河北省", "Hebei"],
  140000: ["山西省", "Shanxi"],
  150000: ["内蒙古自治区", "Inner Mongolia"],
  210000: ["辽宁省", "Liaoning"],
  220000: ["吉林省", "Jilin"],
  230000: ["黑龙江省", "Heilongjiang"],
  310000: ["上海市", "Shanghai"],
  320000: ["江苏省", "Jiangsu"],
  330000: ["浙江省", "Zhejiang"],
  340000: ["安徽省", "Anhui"],
  350000: ["福建省", "Fujian"],
  360000: ["江西省", "Jiangxi"],
  370000: ["山东省", "Shandong"],
  410000: ["河南省", "Henan"],
  420000: ["湖北省", "Hubei"],
  430000: ["湖南省", "Hunan"],
  440000: ["广东省", "Guangdong"],
  450000: ["广西壮族自治区", "Guangxi"],
  460000: ["海南省", "Hainan"],
  500000: ["重庆市", "Chongqing"],
  510000: ["四川省", "Sichuan"],
  520000: ["贵州省", "Guizhou"],
  530000: ["云南省", "Yunnan"],
  540000: ["西藏自治区", "Tibet"],
  610000: ["陕西省", "Shaanxi"],
  620000: ["甘肃省", "Gansu"],
  630000: ["青海省", "Qinghai"],
  640000: ["宁夏回族自治区", "Ningxia"],
  650000: ["新疆维吾尔自治区", "Xinjiang"],
  710000: ["台湾省", "Taiwan"],
  810000: ["香港特别行政区", "Hong Kong"],
  820000: ["澳门特别行政区", "Macau"],
};

export function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/** Reads and validates the source. Exits non-zero on anything unexpected. */
export function readSourceFeatures() {
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

/** The six-digit province code for a county feature, or null if absent. */
export function provinceCodeOf(feature) {
  const gb = String(feature.properties?.gb ?? "");
  if (!gb.startsWith("156") || gb.length < 8) return null;
  const code = gb.slice(3, 5);
  return PROVINCES[`${code}0000`] ? `${code}0000` : null;
}

/** @returns {[number, number, number, number]} [west, south, east, north] */
export function extent(features) {
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
 * Runs a mapshaper command pipeline over an in-memory FeatureCollection.
 *
 * mapshaper returns either a bare GeometryCollection (once attributes are
 * dropped) or a FeatureCollection, so `geometriesOf` normalises both.
 */
export async function runMapshaper(collection, commands) {
  const output = await mapshaper.applyCommands(
    ["-i in.json", ...commands, `-o out.json format=geojson precision=${COORDINATE_PRECISION}`].join(" "),
    { "in.json": JSON.stringify(collection) },
  );
  const parsed = JSON.parse(output["out.json"]);
  if (parsed.type === "GeometryCollection" && parsed.geometries.length === 0) {
    fail("mapshaper produced no geometry");
  }
  return parsed;
}

/** Normalises mapshaper output into a flat geometry list. */
export function geometriesOf(parsed) {
  if (parsed.type === "GeometryCollection") return parsed.geometries;
  if (Array.isArray(parsed.features)) return parsed.features.map((feature) => feature.geometry);
  if (parsed.type) return [parsed];
  return [];
}

/**
 * Flattens any geometry into an array of LINES, each an array of positions.
 *
 * Every branch must return the same nesting level: a LineString is wrapped so
 * it yields one line rather than its bare positions. Returning inconsistent
 * levels made the result ragged — fine while every caller fed it
 * MultiLineStrings, wrong the moment `-innerlines` supplied LineStrings.
 */
export function toLineParts(geometry) {
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.flatMap(toLineParts);
  }
  fail(`unexpected geometry type ${geometry.type}`);
}

/** Flattens any geometry into polygon rings. */
export function toPolygonRings(geometry) {
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.flatMap(toPolygonRings);
  }
  fail(`unexpected geometry type ${geometry.type}, expected a polygon`);
}

/** Counts every coordinate pair in a geometry. */
export function countVertices(geometry) {
  let total = 0;
  const walk = (coords) => {
    if (typeof coords[0] === "number") total += 1;
    else coords.forEach(walk);
  };
  walk(geometry.coordinates);
  return total;
}

/** Shared coordinate range checks. Throws via `fail` when anything is off. */
export function assertCoordinatesInRange(fileName, coordinates) {
  const walk = (coords) => {
    if (typeof coords[0] === "number") {
      const [longitude, latitude] = coords;
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        fail(`${fileName}: non-numeric coordinate`);
      }
      if (longitude < -180 || longitude > 180) fail(`${fileName}: longitude out of range`);
      if (latitude < -90 || latitude > 90) fail(`${fileName}: latitude out of range`);
    } else {
      coords.forEach(walk);
    }
  };
  walk(coordinates);
}
