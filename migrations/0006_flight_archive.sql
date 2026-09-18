PRAGMA foreign_keys = ON;

-- Flight archive (Flight handoff §3). Four reference tables plus the flights
-- table. Distances, duration, domestic/international and formula version are
-- derived server-side on every write (handoff §4/§4.5); nothing here is ever
-- taken from the client.
--
-- `atlas_flights.journey_id` is nullable and SET NULL on delete so a Flight
-- outlives its optional Journey (handoff §2.1). `airline_id`, `aircraft_type_id`
-- and both airports are RESTRICT so a referenced reference row cannot be
-- removed while a Flight still points at it (handoff §6).

CREATE TABLE atlas_airports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  iata_code TEXT NOT NULL UNIQUE,
  icao_code TEXT UNIQUE,

  name TEXT NOT NULL,
  name_zh TEXT,

  city TEXT NOT NULL,
  city_zh TEXT,

  country TEXT NOT NULL,
  country_code TEXT NOT NULL,
  region TEXT,

  latitude REAL NOT NULL,
  longitude REAL NOT NULL,

  timezone TEXT NOT NULL,
  elevation_ft INTEGER,
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  CHECK (length(iata_code) = 3),
  CHECK (icao_code IS NULL OR length(icao_code) = 4),
  CHECK (length(name) BETWEEN 1 AND 160),
  CHECK (name_zh IS NULL OR length(name_zh) <= 160),
  CHECK (length(city) BETWEEN 1 AND 120),
  CHECK (city_zh IS NULL OR length(city_zh) <= 120),
  CHECK (length(country) BETWEEN 1 AND 100),
  CHECK (length(country_code) = 3),
  CHECK (region IS NULL OR length(region) <= 120),
  CHECK (latitude BETWEEN -90.0 AND 90.0),
  CHECK (longitude BETWEEN -180.0 AND 180.0),
  CHECK (length(timezone) BETWEEN 1 AND 64),
  CHECK (elevation_ft IS NULL OR elevation_ft BETWEEN -2000 AND 30000),
  CHECK (notes IS NULL OR length(notes) <= 3000)
);

CREATE INDEX atlas_airports_country_idx
ON atlas_airports(country_code, city);

CREATE INDEX atlas_airports_name_idx
ON atlas_airports(name);

CREATE TABLE atlas_airlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  iata_code TEXT NOT NULL UNIQUE,
  icao_code TEXT UNIQUE,

  name TEXT NOT NULL,
  name_zh TEXT,

  country TEXT NOT NULL,
  country_code TEXT NOT NULL,

  callsign TEXT,
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  CHECK (length(iata_code) = 2),
  CHECK (icao_code IS NULL OR length(icao_code) = 3),
  CHECK (length(name) BETWEEN 1 AND 160),
  CHECK (name_zh IS NULL OR length(name_zh) <= 160),
  CHECK (length(country) BETWEEN 1 AND 100),
  CHECK (length(country_code) = 3),
  CHECK (callsign IS NULL OR length(callsign) <= 80),
  CHECK (notes IS NULL OR length(notes) <= 3000)
);

CREATE TABLE atlas_aircraft_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  icao_code TEXT NOT NULL UNIQUE,
  manufacturer TEXT NOT NULL,
  model TEXT NOT NULL,
  model_zh TEXT,
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  CHECK (length(icao_code) BETWEEN 2 AND 4),
  CHECK (length(manufacturer) BETWEEN 1 AND 100),
  CHECK (length(model) BETWEEN 1 AND 160),
  CHECK (model_zh IS NULL OR length(model_zh) <= 160),
  CHECK (notes IS NULL OR length(notes) <= 3000)
);

CREATE TABLE atlas_flights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  airline_id INTEGER NOT NULL,
  flight_number TEXT NOT NULL,
  flight_date TEXT NOT NULL,

  departure_airport_id INTEGER NOT NULL,
  arrival_airport_id INTEGER NOT NULL,

  journey_id INTEGER,
  aircraft_type_id INTEGER,

  aircraft_registration TEXT,
  scheduled_departure_local TEXT,
  scheduled_arrival_local TEXT,

  cabin_class TEXT,
  seat_number TEXT,
  notes TEXT,

  great_circle_km REAL NOT NULL,
  route_factor REAL NOT NULL,
  route_distance_km REAL NOT NULL,
  estimated_hours REAL NOT NULL,
  formula_version INTEGER NOT NULL DEFAULT 1,

  is_domestic INTEGER NOT NULL,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  FOREIGN KEY (airline_id)
    REFERENCES atlas_airlines(id) ON DELETE RESTRICT,
  FOREIGN KEY (departure_airport_id)
    REFERENCES atlas_airports(id) ON DELETE RESTRICT,
  FOREIGN KEY (arrival_airport_id)
    REFERENCES atlas_airports(id) ON DELETE RESTRICT,
  FOREIGN KEY (journey_id)
    REFERENCES atlas_journeys(id) ON DELETE SET NULL,
  FOREIGN KEY (aircraft_type_id)
    REFERENCES atlas_aircraft_types(id) ON DELETE RESTRICT,

  CHECK (
    length(flight_number) BETWEEN 1 AND 6
    AND flight_number NOT GLOB '*[^0-9]*'
  ),
  CHECK (
    length(flight_date) = 10
    AND flight_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  CHECK (departure_airport_id <> arrival_airport_id),
  CHECK (aircraft_registration IS NULL OR length(aircraft_registration) <= 20),
  CHECK (scheduled_departure_local IS NULL OR length(scheduled_departure_local) = 16),
  CHECK (scheduled_arrival_local IS NULL OR length(scheduled_arrival_local) = 16),
  CHECK (
    cabin_class IS NULL OR
    cabin_class IN ('economy', 'premium_economy', 'business', 'first', 'other')
  ),
  CHECK (seat_number IS NULL OR length(seat_number) <= 10),
  CHECK (notes IS NULL OR length(notes) <= 3000),
  CHECK (great_circle_km > 0),
  CHECK (route_factor > 1),
  CHECK (route_distance_km > 0),
  CHECK (estimated_hours > 0),
  CHECK (formula_version >= 1),
  CHECK (is_domestic IN (0, 1)),

  UNIQUE (
    airline_id,
    flight_number,
    flight_date,
    departure_airport_id,
    arrival_airport_id
  )
);

CREATE INDEX atlas_flights_date_idx
ON atlas_flights(flight_date DESC, id DESC);

CREATE INDEX atlas_flights_type_date_idx
ON atlas_flights(is_domestic, flight_date DESC);

CREATE INDEX atlas_flights_airline_idx
ON atlas_flights(airline_id, flight_date DESC);

CREATE INDEX atlas_flights_aircraft_idx
ON atlas_flights(aircraft_type_id, flight_date DESC);

CREATE INDEX atlas_flights_departure_idx
ON atlas_flights(departure_airport_id);

CREATE INDEX atlas_flights_arrival_idx
ON atlas_flights(arrival_airport_id);

CREATE INDEX atlas_flights_journey_idx
ON atlas_flights(journey_id);
