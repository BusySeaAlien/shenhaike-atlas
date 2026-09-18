import type { Flight, FlightInput } from "../../types/domain";
import { calculateFlightMetrics, type FlightEndpoint } from "../flight-math";
import { validateFlightInput } from "../validation/domain";
import { DataError, isUniqueConstraintError } from "./errors";
import type { FlightRow } from "./rows";
import { toFlight } from "./rows";

const FLIGHT_COLUMNS = `
  id, airline_id, flight_number, flight_date, departure_airport_id, arrival_airport_id,
  journey_id, aircraft_type_id, aircraft_registration, scheduled_departure_local,
  scheduled_arrival_local, cabin_class, seat_number, notes, great_circle_km,
  route_factor, route_distance_km, estimated_hours, formula_version, is_domestic,
  created_at, updated_at
`;

function validated(input: FlightInput): FlightInput {
  const result = validateFlightInput(input);
  if (!result.ok) throw new DataError("validation", "航班信息无效", result.errors);
  return result.value;
}

/**
 * Confirms the referenced Airline, airports, aircraft type and Journey all
 * exist, then computes the derived metrics from the two airports. Client-supplied
 * d/k/D/T/classification/version are never read (handoff §4.5).
 */
async function resolveFlightRelations(
  db: D1Database,
  value: FlightInput,
): Promise<ReturnType<typeof calculateFlightMetrics>> {
  const airline = await db
    .prepare("SELECT id FROM atlas_airlines WHERE id = ?1")
    .bind(value.airlineId)
    .first<{ id: number }>();
  if (!airline) throw new DataError("validation", "航司不存在", { airlineId: "请选择有效航司" });

  const departure = await db
    .prepare("SELECT latitude, longitude, country_code FROM atlas_airports WHERE id = ?1")
    .bind(value.departureAirportId)
    .first<{ latitude: number; longitude: number; country_code: string }>();
  if (!departure) {
    throw new DataError("validation", "出发机场不存在", { departureAirportId: "请选择有效机场" });
  }

  const arrival = await db
    .prepare("SELECT latitude, longitude, country_code FROM atlas_airports WHERE id = ?1")
    .bind(value.arrivalAirportId)
    .first<{ latitude: number; longitude: number; country_code: string }>();
  if (!arrival) {
    throw new DataError("validation", "到达机场不存在", { arrivalAirportId: "请选择有效机场" });
  }

  if (value.aircraftTypeId) {
    const aircraftType = await db
      .prepare("SELECT id FROM atlas_aircraft_types WHERE id = ?1")
      .bind(value.aircraftTypeId)
      .first<{ id: number }>();
    if (!aircraftType) {
      throw new DataError("validation", "机型不存在", { aircraftTypeId: "请选择有效机型" });
    }
  }

  if (value.journeyId) {
    const journey = await db
      .prepare("SELECT id FROM atlas_journeys WHERE id = ?1")
      .bind(value.journeyId)
      .first<{ id: number }>();
    if (!journey) throw new DataError("validation", "旅程不存在", { journeyId: "请选择有效旅程" });
  }

  return calculateFlightMetrics(
    {
      latitude: departure.latitude,
      longitude: departure.longitude,
      countryCode: departure.country_code,
    } satisfies FlightEndpoint,
    {
      latitude: arrival.latitude,
      longitude: arrival.longitude,
      countryCode: arrival.country_code,
    } satisfies FlightEndpoint,
  );
}

/** Enriched view for the admin list, assembled in one JOIN (no per-flight reads). */
export interface FlightSummary {
  id: number;
  displayNumber: string;
  flightDate: string;
  isDomestic: boolean;
  routeDistanceKm: number;
  estimatedHours: number;
  airlineName: string;
  airlineNameZh: string | null;
  departureLabel: string;
  arrivalLabel: string;
  journeyName: string | null;
  journeyNameZh: string | null;
}

interface FlightSummaryRow {
  id: number;
  flight_number: string;
  flight_date: string;
  is_domestic: number;
  route_distance_km: number;
  estimated_hours: number;
  airline_iata: string;
  airline_name: string;
  airline_name_zh: string | null;
  dep_iata: string;
  dep_name_zh: string | null;
  dep_name: string;
  arr_iata: string;
  arr_name_zh: string | null;
  arr_name: string;
  journey_name: string | null;
  journey_name_zh: string | null;
}

function toFlightSummary(row: FlightSummaryRow): FlightSummary {
  return {
    id: row.id,
    displayNumber: `${row.airline_iata}${row.flight_number}`,
    flightDate: row.flight_date,
    isDomestic: row.is_domestic === 1,
    routeDistanceKm: row.route_distance_km,
    estimatedHours: row.estimated_hours,
    airlineName: row.airline_name,
    airlineNameZh: row.airline_name_zh,
    departureLabel: row.dep_iata,
    arrivalLabel: row.arr_iata,
    journeyName: row.journey_name,
    journeyNameZh: row.journey_name_zh,
  };
}

