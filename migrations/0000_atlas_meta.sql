CREATE TABLE IF NOT EXISTS atlas_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO atlas_meta (key, value)
VALUES ('schema_status', 'ready');
