import { describe, expect, it, vi } from "vitest";
import type { FlightInput } from "../../types/domain";
import { haversineKm } from "../flight-math";
import { createAirport, updateAirport } from "./airports";
import { createFlight } from "./flights";
import { getFlightArchiveData } from "./public";

const PVG = { id: 1, latitude: 31.1443, longitude: 121.8083, country_code: "CHN" };
const PEK = { id: 2, latitude: 40.0799, longitude: 116.6031, country_code: "CHN" };
const HKG = { id: 3, latitude: 22.308, longitude: 113.9185, country_code: "HKG" };

const AIRPORTS = { 1: PVG, 2: PEK, 3: HKG };

function airportRow(id: number) {
  const airport = AIRPORTS[id as keyof typeof AIRPORTS];
  return {
    id,
    iata_code: id === 1 ? "PVG" : id === 2 ? "PEK" : "HKG",
    icao_code: null,
    name: "Airport",
    name_zh: null,
    city: "City",
    city_zh: null,
    country: "China",
    country_code: airport.country_code,
    region: null,
    latitude: airport.latitude,
    longitude: airport.longitude,
    timezone: "Asia/Shanghai",
    elevation_ft: null,
    notes: null,
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:00.000Z",
  };
}

function flightRow(id: number) {
  return {
    id,
    airline_id: 1,
    flight_number: "5123",
    flight_date: "2026-08-14",
    departure_airport_id: 1,
    arrival_airport_id: 2,
    journey_id: null,
    aircraft_type_id: null,
    aircraft_registration: null,
    scheduled_departure_local: null,
    scheduled_arrival_local: null,
    cabin_class: null,
    seat_number: null,
    notes: null,
    great_circle_km: 1099,
    route_factor: 1.08,
    route_distance_km: 1187,
    estimated_hours: 1.7,
    formula_version: 1,
    is_domestic: 1,
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:00.000Z",
  };
}

function fakeDb(options: {
  onFirst?: (sql: string, values: unknown[]) => unknown;
  onAll?: (sql: string, values: unknown[]) => { results: unknown[] };
} = {}) {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const batch = vi.fn(async (_statements: unknown[]) => {});
  const prepare = vi.fn((sql: string) => {
    const statement = {
      sql,
      values: [] as unknown[],
      bind(...values: unknown[]) {
        this.values = values;
        return this;
      },
      async first() {
        return options.onFirst ? options.onFirst(sql, this.values) : null;
      },
      async all() {
        return options.onAll ? options.onAll(sql, this.values) : { results: [] };
      },
      async run() {
        return { meta: { changes: 1 } };
      },
    };
    statements.push(statement);
    return statement;
  });
  return { db: { prepare, batch } as unknown as D1Database, statements, batch };
}

function flightInput(overrides: Partial<FlightInput> = {}): FlightInput {
  return {
    airlineId: 1,
    flightNumber: "5123",
    flightDate: "2026-08-14",
    departureAirportId: 1,
    arrivalAirportId: 2,
    ...overrides,
  };
}

describe("createFlight derived values", () => {
  it("binds server-computed d/k/D/T and the domestic flag, never client values", async () => {
    const { db, statements } = fakeDb({
      onFirst: (sql, values) => {
        if (sql.includes("atlas_airlines")) return { id: 1 };
        if (sql.includes("atlas_airports")) return airportRow(Number(values[0]));
        if (sql.includes("INSERT INTO atlas_flights")) return flightRow(1);
        return null;
      },
    });

    await createFlight(db, flightInput());

    const insert = statements.find((statement) => statement.sql.includes("INSERT INTO atlas_flights"))!;
    // Bind order (index 0-based): 13=great_circle_km, 14=route_factor,
    // 15=route_distance_km, 16=estimated_hours, 18=is_domestic.
    const expectedGreatCircle = haversineKm(PVG, PEK);
    expect(insert.values[13]).toBeCloseTo(expectedGreatCircle, 6);
    expect(insert.values[14]).toBe(1.08);
    expect(insert.values[15]).toBeCloseTo(expectedGreatCircle * 1.08, 6);
    expect(insert.values[16]).toBeGreaterThan(0);
    expect(insert.values[18]).toBe(1); // domestic
  });

  it("classifies a mainland↔Hong Kong leg as international", async () => {
    const { db, statements } = fakeDb({
      onFirst: (sql, values) => {
        if (sql.includes("atlas_airlines")) return { id: 1 };
        if (sql.includes("atlas_airports")) return airportRow(Number(values[0]));
        if (sql.includes("INSERT INTO atlas_flights")) return flightRow(1);
        return null;
      },
    });

    await createFlight(db, flightInput({ arrivalAirportId: 3 }));

    const insert = statements.find((statement) => statement.sql.includes("INSERT INTO atlas_flights"))!;
    expect(insert.values[18]).toBe(0); // international
  });
});

