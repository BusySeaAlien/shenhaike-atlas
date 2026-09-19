#!/usr/bin/env node
import fs from "node:fs";
import { calculateFlightMetrics } from "../src/lib/flight-math.ts";

const projectRoot = new URL("../", import.meta.url);
const sourceFiles = [
  "docs/航班-已结束-国内.csv",
  "docs/航班-已结束-国际港澳台.csv",
];

const additionalAirlines = [
  ["QR", "QTR", "Qatar Airways", "卡塔尔航空", "Qatar", "QAT", "Qatari", null],
  ["TK", "THY", "Turkish Airlines", "土耳其航空", "Turkey", "TUR", "Turkish", null],
  ["EK", "UAE", "Emirates", "阿联酋航空", "UAE", "ARE", "Emirates", null],
  ["MH", "MAS", "Malaysia Airlines", "马来西亚航空", "Malaysia", "MYS", "Malaysian", null],
  ["AK", "AXM", "AirAsia", "亚洲航空", "Malaysia", "MYS", "Red Cap", null],
  ["GA", "GIA", "Garuda Indonesia", "印尼鹰航", "Indonesia", "IDN", "Indonesia", null],
  ["OZ", "AAR", "Asiana Airlines", "韩亚航空", "Korea, Republic of", "KOR", "Asiana", null],
  ["AF", "AFR", "Air France", "法国航空", "France", "FRA", "Airfrans", null],
  ["AA", "AAL", "American Airlines", "美国航空", "United States", "USA", "American", null],
  ["KA", "HDA", "Cathay Dragon", "港龙航空", "Hong Kong", "HKG", "Dragon", "2020 年已并入国泰，仅供历史航班使用。"],
].map(([iata_code, icao_code, name, name_zh, country, country_code, callsign, notes]) => ({
  iata_code, icao_code, name, name_zh, country, country_code, callsign, notes,
}));

const additionalAirports = [
  ["DOH", "OTHH", "Hamad International Airport", "多哈哈马德国际机场", "Doha", "多哈", "Qatar", "QAT", 25.2731, 51.6081, "Asia/Qatar", 13, null],
  ["CMN", "GMMN", "Mohammed V International Airport", "卡萨布兰卡穆罕默德五世国际机场", "Casablanca", "卡萨布兰卡", "Morocco", "MAR", 33.3675, -7.59, "Africa/Casablanca", 656, null],
  ["IST", "LTFM", "Istanbul Airport", "伊斯坦布尔机场", "Istanbul", "伊斯坦布尔", "Turkey", "TUR", 41.2613, 28.7419, "Europe/Istanbul", 325, null],
  ["NBO", "HKJK", "Jomo Kenyatta International Airport", "内罗毕焦莫·肯雅塔国际机场", "Nairobi", "内罗毕", "Kenya", "KEN", -1.3192, 36.9278, "Africa/Nairobi", 5330, null],
  ["DXB", "OMDB", "Dubai International Airport", "迪拜国际机场", "Dubai", "迪拜", "UAE", "ARE", 25.2528, 55.3644, "Asia/Dubai", 62, null],
  ["NCE", "LFMN", "Nice Côte d'Azur Airport", "尼斯蔚蓝海岸机场", "Nice", "尼斯", "France", "FRA", 43.6584, 7.2159, "Europe/Paris", 12, null],
  ["KUL", "WMKK", "Kuala Lumpur International Airport", "吉隆坡国际机场", "Kuala Lumpur", "吉隆坡", "Malaysia", "MYS", 2.7456, 101.7099, "Asia/Kuala_Lumpur", 70, null],
  ["JHB", "WMKJ", "Senai International Airport", "新山士乃国际机场", "Johor Bahru", "新山", "Malaysia", "MYS", 1.6413, 103.6696, "Asia/Kuala_Lumpur", 135, null],
  ["CGK", "WIII", "Soekarno-Hatta International Airport", "苏加诺-哈达国际机场", "Jakarta", "雅加达", "Indonesia", "IDN", -6.1256, 106.6559, "Asia/Jakarta", 34, null],
  ["SIN", "WSSS", "Singapore Changi Airport", "新加坡樟宜机场", "Singapore", "新加坡", "Singapore", "SGP", 1.3644, 103.9915, "Asia/Singapore", 22, null],
  ["DPS", "WADD", "Ngurah Rai International Airport", "巴厘岛伍拉·赖国际机场", "Denpasar", "登巴萨", "Indonesia", "IDN", -8.7482, 115.1672, "Asia/Makassar", 14, null],
  ["ICN", "RKSI", "Incheon International Airport", "仁川国际机场", "Seoul", "首尔", "Korea, Republic of", "KOR", 37.4602, 126.4407, "Asia/Seoul", 23, null],
  ["GMP", "RKSS", "Gimpo International Airport", "金浦国际机场", "Seoul", "首尔", "Korea, Republic of", "KOR", 37.5583, 126.7906, "Asia/Seoul", 59, null],
  ["CDG", "LFPG", "Paris Charles de Gaulle Airport", "巴黎夏尔·戴高乐机场", "Paris", "巴黎", "France", "FRA", 49.0097, 2.5479, "Europe/Paris", 392, null],
  ["FCO", "LIRF", "Rome Fiumicino Leonardo da Vinci Airport", "罗马菲乌米奇诺机场", "Rome", "罗马", "Italy", "ITA", 41.8003, 12.2389, "Europe/Rome", 13, null],
  ["ORD", "KORD", "Chicago O'Hare International Airport", "芝加哥奥黑尔国际机场", "Chicago", "芝加哥", "United States", "USA", 41.9742, -87.9073, "America/Chicago", 672, null],
  ["GVA", "LSGG", "Geneva Airport", "日内瓦国际机场", "Geneva", "日内瓦", "Switzerland", "CHE", 46.2381, 6.109, "Europe/Zurich", 1411, null],
  ["MUC", "EDDM", "Munich Airport", "慕尼黑机场", "Munich", "慕尼黑", "Germany", "DEU", 48.3538, 11.7861, "Europe/Berlin", 1487, null],
  ["NAY", "ZBNY", "Beijing Nanyuan Airport", "北京南苑机场", "Beijing", "北京", "China", "CHN", 39.7825, 116.3878, "Asia/Shanghai", null, "2019 年 9 月已停运，仅供历史航班使用。"],
].map(([iata_code, icao_code, name, name_zh, city, city_zh, country, country_code, latitude, longitude, timezone, elevation_ft, notes]) => ({
  iata_code, icao_code, name, name_zh, city, city_zh, country, country_code, region: null,
  latitude, longitude, timezone, elevation_ft, notes,
}));

