PRAGMA foreign_keys = OFF;

DROP TRIGGER IF EXISTS atlas_visits_date_within_journey_insert;
DROP TRIGGER IF EXISTS atlas_visits_date_within_journey_update;
DROP TRIGGER IF EXISTS atlas_journey_dates_contain_visits;

ALTER TABLE atlas_journeys RENAME TO atlas_journeys_exact_dates;
ALTER TABLE atlas_visits RENAME TO atlas_visits_exact_dates;

CREATE TABLE atlas_journeys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE CHECK (length(slug) BETWEEN 1 AND 100),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  name_zh TEXT CHECK (name_zh IS NULL OR length(name_zh) <= 160),
  start_date TEXT NOT NULL CHECK (
    (length(start_date) = 4 AND start_date GLOB '[0-9][0-9][0-9][0-9]') OR
    (length(start_date) = 7 AND start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]' AND substr(start_date, 6, 2) BETWEEN '01' AND '12') OR
    (length(start_date) = 10 AND start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(start_date) = start_date)
  ),
  end_date TEXT NOT NULL CHECK (
    (length(end_date) = 4 AND end_date GLOB '[0-9][0-9][0-9][0-9]') OR
    (length(end_date) = 7 AND end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]' AND substr(end_date, 6, 2) BETWEEN '01' AND '12') OR
    (length(end_date) = 10 AND end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(end_date) = end_date)
  ),
  description TEXT CHECK (description IS NULL OR length(description) <= 5000),
  cover TEXT CHECK (cover IS NULL OR length(cover) <= 2048),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    CASE length(start_date) WHEN 4 THEN start_date || '-01-01' WHEN 7 THEN start_date || '-01' ELSE start_date END
    <=
    CASE length(end_date) WHEN 4 THEN end_date || '-12-31' WHEN 7 THEN date(end_date || '-01', '+1 month', '-1 day') ELSE end_date END
  )
);

CREATE TABLE atlas_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id INTEGER NOT NULL,
  journey_id INTEGER NOT NULL,
  visited_at TEXT NOT NULL CHECK (
    (length(visited_at) = 4 AND visited_at GLOB '[0-9][0-9][0-9][0-9]') OR
    (length(visited_at) = 7 AND visited_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]' AND substr(visited_at, 6, 2) BETWEEN '01' AND '12') OR
    (length(visited_at) = 10 AND visited_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(visited_at) = visited_at)
  ),
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 3000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (place_id) REFERENCES atlas_places(id) ON DELETE RESTRICT,
  FOREIGN KEY (journey_id) REFERENCES atlas_journeys(id) ON DELETE CASCADE,
  UNIQUE (journey_id, sequence)
);

INSERT INTO atlas_journeys SELECT * FROM atlas_journeys_exact_dates;
INSERT INTO atlas_visits SELECT * FROM atlas_visits_exact_dates;

DROP TABLE atlas_visits_exact_dates;
DROP TABLE atlas_journeys_exact_dates;

CREATE INDEX atlas_visits_place_id_idx ON atlas_visits(place_id);
CREATE INDEX atlas_visits_journey_sequence_idx ON atlas_visits(journey_id, sequence);
CREATE INDEX atlas_visits_visited_at_idx ON atlas_visits(visited_at DESC, id DESC);

CREATE TRIGGER atlas_visits_date_within_journey_insert
BEFORE INSERT ON atlas_visits
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM atlas_journeys WHERE id = NEW.journey_id
    AND CASE length(NEW.visited_at) WHEN 4 THEN NEW.visited_at || '-12-31' WHEN 7 THEN date(NEW.visited_at || '-01', '+1 month', '-1 day') ELSE NEW.visited_at END
      >= CASE length(start_date) WHEN 4 THEN start_date || '-01-01' WHEN 7 THEN start_date || '-01' ELSE start_date END
    AND CASE length(NEW.visited_at) WHEN 4 THEN NEW.visited_at || '-01-01' WHEN 7 THEN NEW.visited_at || '-01' ELSE NEW.visited_at END
      <= CASE length(end_date) WHEN 4 THEN end_date || '-12-31' WHEN 7 THEN date(end_date || '-01', '+1 month', '-1 day') ELSE end_date END
)
BEGIN
  SELECT RAISE(ABORT, 'visit date outside journey range');
END;

CREATE TRIGGER atlas_visits_date_within_journey_update
BEFORE UPDATE OF journey_id, visited_at ON atlas_visits
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM atlas_journeys WHERE id = NEW.journey_id
    AND CASE length(NEW.visited_at) WHEN 4 THEN NEW.visited_at || '-12-31' WHEN 7 THEN date(NEW.visited_at || '-01', '+1 month', '-1 day') ELSE NEW.visited_at END
      >= CASE length(start_date) WHEN 4 THEN start_date || '-01-01' WHEN 7 THEN start_date || '-01' ELSE start_date END
    AND CASE length(NEW.visited_at) WHEN 4 THEN NEW.visited_at || '-01-01' WHEN 7 THEN NEW.visited_at || '-01' ELSE NEW.visited_at END
      <= CASE length(end_date) WHEN 4 THEN end_date || '-12-31' WHEN 7 THEN date(end_date || '-01', '+1 month', '-1 day') ELSE end_date END
)
BEGIN
  SELECT RAISE(ABORT, 'visit date outside journey range');
END;

CREATE TRIGGER atlas_journey_dates_contain_visits
BEFORE UPDATE OF start_date, end_date ON atlas_journeys
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM atlas_visits WHERE journey_id = NEW.id
    AND (
      CASE length(visited_at) WHEN 4 THEN visited_at || '-12-31' WHEN 7 THEN date(visited_at || '-01', '+1 month', '-1 day') ELSE visited_at END
        < CASE length(NEW.start_date) WHEN 4 THEN NEW.start_date || '-01-01' WHEN 7 THEN NEW.start_date || '-01' ELSE NEW.start_date END
      OR
      CASE length(visited_at) WHEN 4 THEN visited_at || '-01-01' WHEN 7 THEN visited_at || '-01' ELSE visited_at END
        > CASE length(NEW.end_date) WHEN 4 THEN NEW.end_date || '-12-31' WHEN 7 THEN date(NEW.end_date || '-01', '+1 month', '-1 day') ELSE NEW.end_date END
    )
)
BEGIN
  SELECT RAISE(ABORT, 'journey dates exclude existing visits');
END;

PRAGMA foreign_keys = ON;
