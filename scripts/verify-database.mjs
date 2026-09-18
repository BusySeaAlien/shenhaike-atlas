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

  // --- Flight archive (Flight handoff §13.4) ---
  const flightTables = firstRow(
    execute(`
      SELECT COUNT(*) AS count FROM sqlite_master
      WHERE type = 'table' AND name IN ('atlas_airports', 'atlas_airlines', 'atlas_aircraft_types', 'atlas_flights')
    `),
  );
  if (flightTables?.count !== 4) throw new Error("Flight archive tables are missing.");

  const flightIndexes = firstRow(
    execute(`
      SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name IN (
        'atlas_airports_country_idx', 'atlas_airports_name_idx',
        'atlas_flights_date_idx', 'atlas_flights_type_date_idx', 'atlas_flights_airline_idx',
        'atlas_flights_aircraft_idx', 'atlas_flights_departure_idx', 'atlas_flights_arrival_idx',
        'atlas_flights_journey_idx'
      )
    `),
  );
  if (flightIndexes?.count !== 9) throw new Error("Flight archive indexes are missing.");

  execute(`
    INSERT INTO atlas_airports (iata_code, icao_code, name, city, country, country_code, latitude, longitude, timezone)
    VALUES
      ('PVG', 'ZSPD', 'Shanghai Pudong International Airport', 'Shanghai', 'China', 'CHN', 31.1443, 121.8083, 'Asia/Shanghai'),
      ('PEK', 'ZBAA', 'Beijing Capital International Airport', 'Beijing', 'China', 'CHN', 40.0799, 116.6031, 'Asia/Shanghai'),
      ('HKG', 'VHHH', 'Hong Kong International Airport', 'Hong Kong', 'Hong Kong', 'HKG', 22.308, 113.9185, 'Asia/Hong_Kong'),
      ('CDG', 'LFPG', 'Paris Charles de Gaulle Airport', 'Paris', 'France', 'FRA', 49.0097, 2.5479, 'Europe/Paris');

    INSERT INTO atlas_airlines (iata_code, icao_code, name, country, country_code)
    VALUES ('MU', 'CES', 'China Eastern Airlines', 'China', 'CHN'),
           ('AF', 'AFR', 'Air France', 'France', 'FRA');

    INSERT INTO atlas_aircraft_types (icao_code, manufacturer, model)
    VALUES ('A320', 'Airbus', 'A320-200'),
           ('B77W', 'Boeing', '777-300ER');
  `);

  execute(`
    INSERT INTO atlas_flights (airline_id, flight_number, flight_date, departure_airport_id, arrival_airport_id, great_circle_km, route_factor, route_distance_km, estimated_hours, is_domestic)
    VALUES (
      (SELECT id FROM atlas_airlines WHERE iata_code = 'MU'),
      '5123', '2026-08-14',
      (SELECT id FROM atlas_airports WHERE iata_code = 'PVG'),
      (SELECT id FROM atlas_airports WHERE iata_code = 'PEK'),
      1099.4, 1.08, 1187.3, 1.7, 1
    );
    INSERT INTO atlas_flights (airline_id, flight_number, flight_date, departure_airport_id, arrival_airport_id, great_circle_km, route_factor, route_distance_km, estimated_hours, is_domestic)
    VALUES (
      (SELECT id FROM atlas_airlines WHERE iata_code = 'MU'),
      '5124', '2026-08-15',
      (SELECT id FROM atlas_airports WHERE iata_code = 'PVG'),
      (SELECT id FROM atlas_airports WHERE iata_code = 'HKG'),
      1234.5, 1.08, 1333.3, 2.1, 0
    );
  `);

  const flightCounts = firstRow(
    execute(`
      SELECT
        SUM(CASE WHEN is_domestic = 1 THEN 1 ELSE 0 END) AS domestic,
        SUM(CASE WHEN is_domestic = 0 THEN 1 ELSE 0 END) AS international,
        COUNT(*) AS total
      FROM atlas_flights
    `),
  );
  if (flightCounts?.domestic !== 1 || flightCounts?.international !== 1 || flightCounts?.total !== 2) {
    throw new Error(`Unexpected domestic/international split: ${JSON.stringify(flightCounts)}`);
  }

  expectFailure(
    "duplicate airport IATA",
    `INSERT INTO atlas_airports (iata_code, name, city, country, country_code, latitude, longitude, timezone)
     VALUES ('PVG', 'Duplicate', 'Shanghai', 'China', 'CHN', 1, 1, 'Asia/Shanghai')`,
  );
  expectFailure(
    "flight number with letters",
    `INSERT INTO atlas_flights (airline_id, flight_number, flight_date, departure_airport_id, arrival_airport_id, great_circle_km, route_factor, route_distance_km, estimated_hours, is_domestic)
     VALUES (1, 'MU123', '2026-08-16', 1, 2, 100, 1.08, 108, 0.5, 1)`,
  );
  expectFailure(
    "same departure and arrival airport",
    `INSERT INTO atlas_flights (airline_id, flight_number, flight_date, departure_airport_id, arrival_airport_id, great_circle_km, route_factor, route_distance_km, estimated_hours, is_domestic)
     VALUES (1, '9999', '2026-08-16', 1, 1, 100, 1.08, 108, 0.5, 1)`,
  );
  expectFailure(
    "invalid cabin class",
    `INSERT INTO atlas_flights (airline_id, flight_number, flight_date, departure_airport_id, arrival_airport_id, great_circle_km, route_factor, route_distance_km, estimated_hours, is_domestic, cabin_class)
     VALUES (1, '9998', '2026-08-16', 1, 2, 100, 1.08, 108, 0.5, 1, 'royal')`,
  );
  expectFailure(
    "non-positive great circle distance",
    `INSERT INTO atlas_flights (airline_id, flight_number, flight_date, departure_airport_id, arrival_airport_id, great_circle_km, route_factor, route_distance_km, estimated_hours, is_domestic)
     VALUES (1, '9997', '2026-08-16', 1, 2, 0, 1.08, 108, 0.5, 1)`,
  );
  expectFailure(
    "duplicate flight unique combination",
    `INSERT INTO atlas_flights (airline_id, flight_number, flight_date, departure_airport_id, arrival_airport_id, great_circle_km, route_factor, route_distance_km, estimated_hours, is_domestic)
     VALUES (
       (SELECT id FROM atlas_airlines WHERE iata_code = 'MU'),
       '5123', '2026-08-14',
       (SELECT id FROM atlas_airports WHERE iata_code = 'PVG'),
       (SELECT id FROM atlas_airports WHERE iata_code = 'PEK'),
       1099.4, 1.08, 1187.3, 1.7, 1
     )`,
  );
  expectFailure(
    "referenced airport deletion",
    `DELETE FROM atlas_airports WHERE iata_code = 'PVG'`,
  );
  expectFailure(
    "referenced airline deletion",
    `DELETE FROM atlas_airlines WHERE iata_code = 'MU'`,
  );

  execute(`
    UPDATE atlas_flights SET aircraft_type_id = (SELECT id FROM atlas_aircraft_types WHERE icao_code = 'A320') WHERE flight_number = '5123';
  `);
  expectFailure(
    "referenced aircraft type deletion",
    `DELETE FROM atlas_aircraft_types WHERE icao_code = 'A320'`,
  );

  execute(`
    INSERT INTO atlas_journeys (slug, name, start_date, end_date)
    VALUES ('flight-journey', 'Flight Journey', '2026-08-14', '2026-08-15');
    UPDATE atlas_flights SET journey_id = (SELECT id FROM atlas_journeys WHERE slug = 'flight-journey') WHERE flight_number = '5123';
    DELETE FROM atlas_journeys WHERE slug = 'flight-journey';
  `);
  const nulledJourney = firstRow(
    execute(`SELECT journey_id FROM atlas_flights WHERE flight_number = '5123'`),
  );
  if (nulledJourney?.journey_id !== null) throw new Error("Journey deletion did not null the flight's journey_id.");

  execute(`DELETE FROM atlas_flights WHERE flight_number = '5124'`);
  const survivors = firstRow(
    execute(`
      SELECT
        (SELECT COUNT(*) FROM atlas_airports WHERE iata_code = 'HKG') AS airport,
        (SELECT COUNT(*) FROM atlas_airlines WHERE iata_code = 'MU') AS airline,
        (SELECT COUNT(*) FROM atlas_aircraft_types WHERE icao_code = 'A320') AS aircraft
    `),
  );
  if (survivors?.airport !== 1 || survivors?.airline !== 1 || survivors?.aircraft !== 1) {
    throw new Error("Flight deletion cascaded into the reference tables.");
  }

  process.stdout.write("Database verification passed: core archive, constraints, wishlist, and flight archive.\n");
} finally {
  if (stateDirectory.startsWith(tmpdir()) && stateDirectory.includes("atlas-d1-")) {
    rmSync(stateDirectory, { recursive: true, force: true });
  }
}