describe("updateAirport recalculation", () => {
  it("recomputes related flights in a batch when the position moves", async () => {
    const movedAirport = {
      ...airportRow(1),
      latitude: 30.0,
      longitude: 120.0,
    };
    const { db, batch } = fakeDb({
      onFirst: (sql) => {
        // The existing airport still sits at its old coordinates, so the move
        // triggers a recalculation.
        if (sql.includes("FROM atlas_airports WHERE id")) return airportRow(1);
        return null;
      },
      onAll: (sql) => {
        if (sql.includes("FROM atlas_flights f")) {
          return {
            results: [
              {
                id: 7,
                departure_airport_id: 1,
                arrival_airport_id: 2,
                dep_latitude: 31.1443,
                dep_longitude: 121.8083,
                dep_country_code: "CHN",
                arr_latitude: 40.0799,
                arr_longitude: 116.6031,
                arr_country_code: "CHN",
              },
            ],
          };
        }
        return { results: [] };
      },
    });

    await updateAirport(db, 1, {
      iataCode: "PVG",
      name: "Shanghai Pudong International Airport",
      city: "Shanghai",
      country: "China",
      latitude: 30.0,
      longitude: 120.0,
      timezone: "Asia/Shanghai",
    });

    expect(batch).toHaveBeenCalledTimes(1);
    const statements = batch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    const flightUpdate = statements.find((statement) => statement.sql.includes("UPDATE atlas_flights"))!;
    // The moved airport (id 1) was the departure, so the recomputed distance
    // uses its new coordinates and PEK's unchanged ones.
    expect(flightUpdate.values[0]).toBeCloseTo(haversineKm(movedAirport, PEK), 6);
    expect(flightUpdate.values[4]).toBe(1); // still domestic
  });
});

describe("getFlightArchiveData", () => {
  it("reads everything in a single query and de-duplicates airports", async () => {
    let prepareCalls = 0;
    const db = {
      prepare: vi.fn((sql: string) => {
        prepareCalls += 1;
        return {
          sql,
          bind() {
            return this;
          },
          async all() {
            return {
              results: [
                {
                  id: 1,
                  flight_number: "5123",
                  flight_date: "2026-08-14",
                  is_domestic: 1,
                  great_circle_km: 1099,
                  route_distance_km: 1187,
                  estimated_hours: 1.7,
                  airline_iata: "MU",
                  airline_name: "China Eastern Airlines",
                  airline_name_zh: "中国东方航空",
                  aircraft_icao: "A320",
                  aircraft_manufacturer: "Airbus",
                  aircraft_model: "A320-200",
                  dep_id: 1,
                  dep_iata: "PVG",
                  dep_name: "Shanghai Pudong International Airport",
                  dep_name_zh: "上海浦东国际机场",
                  dep_city: "Shanghai",
                  dep_city_zh: "上海",
                  dep_country: "China",
                  dep_country_code: "CHN",
                  dep_latitude: 31.1443,
                  dep_longitude: 121.8083,
                  arr_id: 2,
                  arr_iata: "PEK",
                  arr_name: "Beijing Capital International Airport",
                  arr_name_zh: "北京首都国际机场",
                  arr_city: "Beijing",
                  arr_city_zh: "北京",
                  arr_country: "China",
                  arr_country_code: "CHN",
                  arr_latitude: 40.0799,
                  arr_longitude: 116.6031,
                  journey_name: null,
                  journey_name_zh: null,
                },
                {
                  id: 2,
                  flight_number: "5124",
                  flight_date: "2026-08-15",
                  is_domestic: 0,
                  great_circle_km: 1234,
                  route_distance_km: 1333,
                  estimated_hours: 2.1,
                  airline_iata: "MU",
                  airline_name: "China Eastern Airlines",
                  airline_name_zh: "中国东方航空",
                  aircraft_icao: null,
                  aircraft_manufacturer: null,
                  aircraft_model: null,
                  dep_id: 1,
                  dep_iata: "PVG",
                  dep_name: "Shanghai Pudong International Airport",
                  dep_name_zh: "上海浦东国际机场",
                  dep_city: "Shanghai",
                  dep_city_zh: "上海",
                  dep_country: "China",
                  dep_country_code: "CHN",
                  dep_latitude: 31.1443,
                  dep_longitude: 121.8083,
                  arr_id: 3,
                  arr_iata: "HKG",
                  arr_name: "Hong Kong International Airport",
                  arr_name_zh: "香港国际机场",
                  arr_city: "Hong Kong",
                  arr_city_zh: "香港",
                  arr_country: "Hong Kong",
                  arr_country_code: "HKG",
                  arr_latitude: 22.308,
                  arr_longitude: 113.9185,
                  journey_name: "Xinjiang 2026",
                  journey_name_zh: "新疆 2026",
                },
              ],
            };
          },
        };
      }),
    } as unknown as D1Database;

    const data = await getFlightArchiveData(db);

    // Two flights share PVG, so only three unique airports survive.
    expect(data.airports.map((airport) => airport.iataCode).sort()).toEqual(["HKG", "PEK", "PVG"]);
    expect(data.flights).toHaveLength(2);
    expect(data.flights[0].displayNumber).toBe("MU5123");
    expect(data.flights[0].aircraftLabel).toBe("A320 · Airbus A320-200");
    expect(data.flights[1].journeyName).toBe("Xinjiang 2026");
    expect(data.years).toEqual(["2026"]);
    expect(prepareCalls).toBe(1); // no N+1
  });
});

describe("createAirport derives the country code", () => {
  it("binds the ISO3 derived from the country name", async () => {
    const { db, statements } = fakeDb({
      onFirst: (sql) => {
        if (sql.includes("INSERT INTO atlas_airports")) return airportRow(1);
        return null;
      },
    });

    await createAirport(db, {
      iataCode: "pvg",
      name: "Shanghai Pudong International Airport",
      city: "Shanghai",
      country: "China",
      latitude: 31.1443,
      longitude: 121.8083,
      timezone: "Asia/Shanghai",
    });

    const insert = statements.find((statement) => statement.sql.includes("INSERT INTO atlas_airports"))!;
    expect(insert.values[0]).toBe("PVG"); // uppercased
    expect(insert.values[7]).toBe("CHN"); // derived ISO3 at position 8
  });
});
