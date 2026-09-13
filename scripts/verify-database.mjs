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
    "atlas",
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
    "atlas",
    "--local",
    "--persist-to",
    stateDirectory,
  ]);
  run([
    "d1",
    "execute",
    "atlas",
    "--local",
    "--persist-to",
    stateDirectory,
    "--file",
    "seed.sql",
  ]);

  const counts = firstRow(
    execute(`
      SELECT
        (SELECT COUNT(*) FROM places) AS places,
        (SELECT COUNT(*) FROM journeys) AS journeys,
        (SELECT COUNT(*) FROM visits) AS visits
    `),
  );
  if (counts?.places !== 5 || counts?.journeys !== 4 || counts?.visits !== 9) {
    throw new Error(`Unexpected seed counts: ${JSON.stringify(counts)}`);
  }

  const repeats = firstRow(
    execute(`
      SELECT COUNT(*) AS count FROM visits
      WHERE place_id = (SELECT id FROM places WHERE slug = 'shanghai-pudong-airport')
    `),
  );
  if ((repeats?.count ?? 0) < 2) throw new Error("Seed does not cover repeat visits.");

  expectFailure(
    "duplicate place slug",
    `INSERT INTO places (slug, name, country, latitude, longitude)
     VALUES ('sayram-lake', 'Duplicate', 'China', 1, 1)`,
  );
  expectFailure(
    "invalid latitude",
    `INSERT INTO places (slug, name, country, latitude, longitude)
     VALUES ('invalid-coordinate', 'Invalid', 'China', 91, 1)`,
  );
  expectFailure(
    "missing foreign keys",
    `INSERT INTO visits (place_id, journey_id, visited_at, sequence)
     VALUES (99999, 99999, '2026-01-01', 1)`,
  );
  expectFailure(
    "visit outside journey range",
    `INSERT INTO visits (place_id, journey_id, visited_at, sequence)
     VALUES (
       (SELECT id FROM places WHERE slug = 'sayram-lake'),
       (SELECT id FROM journeys WHERE slug = 'xinjiang-2026'),
       '2026-01-01',
       90
     )`,
  );
  expectFailure(
    "referenced place deletion",
    `DELETE FROM places WHERE slug = 'sayram-lake'`,
  );
  expectFailure(
    "journey range excluding visits",
    `UPDATE journeys SET start_date = '2026-08-18' WHERE slug = 'xinjiang-2026'`,
  );

  execute(`
    INSERT INTO journeys (slug, name, start_date, end_date)
    VALUES ('cascade-check', 'Cascade Check', '2026-09-01', '2026-09-02');
    INSERT INTO visits (place_id, journey_id, visited_at, sequence)
    VALUES (
      (SELECT id FROM places WHERE slug = 'sayram-lake'),
      (SELECT id FROM journeys WHERE slug = 'cascade-check'),
      '2026-09-01',
      1
    );
    DELETE FROM journeys WHERE slug = 'cascade-check';
  `);
  const orphan = firstRow(
    execute(`SELECT COUNT(*) AS count FROM visits WHERE journey_id NOT IN (SELECT id FROM journeys)`),
  );
  if (orphan?.count !== 0) throw new Error("Journey deletion left orphan visits.");

  process.stdout.write("Database verification passed: empty migration, seed, constraints, repeats, and cascades.\n");
} finally {
  if (stateDirectory.startsWith(tmpdir()) && stateDirectory.includes("atlas-d1-")) {
    rmSync(stateDirectory, { recursive: true, force: true });
  }
}
