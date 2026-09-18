import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const projectRoot = new URL("../", import.meta.url);
const wrangler = new URL("node_modules/.bin/wrangler", projectRoot).pathname;
const stateDirectory = mkdtempSync(join(tmpdir(), "atlas-d1-"));

function run(arguments_, options = {}) {
  return execFileSync(wrangler, arguments_, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function execute(sql) {
  const output = run([
    "d1",
    "execute",
    "DB",
    "--local",
    "--persist-to",
    stateDirectory,
    "--command",
    sql,
    "--json",
  ]);
  return JSON.parse(output);
}

function firstRow(response) {
  const result = Array.isArray(response) ? response[0] : response;
  return result?.results?.[0];
}

function expectFailure(label, sql) {
  try {
    execute(sql);
  } catch {
    return;
  }
  throw new Error(`${label} unexpectedly succeeded.`);
}

try {
  run([
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--persist-to",
    stateDirectory,
  ]);
  run([
    "d1",
    "execute",
    "DB",
    "--local",
    "--persist-to",
    stateDirectory,
    "--file",
    "seed.sql",
  ]);

  const counts = firstRow(
    execute(`
      SELECT
        (SELECT COUNT(*) FROM atlas_places) AS atlas_places,
        (SELECT COUNT(*) FROM atlas_journeys) AS atlas_journeys,
        (SELECT COUNT(*) FROM atlas_visits) AS atlas_visits,
        (SELECT COUNT(*) FROM atlas_wishlist_items) AS atlas_wishlist_items
    `),
  );
  if (
    counts?.atlas_places !== 5
    || counts?.atlas_journeys !== 4
    || counts?.atlas_visits !== 9
    || counts?.atlas_wishlist_items !== 3
  ) {
    throw new Error(`Unexpected seed counts: ${JSON.stringify(counts)}`);
  }

  const repeats = firstRow(
    execute(`
      SELECT COUNT(*) AS count FROM atlas_visits
      WHERE place_id = (SELECT id FROM atlas_places WHERE slug = 'shanghai-pudong-airport')
    `),
  );
  if ((repeats?.count ?? 0) < 2) throw new Error("Seed does not cover repeat visits.");

  expectFailure(
    "duplicate place slug",
    `INSERT INTO atlas_places (slug, name, country, latitude, longitude)
     VALUES ('sayram-lake', 'Duplicate', 'China', 1, 1)`,
  );
  expectFailure(
    "invalid latitude",
    `INSERT INTO atlas_places (slug, name, country, latitude, longitude)
     VALUES ('invalid-coordinate', 'Invalid', 'China', 91, 1)`,
  );
  expectFailure(
    "wishlist latitude out of range",
    `INSERT INTO atlas_wishlist_items (name, country, latitude, longitude)
     VALUES ('Invalid Wishlist', 'China', 91, 1)`,
  );
  expectFailure(
    "wishlist longitude out of range",
    `INSERT INTO atlas_wishlist_items (name, country, latitude, longitude)
     VALUES ('Invalid Wishlist', 'China', 1, 181)`,
  );
  expectFailure(
    "missing foreign keys",
    `INSERT INTO atlas_visits (place_id, journey_id, visited_at, sequence)
     VALUES (99999, 99999, '2026-01-01', 1)`,
  );
  expectFailure(
    "visit outside journey range",
    `INSERT INTO atlas_visits (place_id, journey_id, visited_at, sequence)
     VALUES (
       (SELECT id FROM atlas_places WHERE slug = 'sayram-lake'),
       (SELECT id FROM atlas_journeys WHERE slug = 'xinjiang-2026'),
       '2026-01-01',
       90
     )`,
  );
  expectFailure(
    "invalid partial date",
    `INSERT INTO atlas_journeys (slug, name, start_date, end_date)
     VALUES ('invalid-partial-date', 'Invalid Partial Date', '1998-13', '1998-13')`,
  );
  expectFailure(
    "referenced place deletion",
    `DELETE FROM atlas_places WHERE slug = 'sayram-lake'`,
  );
  expectFailure(
    "journey range excluding visits",
    `UPDATE atlas_journeys SET start_date = '2026-08-18' WHERE slug = 'xinjiang-2026'`,
  );
  expectFailure(
    "invalid transport mode",
    `INSERT INTO atlas_visits (place_id, journey_id, visited_at, sequence, transport_mode)
     VALUES (
       (SELECT id FROM atlas_places WHERE slug = 'sayram-lake'),
       (SELECT id FROM atlas_journeys WHERE slug = 'xinjiang-2026'),
       '2026-08-15',
       90,
       'rocket'
     )`,
  );

  execute(`
    INSERT INTO atlas_journeys (slug, name, start_date, end_date)
    VALUES ('partial-date-check', 'Partial Date Check', '1998', '1998-07');
    INSERT INTO atlas_visits (place_id, journey_id, visited_at, sequence)
    VALUES (
      (SELECT id FROM atlas_places WHERE slug = 'sayram-lake'),
      (SELECT id FROM atlas_journeys WHERE slug = 'partial-date-check'),
      '1998-07',
      1
    );
  `);

  execute(`
    INSERT INTO atlas_journeys (slug, name, start_date, end_date)
    VALUES ('cascade-check', 'Cascade Check', '2026-09-01', '2026-09-02');
    INSERT INTO atlas_visits (place_id, journey_id, visited_at, sequence)
    VALUES (
      (SELECT id FROM atlas_places WHERE slug = 'sayram-lake'),
      (SELECT id FROM atlas_journeys WHERE slug = 'cascade-check'),
      '2026-09-01',
      1
    );
    DELETE FROM atlas_journeys WHERE slug = 'cascade-check';
  `);
  const orphan = firstRow(
    execute(`SELECT COUNT(*) AS count FROM atlas_visits WHERE journey_id NOT IN (SELECT id FROM atlas_journeys)`),
  );
  if (orphan?.count !== 0) throw new Error("Journey deletion left orphan visits.");

  // Every legal transport enum value must be accepted by the real SQLite CHECK
  // in the migration; Vitest alone can only prove the TS validator accepts it
  // (Wishlist & mileage handoff §10.2).
  execute(`
    INSERT INTO atlas_journeys (slug, name, start_date, end_date)
    VALUES ('transport-enum-check', 'Transport Enum Check', '2026-09-01', '2026-09-30');
    INSERT INTO atlas_visits (place_id, journey_id, visited_at, sequence, transport_mode)
    VALUES
      ((SELECT id FROM atlas_places WHERE slug = 'sayram-lake'), (SELECT id FROM atlas_journeys WHERE slug = 'transport-enum-check'), '2026-09-01', 1, 'plane'),
      ((SELECT id FROM atlas_places WHERE slug = 'sayram-lake'), (SELECT id FROM atlas_journeys WHERE slug = 'transport-enum-check'), '2026-09-02', 2, 'train'),
      ((SELECT id FROM atlas_places WHERE slug = 'sayram-lake'), (SELECT id FROM atlas_journeys WHERE slug = 'transport-enum-check'), '2026-09-03', 3, 'ship'),
      ((SELECT id FROM atlas_places WHERE slug = 'sayram-lake'), (SELECT id FROM atlas_journeys WHERE slug = 'transport-enum-check'), '2026-09-04', 4, 'car'),
      ((SELECT id FROM atlas_places WHERE slug = 'sayram-lake'), (SELECT id FROM atlas_journeys WHERE slug = 'transport-enum-check'), '2026-09-05', 5, 'bus'),
      ((SELECT id FROM atlas_places WHERE slug = 'sayram-lake'), (SELECT id FROM atlas_journeys WHERE slug = 'transport-enum-check'), '2026-09-06', 6, 'walk'),
      ((SELECT id FROM atlas_places WHERE slug = 'sayram-lake'), (SELECT id FROM atlas_journeys WHERE slug = 'transport-enum-check'), '2026-09-07', 7, 'other');
  `);
  const enumModes = firstRow(
    execute(`SELECT COUNT(DISTINCT transport_mode) AS count FROM atlas_visits WHERE transport_mode IS NOT NULL`),
  );
  if (enumModes?.count !== 7) {
    throw new Error(`Transport enum CHECK accepted only ${enumModes?.count} of 7 modes.`);
  }

  process.stdout.write("Database verification passed: empty migration, seed, constraints, repeats, cascades, wishlist, and transport enum.\n");
} finally {
  if (stateDirectory.startsWith(tmpdir()) && stateDirectory.includes("atlas-d1-")) {
    rmSync(stateDirectory, { recursive: true, force: true });
  }
}