export async function listFlights(db: D1Database): Promise<FlightSummary[]> {
  const { results } = await db.prepare(`
    SELECT f.id, f.flight_number, f.flight_date, f.is_domestic, f.route_distance_km, f.estimated_hours,
      al.iata_code AS airline_iata, al.name AS airline_name, al.name_zh AS airline_name_zh,
      dep.iata_code AS dep_iata, dep.name AS dep_name, dep.name_zh AS dep_name_zh,
      arr.iata_code AS arr_iata, arr.name AS arr_name, arr.name_zh AS arr_name_zh,
      j.name AS journey_name, j.name_zh AS journey_name_zh
    FROM atlas_flights f
    INNER JOIN atlas_airlines al ON al.id = f.airline_id
    INNER JOIN atlas_airports dep ON dep.id = f.departure_airport_id
    INNER JOIN atlas_airports arr ON arr.id = f.arrival_airport_id
    LEFT JOIN atlas_journeys j ON j.id = f.journey_id
    ORDER BY f.flight_date DESC, f.id DESC
  `).all<FlightSummaryRow>();
  return results.map(toFlightSummary);
}

export async function getFlightById(db: D1Database, id: number): Promise<Flight | null> {
  const row = await db
    .prepare(`SELECT ${FLIGHT_COLUMNS} FROM atlas_flights WHERE id = ?1`)
    .bind(id)
    .first<FlightRow>();
  return row ? toFlight(row) : null;
}

function writeError(error: unknown): never {
  if (isUniqueConstraintError(error)) {
    throw new DataError("conflict", "该航班记录已存在", {
      flightNumber: "同一天、同一航司、同一航线的航班已存在",
    });
  }
  throw error;
}

export async function createFlight(db: D1Database, input: FlightInput): Promise<Flight> {
  const value = validated(input);
  const metrics = await resolveFlightRelations(db, value);
  try {
    const row = await db
      .prepare(`
        INSERT INTO atlas_flights (
          airline_id, flight_number, flight_date, departure_airport_id, arrival_airport_id,
          journey_id, aircraft_type_id, aircraft_registration, scheduled_departure_local,
          scheduled_arrival_local, cabin_class, seat_number, notes, great_circle_km,
          route_factor, route_distance_km, estimated_hours, formula_version, is_domestic
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
        RETURNING ${FLIGHT_COLUMNS}
      `)
      .bind(
        value.airlineId,
        value.flightNumber,
        value.flightDate,
        value.departureAirportId,
        value.arrivalAirportId,
        value.journeyId,
        value.aircraftTypeId,
        value.aircraftRegistration,
        value.scheduledDepartureLocal,
        value.scheduledArrivalLocal,
        value.cabinClass,
        value.seatNumber,
        value.notes,
        metrics.greatCircleKm,
        metrics.routeFactor,
        metrics.routeDistanceKm,
        metrics.estimatedHours,
        metrics.formulaVersion,
        metrics.isDomestic ? 1 : 0,
      )
      .first<FlightRow>();
    if (!row) throw new Error("Insert returned no flight.");
    return toFlight(row);
  } catch (error) {
    return writeError(error);
  }
}

export async function updateFlight(
  db: D1Database,
  id: number,
  input: FlightInput,
): Promise<Flight> {
  const value = validated(input);
  const metrics = await resolveFlightRelations(db, value);
  try {
    const row = await db
      .prepare(`
        UPDATE atlas_flights SET
          airline_id = ?1, flight_number = ?2, flight_date = ?3,
          departure_airport_id = ?4, arrival_airport_id = ?5,
          journey_id = ?6, aircraft_type_id = ?7,
          aircraft_registration = ?8, scheduled_departure_local = ?9,
          scheduled_arrival_local = ?10, cabin_class = ?11, seat_number = ?12, notes = ?13,
          great_circle_km = ?14, route_factor = ?15, route_distance_km = ?16,
          estimated_hours = ?17, formula_version = ?18, is_domestic = ?19,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?20
        RETURNING ${FLIGHT_COLUMNS}
      `)
      .bind(
        value.airlineId,
        value.flightNumber,
        value.flightDate,
        value.departureAirportId,
        value.arrivalAirportId,
        value.journeyId,
        value.aircraftTypeId,
        value.aircraftRegistration,
        value.scheduledDepartureLocal,
        value.scheduledArrivalLocal,
        value.cabinClass,
        value.seatNumber,
        value.notes,
        metrics.greatCircleKm,
        metrics.routeFactor,
        metrics.routeDistanceKm,
        metrics.estimatedHours,
        metrics.formulaVersion,
        metrics.isDomestic ? 1 : 0,
        id,
      )
      .first<FlightRow>();
    if (!row) throw new DataError("not_found", "航班不存在");
    return toFlight(row);
  } catch (error) {
    return writeError(error);
  }
}

export async function deleteFlight(db: D1Database, id: number): Promise<void> {
  const result = await db.prepare("DELETE FROM atlas_flights WHERE id = ?1").bind(id).run();
  if (result.meta.changes === 0) throw new DataError("not_found", "航班不存在");
}
