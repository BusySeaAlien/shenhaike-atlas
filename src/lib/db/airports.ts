import type { Airport, AirportInput } from "../../types/domain";
import { countryCodeForName } from "../countries";
import { calculateFlightMetrics, type FlightEndpoint } from "../flight-math";
import { validateAirportInput } from "../validation/domain";
import { DataError, isUniqueConstraintError } from "./errors";
import type { AirportRow } from "./rows";
import { toAirport } from "./rows";

const AIRPORT_COLUMNS = `
  id, iata_code, icao_code, name, name_zh, city, city_zh, country, country_code,
  region, latitude, longitude, timezone, elevation_ft, notes, created_at, updated_at
`;

function validated(input: AirportInput): AirportInput {
  const result = validateAirportInput(input);
  if (!result.ok) throw new DataError("validation", "机场信息无效", result.errors);
  return result.value;
}

/**
 * The ISO3 country code is derived from the selected country name, never typed
 * by hand (mirrors how `places` derives its sovereign code). The domestic rule
 * and every Flight's metrics key off this stored code, so it must always agree
 * with `country`.
 */
function resolveCountryCode(country: string): string {
  const code = countryCodeForName(country);
  if (!code) throw new DataError("validation", "国家信息无效", { country: "请选择列表中的国家" });
  return code;
}

export async function listAirports(db: D1Database): Promise<Airport[]> {
  const { results } = await db
    .prepare(`SELECT ${AIRPORT_COLUMNS} FROM atlas_airports ORDER BY iata_code, id`)
    .all<AirportRow>();
  return results.map(toAirport);
}

export async function getAirportById(db: D1Database, id: number): Promise<Airport | null> {
  const row = await db
    .prepare(`SELECT ${AIRPORT_COLUMNS} FROM atlas_airports WHERE id = ?1`)
    .bind(id)
    .first<AirportRow>();
  return row ? toAirport(row) : null;
}

export async function createAirport(db: D1Database, input: AirportInput): Promise<Airport> {
  const value = validated(input);
  const countryCode = resolveCountryCode(value.country);
  try {
    const row = await db
      .prepare(`
        INSERT INTO atlas_airports (
          iata_code, icao_code, name, name_zh, city, city_zh, country, country_code,
          region, latitude, longitude, timezone, elevation_ft, notes
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        RETURNING ${AIRPORT_COLUMNS}
      `)
      .bind(
        value.iataCode,
        value.icaoCode,
        value.name,
        value.nameZh,
        value.city,
        value.cityZh,
        value.country,
        countryCode,
        value.region,
        value.latitude,
        value.longitude,
        value.timezone,
        value.elevationFt,
        value.notes,
      )
      .first<AirportRow>();
    if (!row) throw new Error("Insert returned no airport.");
    return toAirport(row);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DataError("conflict", "机场 IATA 或 ICAO 代码已存在", {
        iataCode: "该 IATA 代码已被使用",
      });
    }
    throw error;
  }
}

interface RelatedFlightRow {
  id: number;
  departure_airport_id: number;
  arrival_airport_id: number;
  dep_latitude: number;
  dep_longitude: number;
  dep_country_code: string;
  arr_latitude: number;
  arr_longitude: number;
  arr_country_code: string;
}

/**
 * Moves an airport's own columns and — when its position or country moved —
 * every related Flight's derived metrics in one atomic `batch()` (handoff §4.6).
 * Only `latitude`, `longitude` and the derived `country_code` trigger a
 * recalculation; name/city/timezone/elevation/notes edits do not.
 */
