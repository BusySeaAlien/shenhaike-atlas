PRAGMA foreign_keys = ON;

CREATE TABLE atlas_places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE
    CHECK (length(slug) BETWEEN 1 AND 100),
  name TEXT NOT NULL
    CHECK (length(name) BETWEEN 1 AND 160),
  name_zh TEXT
    CHECK (name_zh IS NULL OR length(name_zh) <= 160),
  country TEXT NOT NULL
    CHECK (length(country) BETWEEN 1 AND 100),
  region TEXT
    CHECK (region IS NULL OR length(region) <= 120),
  city TEXT
    CHECK (city IS NULL OR length(city) <= 120),
  latitude REAL NOT NULL
    CHECK (latitude BETWEEN -90.0 AND 90.0),
  longitude REAL NOT NULL
    CHECK (longitude BETWEEN -180.0 AND 180.0),
  description TEXT
    CHECK (description IS NULL OR length(description) <= 5000),
  cover TEXT
    CHECK (cover IS NULL OR length(cover) <= 2048),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE atlas_journeys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE
    CHECK (length(slug) BETWEEN 1 AND 100),
  name TEXT NOT NULL
    CHECK (length(name) BETWEEN 1 AND 160),
  name_zh TEXT
    CHECK (name_zh IS NULL OR length(name_zh) <= 160),
  start_date TEXT NOT NULL
    CHECK (length(start_date) = 10 AND start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  end_date TEXT NOT NULL
    CHECK (length(end_date) = 10 AND end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  description TEXT
    CHECK (description IS NULL OR length(description) <= 5000),
  cover TEXT
    CHECK (cover IS NULL OR length(cover) <= 2048),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (start_date <= end_date)
);

CREATE TABLE atlas_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id INTEGER NOT NULL,
  journey_id INTEGER NOT NULL,
  visited_at TEXT NOT NULL
    CHECK (length(visited_at) = 10 AND visited_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 3000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (place_id) REFERENCES atlas_places(id) ON DELETE RESTRICT,
  FOREIGN KEY (journey_id) REFERENCES atlas_journeys(id) ON DELETE CASCADE,
  UNIQUE (journey_id, sequence)
);

CREATE INDEX atlas_visits_place_id_idx ON atlas_visits(place_id);
CREATE INDEX atlas_visits_journey_sequence_idx ON atlas_visits(journey_id, sequence);
CREATE INDEX atlas_visits_visited_at_idx ON atlas_visits(visited_at DESC, id DESC);

CREATE TRIGGER atlas_visits_date_within_journey_insert
BEFORE INSERT ON atlas_visits
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM atlas_journeys
  WHERE id = NEW.journey_id
    AND NEW.visited_at BETWEEN start_date AND end_date
)
BEGIN
  SELECT RAISE(ABORT, 'visit date outside journey range');
END;

CREATE TRIGGER atlas_visits_date_within_journey_update
BEFORE UPDATE OF journey_id, visited_at ON atlas_visits
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM atlas_journeys
  WHERE id = NEW.journey_id
    AND NEW.visited_at BETWEEN start_date AND end_date
)
BEGIN
  SELECT RAISE(ABORT, 'visit date outside journey range');
END;

CREATE TRIGGER atlas_journey_dates_contain_visits
BEFORE UPDATE OF start_date, end_date ON atlas_journeys
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM atlas_visits
  WHERE journey_id = NEW.id
    AND visited_at NOT BETWEEN NEW.start_date AND NEW.end_date
)
BEGIN
  SELECT RAISE(ABORT, 'journey dates exclude existing visits');
END;
