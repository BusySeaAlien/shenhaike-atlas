PRAGMA foreign_keys = ON;

INSERT INTO atlas_places (slug, name, name_zh, country, region, city, latitude, longitude, description)
VALUES
  ('sayram-lake', 'Sayram Lake', '赛里木湖', 'China', 'Xinjiang', NULL, 44.6090, 81.1740, 'A high-altitude lake in the Tianshan Mountains.'),
  ('xiata', 'Xiata', '夏塔', 'China', 'Xinjiang', 'Zhaosu', 42.4667, 80.7833, 'A valley and ancient mountain passage.'),
  ('kalajun', 'Kalajun Grassland', '喀拉峻草原', 'China', 'Xinjiang', 'Tekes', 43.0500, 82.1500, 'Rolling alpine grassland.'),
  ('shanghai-pudong-airport', 'Shanghai Pudong International Airport', '上海浦东国际机场', 'China', 'Shanghai', 'Shanghai', 31.1443, 121.8083, 'A recurring point of departure and return.'),
  ('west-lake', 'West Lake', '西湖', 'China', 'Zhejiang', 'Hangzhou', 30.2431, 120.1503, 'A lake shaped by paths, weather, and return atlas_visits.')
ON CONFLICT(slug) DO UPDATE SET
  name = excluded.name,
  name_zh = excluded.name_zh,
  country = excluded.country,
  region = excluded.region,
  city = excluded.city,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  description = excluded.description,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

INSERT INTO atlas_journeys (slug, name, name_zh, start_date, end_date, description)
VALUES
  ('xinjiang-2026', 'Xinjiang 2026', '新疆 2026', '2026-08-14', '2026-08-24', 'A summer journey through the Ili valley.'),
  ('year-crossing-2025', 'Year Crossing 2025', '跨年 2025', '2025-12-29', '2026-01-03', 'A short journey spanning two calendar years.'),
  ('hangzhou-return-2026', 'Hangzhou Return', '重返杭州', '2026-04-03', '2026-04-05', 'A return to a familiar lake.'),
  ('future-empty-journey', 'Future Empty Journey', '待出发', '2027-01-01', '2027-01-02', 'An intentional empty state for development.')
ON CONFLICT(slug) DO UPDATE SET
  name = excluded.name,
  name_zh = excluded.name_zh,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  description = excluded.description,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

DELETE FROM atlas_visits
WHERE journey_id IN (
  SELECT id FROM atlas_journeys
  WHERE slug IN ('xinjiang-2026', 'year-crossing-2025', 'hangzhou-return-2026')
);

INSERT INTO atlas_visits (place_id, journey_id, visited_at, sequence, notes)
VALUES
  ((SELECT id FROM atlas_places WHERE slug = 'shanghai-pudong-airport'), (SELECT id FROM atlas_journeys WHERE slug = 'xinjiang-2026'), '2026-08-14', 1, 'Departure.'),
  ((SELECT id FROM atlas_places WHERE slug = 'sayram-lake'), (SELECT id FROM atlas_journeys WHERE slug = 'xinjiang-2026'), '2026-08-17', 2, NULL),
  ((SELECT id FROM atlas_places WHERE slug = 'xiata'), (SELECT id FROM atlas_journeys WHERE slug = 'xinjiang-2026'), '2026-08-20', 3, NULL),
  ((SELECT id FROM atlas_places WHERE slug = 'kalajun'), (SELECT id FROM atlas_journeys WHERE slug = 'xinjiang-2026'), '2026-08-22', 4, NULL),
  ((SELECT id FROM atlas_places WHERE slug = 'shanghai-pudong-airport'), (SELECT id FROM atlas_journeys WHERE slug = 'xinjiang-2026'), '2026-08-24', 5, 'Return. The same place appears twice in one journey.'),
  ((SELECT id FROM atlas_places WHERE slug = 'shanghai-pudong-airport'), (SELECT id FROM atlas_journeys WHERE slug = 'year-crossing-2025'), '2025-12-29', 1, NULL),
  ((SELECT id FROM atlas_places WHERE slug = 'west-lake'), (SELECT id FROM atlas_journeys WHERE slug = 'year-crossing-2025'), '2025-12-31', 2, NULL),
  ((SELECT id FROM atlas_places WHERE slug = 'shanghai-pudong-airport'), (SELECT id FROM atlas_journeys WHERE slug = 'year-crossing-2025'), '2026-01-03', 3, NULL),
  ((SELECT id FROM atlas_places WHERE slug = 'west-lake'), (SELECT id FROM atlas_journeys WHERE slug = 'hangzhou-return-2026'), '2026-04-04', 1, 'A repeat visit in another journey.');