export async function updateAirport(
  db: D1Database,
  id: number,
  input: AirportInput,
): Promise<Airport> {
  const value = validated(input);
  const countryCode = resolveCountryCode(value.country);
  const existing = await getAirportById(db, id);
  if (!existing) throw new DataError("not_found", "机场不存在");

  const needsRecalc =
    existing.latitude !== value.latitude
    || existing.longitude !== value.longitude
    || existing.countryCode !== countryCode;

  if (!needsRecalc) {
    try {
      const row = await db
        .prepare(`
          UPDATE atlas_airports SET
            iata_code = ?1, icao_code = ?2, name = ?3, name_zh = ?4, city = ?5, city_zh = ?6,
            country = ?7, country_code = ?8, region = ?9, latitude = ?10, longitude = ?11,
            timezone = ?12, elevation_ft = ?13, notes = ?14,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?15
          RETURNING ${AIRPORT_COLUMNS}
        `)
        .bind(
          value.iataCode,
          value.icaoCode,
          value.name,
          value.nameZh,
          value.city,
          value.cityZh,
          value.country,
          countryCode,
          value.region,
          value.latitude,
          value.longitude,
          value.timezone,
          value.elevationFt,
          value.notes,
          id,
        )
        .first<AirportRow>();
      if (!row) throw new DataError("not_found", "机场不存在");
      return toAirport(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new DataError("conflict", "机场 IATA 或 ICAO 代码已存在", {
          iataCode: "该 IATA 代码已被使用",
        });
      }
      throw error;
    }
  }

  const related = await db
    .prepare(`
      SELECT f.id, f.departure_airport_id, f.arrival_airport_id,
        dep.latitude AS dep_latitude, dep.longitude AS dep_longitude, dep.country_code AS dep_country_code,
        arr.latitude AS arr_latitude, arr.longitude AS arr_longitude, arr.country_code AS arr_country_code
      FROM atlas_flights f
      INNER JOIN atlas_airports dep ON dep.id = f.departure_airport_id
      INNER JOIN atlas_airports arr ON arr.id = f.arrival_airport_id
      WHERE f.departure_airport_id = ?1 OR f.arrival_airport_id = ?1
    `)
    .bind(id)
    .all<RelatedFlightRow>();

  const updatedEndpoint: FlightEndpoint = {
    latitude: value.latitude,
    longitude: value.longitude,
    countryCode,
  };

  const statements: D1PreparedStatement[] = [
    db
      .prepare(`
        UPDATE atlas_airports SET
          iata_code = ?1, icao_code = ?2, name = ?3, name_zh = ?4, city = ?5, city_zh = ?6,
          country = ?7, country_code = ?8, region = ?9, latitude = ?10, longitude = ?11,
          timezone = ?12, elevation_ft = ?13, notes = ?14,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?15
      `)
      .bind(
        value.iataCode,
        value.icaoCode,
        value.name,
        value.nameZh,
        value.city,
        value.cityZh,
        value.country,
        countryCode,
        value.region,
        value.latitude,
        value.longitude,
        value.timezone,
        value.elevationFt,
        value.notes,
        id,
      ),
  ];

  for (const flight of related.results) {
    const isDeparture = flight.departure_airport_id === id;
    const departure: FlightEndpoint = isDeparture
      ? updatedEndpoint
      : {
          latitude: flight.dep_latitude,
          longitude: flight.dep_longitude,
          countryCode: flight.dep_country_code,
        };
    const arrival: FlightEndpoint = isDeparture
      ? {
          latitude: flight.arr_latitude,
          longitude: flight.arr_longitude,
          countryCode: flight.arr_country_code,
        }
      : updatedEndpoint;
    const metrics = calculateFlightMetrics(departure, arrival);
    statements.push(
      db
        .prepare(`
          UPDATE atlas_flights SET
            great_circle_km = ?1, route_factor = ?2, route_distance_km = ?3,
            estimated_hours = ?4, is_domestic = ?5,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?6
        `)
        .bind(
          metrics.greatCircleKm,
          metrics.routeFactor,
          metrics.routeDistanceKm,
          metrics.estimatedHours,
          metrics.isDomestic ? 1 : 0,
          flight.id,
        ),
    );
  }

  await db.batch(statements);
  const updated = await getAirportById(db, id);
  if (!updated) throw new DataError("not_found", "机场不存在");
  return updated;
}

export async function deleteAirport(db: D1Database, id: number): Promise<void> {
  const reference = await db
    .prepare(`
      SELECT COUNT(*) AS count FROM atlas_flights
      WHERE departure_airport_id = ?1 OR arrival_airport_id = ?1
    `)
    .bind(id)
    .first<{ count: number }>();
  if ((reference?.count ?? 0) > 0) {
    throw new DataError("conflict", `该机场仍关联 ${reference?.count} 条航班记录，不能删除`);
  }

  const result = await db.prepare("DELETE FROM atlas_airports WHERE id = ?1").bind(id).run();
  if (result.meta.changes === 0) throw new DataError("not_found", "机场不存在");
}
