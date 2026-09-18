PRAGMA foreign_keys = ON;

-- Wishlist items are unvisited by definition: no FK to atlas_places, no slug,
-- no detail page (handoff §2.1). Coordinates are stored for the globe overlay;
-- administrative codes are NOT stored (wishlist never feeds Footprint), but
-- create/update still resolve the location to catch coordinate typos.
CREATE TABLE atlas_wishlist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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

CREATE INDEX atlas_wishlist_items_created_idx
  ON atlas_wishlist_items (created_at DESC, id DESC);
