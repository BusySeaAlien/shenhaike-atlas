#!/usr/bin/env node
/**
 * One-time backfill of `atlas_places.sovereign_country_code` / `atlas_places.admin1_code`
 * for rows created before those columns existed (handoff §61-§63).
 *
 *   node scripts/backfill-administrative-codes.ts              # dry run
 *   node scripts/backfill-administrative-codes.ts --apply      # write
 *   node scripts/backfill-administrative-codes.ts --remote     # production D1
 *
 * Resolution is coordinate-first, exactly as at runtime, so the backfilled
 * values are the ones the resolver would produce today. Rows whose coordinates
 * fall outside every polygon are reported for a human instead of being guessed
 * from `country` / `region` free text.
 *
 * Requires Node 22.6+ for native TypeScript execution; Atlas pins 24.21.0.
 */
import { execFileSync } from "node:child_process";
import { resolveAdministrativeLocation } from "../src/lib/map/administrative/location.ts";

const CHINA = "CHN";
const PLAYER = "atlas_places";

interface PlaceRow {
  id: number;
  slug: string;
  name: string;
  country: string;
  region: string | null;
  longitude: number;
  latitude: number;
  sovereign_country_code: string | null;
  admin1_code: string | null;
}

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const remote = argv.includes("--remote");

function run(sql: string): string {
  const args = [
    "wrangler", "d1", "execute", "atlas",
    ...(remote ? ["--remote"] : ["--local"]),
    "--json",
    "--command", sql,
  ];
  return execFileSync("npx", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * wrangler sends its banner to stderr, so stdout is the JSON document alone.
 * Anything else means the shape changed and the backfill should stop rather
 * than write codes derived from a mis-parse.
 */
function queryRows(sql: string): PlaceRow[] {
  const output = run(sql);
  let parsed: Array<{ results?: PlaceRow[] }>;
  try {
    parsed = JSON.parse(output) as Array<{ results?: PlaceRow[] }>;
  } catch {
    throw new Error(`could not parse wrangler output as JSON:\n${output.slice(0, 400)}`);
  }
  if (!Array.isArray(parsed)) throw new Error("wrangler output was not a JSON array");
  return parsed.flatMap((entry) => entry.results ?? []);
}

/** Codes are machine-generated, but never interpolate unchecked SQL. */
function sqlLiteral(value: string | null): string {
  if (value === null) return "NULL";
  if (!/^[A-Z0-9]{2,8}$/.test(value)) throw new Error(`refusing to write suspicious code: ${value}`);
  return `'${value}'`;
}

const rows = queryRows(`
  SELECT id, slug, name, country, region, longitude, latitude,
         sovereign_country_code, admin1_code
  FROM ${PLAYER} ORDER BY id
`);
console.log(`places: ${rows.length} (${remote ? "remote" : "local"})`);

const updates: Array<{ row: PlaceRow; country: string | null; admin1: string | null }> = [];
const unresolved: PlaceRow[] = [];

for (const row of rows) {
  const resolved = resolveAdministrativeLocation(row.longitude, row.latitude);
  if (resolved.sovereignCountryCode === null) unresolved.push(row);
  if (row.sovereign_country_code === resolved.sovereignCountryCode && row.admin1_code === resolved.admin1Code) {
    continue;
  }
  updates.push({ row, country: resolved.sovereignCountryCode, admin1: resolved.admin1Code });
}

for (const { row, country, admin1 } of updates) {
  console.log(
    `  ${String(row.id).padStart(3)}  ${row.slug.padEnd(28)} `
    + `${String(row.sovereign_country_code ?? "—")}/${String(row.admin1_code ?? "—")}`
    + `  ->  ${country ?? "—"}/${admin1 ?? "—"}`
    + `   [${row.country} / ${row.region ?? "—"}]`,
  );
}

if (updates.length === 0) {
  console.log("\nnothing to backfill");
} else if (!apply) {
  console.log(`\n${updates.length} row(s) would change — re-run with --apply to write`);
} else {
  const statements = updates.map(({ row, country, admin1 }) => (
    `UPDATE ${PLAYER} SET sovereign_country_code = ${sqlLiteral(country)}, `
    + `admin1_code = ${sqlLiteral(admin1)} WHERE id = ${row.id};`
  ));
  run(statements.join("\n"));
  console.log(`\n✓ updated ${updates.length} row(s)`);
}

// Gate from handoff §62: report rather than guess.
if (unresolved.length > 0) {
  console.log(`\n⚠ ${unresolved.length} place(s) did not resolve to any polygon — resolve by hand:`);
  for (const row of unresolved) {
    console.log(`    ${row.id}  ${row.slug}  ${row.latitude},${row.longitude}  [${row.country} / ${row.region ?? "—"}]`);
  }
} else if (rows.length > 0) {
  console.log("\n✓ every place resolved to a country");
}

// Gate from handoff §63: China rows must also carry a province.
const chinaWithoutProvince = rows.filter((row) => (
  (updates.find((entry) => entry.row.id === row.id)?.country ?? row.sovereign_country_code) === CHINA
  && (updates.find((entry) => entry.row.id === row.id)?.admin1 ?? row.admin1_code) === null
));
if (chinaWithoutProvince.length > 0) {
  console.log(`\n⚠ ${chinaWithoutProvince.length} CHN place(s) have no admin1_code — check by hand:`);
  for (const row of chinaWithoutProvince) {
    console.log(`    ${row.id}  ${row.slug}  ${row.latitude},${row.longitude}`);
  }
}