function parseCsv(text) {
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.replace(/\r$/, ""));
      records.push(record);
      record = [];
      field = "";
    } else field += character;
  }
  if (field || record.length) {
    record.push(field.replace(/\r$/, ""));
    records.push(record);
  }
  const [header, ...rows] = records.filter((row) => row.some((value) => value !== ""));
  return rows.map((row) => Object.fromEntries(header.map((column, index) => [column, row[index] ?? ""])));
}

function sqlValue(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function upsert(table, conflictColumn, columns, rows) {
  const values = rows.map((row) => `  (${columns.map((column) => sqlValue(row[column])).join(", ")})`).join(",\n");
  const updates = columns
    .filter((column) => column !== conflictColumn)
    .map((column) => `  ${column} = excluded.${column}`)
    .concat("  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
    .join(",\n");
  return `INSERT INTO ${table} (${columns.join(", ")})\nVALUES\n${values}\nON CONFLICT(${conflictColumn}) DO UPDATE SET\n${updates};`;
}

const currentAirports = JSON.parse(fs.readFileSync(new URL("data-source/atlas-airports-cn-hk-mo.json", projectRoot), "utf8"));
const airportsByIata = new Map([...currentAirports, ...additionalAirports].map((airport) => [airport.iata_code, airport]));
const sourceRows = sourceFiles.flatMap((path) => parseCsv(fs.readFileSync(new URL(path, projectRoot), "utf8").replace(/^\uFEFF/, "")));
const uniqueRows = new Map();
const duplicates = [];

for (const row of sourceRows) {
  const key = [row.airline_iata, row.flight_number, row.flight_date, row.departure_airport_iata, row.arrival_airport_iata].join("|");
  if (uniqueRows.has(key)) {
    duplicates.push({ kept: uniqueRows.get(key)["序号"], skipped: row["序号"], key });
    continue;
  }
  const departure = airportsByIata.get(row.departure_airport_iata);
  const arrival = airportsByIata.get(row.arrival_airport_iata);
  if (!departure || !arrival) throw new Error(`Row ${row["序号"]}: unknown airport`);
  if (!/^\d{1,6}$/.test(row.flight_number)) throw new Error(`Row ${row["序号"]}: invalid flight number`);
  const metrics = calculateFlightMetrics(
    { latitude: departure.latitude, longitude: departure.longitude, countryCode: departure.country_code },
    { latitude: arrival.latitude, longitude: arrival.longitude, countryCode: arrival.country_code },
  );
  const expected = [Number(row.great_circle_km), Number(row.route_factor), Number(row.route_distance_km), Number(row.estimated_hours)];
  const actual = [metrics.greatCircleKm, metrics.routeFactor, metrics.routeDistanceKm, metrics.estimatedHours];
  const tolerances = [0.011, 0.0001, 0.011, 0.00011];
  if (actual.some((value, index) => Math.abs(value - expected[index]) > tolerances[index])) {
    throw new Error(`Row ${row["序号"]}: derived metrics do not match project formula`);
  }
  if (Number(row.is_domestic) !== (metrics.isDomestic ? 1 : 0)) throw new Error(`Row ${row["序号"]}: domestic flag mismatch`);
  uniqueRows.set(key, { ...row, ...metrics });
}

const flightValues = [...uniqueRows.values()].map((row) => `  (
    (SELECT id FROM atlas_airlines WHERE iata_code = ${sqlValue(row.airline_iata)}),
    ${sqlValue(row.flight_number)}, ${sqlValue(row.flight_date)},
    (SELECT id FROM atlas_airports WHERE iata_code = ${sqlValue(row.departure_airport_iata)}),
    (SELECT id FROM atlas_airports WHERE iata_code = ${sqlValue(row.arrival_airport_iata)}),
    NULL, NULL, NULL, ${sqlValue(row.scheduled_departure_local)}, ${sqlValue(row.scheduled_arrival_local)},
    NULL, NULL, NULL, ${row.greatCircleKm}, ${row.routeFactor}, ${row.routeDistanceKm},
    ${row.estimatedHours}, ${row.formulaVersion}, ${row.isDomestic ? 1 : 0}
  )`).join(",\n");

const flightStatement = `INSERT INTO atlas_flights (
  airline_id, flight_number, flight_date, departure_airport_id, arrival_airport_id,
  journey_id, aircraft_type_id, aircraft_registration, scheduled_departure_local,
  scheduled_arrival_local, cabin_class, seat_number, notes, great_circle_km,
  route_factor, route_distance_km, estimated_hours, formula_version, is_domestic
)
VALUES
${flightValues}
ON CONFLICT(airline_id, flight_number, flight_date, departure_airport_id, arrival_airport_id) DO UPDATE SET
  scheduled_departure_local = excluded.scheduled_departure_local,
  scheduled_arrival_local = excluded.scheduled_arrival_local,
  great_circle_km = excluded.great_circle_km,
  route_factor = excluded.route_factor,
  route_distance_km = excluded.route_distance_km,
  estimated_hours = excluded.estimated_hours,
  formula_version = excluded.formula_version,
  is_domestic = excluded.is_domestic,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');`;

const output = [
  "-- Generated by scripts/generate-flight-history-sql.mjs. Do not edit by hand.",
  `-- Source rows: ${sourceRows.length}; unique flights: ${uniqueRows.size}; skipped duplicates: ${duplicates.map((item) => `${item.skipped} (kept ${item.kept})`).join(", ")}.`,
  upsert("atlas_airlines", "iata_code", ["iata_code", "icao_code", "name", "name_zh", "country", "country_code", "callsign", "notes"], additionalAirlines),
  upsert("atlas_airports", "iata_code", ["iata_code", "icao_code", "name", "name_zh", "city", "city_zh", "country", "country_code", "region", "latitude", "longitude", "timezone", "elevation_ft", "notes"], additionalAirports),
  flightStatement,
].join("\n\n");

const outputPath = new URL("flight-history-import.sql", projectRoot);
fs.writeFileSync(outputPath, `${output}\n`);
console.log(`Wrote ${outputPath.pathname}`);
console.log(`Rows: ${sourceRows.length} source, ${uniqueRows.size} unique, ${duplicates.length} duplicate rows skipped`);
