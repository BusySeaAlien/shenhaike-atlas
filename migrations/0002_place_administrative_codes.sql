PRAGMA foreign_keys = ON;

-- Machine-readable administrative identity for Footprint (handoff §21).
--
-- `country` / `region` stay as free text and remain the human-facing labels;
-- these two columns are what the map and statistics match on. They are derived
-- from the place coordinates by resolveAdministrativeLocation(), never typed by
-- hand, so they are nullable only to allow backfilling existing rows.
--
--   sovereign_country_code  ISO-3166-shaped ADM0 code, e.g. CHN, FRA
--   admin1_code             GB/T 2260 six-digit province code, e.g. 650000

ALTER TABLE places
ADD COLUMN sovereign_country_code TEXT
  CHECK (sovereign_country_code IS NULL OR length(sovereign_country_code) BETWEEN 2 AND 8);

ALTER TABLE places
ADD COLUMN admin1_code TEXT
  CHECK (admin1_code IS NULL OR length(admin1_code) = 6);

-- Footprint queries group by these; without them D1 scans the whole table.
CREATE INDEX places_sovereign_country_code_idx
  ON places (sovereign_country_code);
